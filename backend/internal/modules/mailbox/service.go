package mailbox

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"shiro-email/backend/internal/modules/domain"
	"shiro-email/backend/internal/modules/portal"
	sharedcache "shiro-email/backend/internal/shared/cache"
)

var ErrInvalidMailboxTTL = errors.New("expiresInHours must be greater than zero")
var ErrInvalidLocalPart = errors.New("invalid localPart")
var ErrDomainVerificationRequired = errors.New("subdomains must be verified before mailbox creation")

var localPartPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9._-]{1,63}$`)

type Service struct {
	repo          Repository
	domainRepo    domain.Repository
	messagePurger messagePurger
	unreadCounter unreadCounter
	cache         *sharedcache.JSONCache
}

type messagePurger interface {
	SoftDeleteByMailboxIDs(ctx context.Context, mailboxIDs []uint64) error
}

type unreadCounter interface {
	CountUnreadByMailboxIDs(ctx context.Context, mailboxIDs []uint64) (map[uint64]int, error)
}

func NewService(repo Repository, domainRepo domain.Repository, extras ...any) *Service {
	service := &Service{
		repo:       repo,
		domainRepo: domainRepo,
	}

	for _, extra := range extras {
		switch value := extra.(type) {
		case messagePurger:
			service.messagePurger = value
			if uc, ok := extra.(unreadCounter); ok {
				service.unreadCounter = uc
			}
		case unreadCounter:
			service.unreadCounter = value
		case *sharedcache.JSONCache:
			service.cache = value
		}
	}

	return service
}

func (s *Service) CreateMailbox(ctx context.Context, userID uint64, req CreateMailboxRequest, apiKeys ...portal.APIKey) (Mailbox, error) {
	if req.ExpiresInHours <= 0 {
		return Mailbox{}, ErrInvalidMailboxTTL
	}

	apiKey := optionalAPIKey(apiKeys...)
	selectedDomain, err := s.domainRepo.GetAccessibleActiveByID(ctx, userID, req.DomainID)
	if err != nil {
		if apiKey == nil || !portal.APIKeyHasRole(*apiKey, "admin") {
			return Mailbox{}, err
		}

		selectedDomain, err = s.domainRepo.GetActiveByID(ctx, req.DomainID)
		if err != nil {
			return Mailbox{}, err
		}
	}
	if RequiresVerifiedSubdomain(selectedDomain) {
		return Mailbox{}, ErrDomainVerificationRequired
	}
	if apiKey != nil {
		if !apiKeyAllowsDomainAccess(*apiKey, userID, selectedDomain, "write") {
			return Mailbox{}, portal.ErrAPIKeyForbidden
		}
		if requiresPublicPoolUse(selectedDomain.Visibility) && !portal.APIKeyHasScope(*apiKey, "public_pool.use") {
			return Mailbox{}, portal.ErrAPIKeyForbidden
		}
	}

	expiresAt := time.Now().Add(time.Duration(req.ExpiresInHours) * time.Hour)
	for range 5 {
		localPart, err := ResolveLocalPart(req.LocalPart)
		if err != nil {
			return Mailbox{}, err
		}

		item, createErr := s.repo.Create(ctx, Mailbox{
			UserID:        userID,
			DomainID:      selectedDomain.ID,
			Domain:        selectedDomain.Domain,
			LocalPart:     localPart,
			Address:       localPart + "@" + selectedDomain.Domain,
			Status:        "active",
			ExpiresAt:     expiresAt,
			RetentionDays: req.RetentionDays,
			CreatedAt:     time.Now(),
			UpdatedAt:     time.Now(),
		})
		if createErr == nil {
			s.invalidateCaches(ctx, userID)
			return item, nil
		}
		if !errors.Is(createErr, ErrAddressConflict) {
			return Mailbox{}, createErr
		}
		if strings.TrimSpace(req.LocalPart) != "" {
			return Mailbox{}, createErr
		}
	}

	return Mailbox{}, ErrAddressConflict
}

func (s *Service) ListMailboxes(ctx context.Context, userID uint64, apiKeys ...portal.APIKey) ([]Mailbox, error) {
	items, err := s.repo.ListByUserID(ctx, userID)
	if err != nil {
		return nil, err
	}
	items = activeMailboxesOnly(items)

	apiKey := optionalAPIKey(apiKeys...)
	if apiKey == nil {
		return items, nil
	}
	if !portal.APIKeyHasDomainBindings(*apiKey) {
		return items, nil
	}

	filtered := make([]Mailbox, 0, len(items))
	for _, item := range items {
		selectedDomain, err := s.domainRepo.GetActiveByID(ctx, item.DomainID)
		if err != nil {
			return nil, err
		}
		if apiKeyAllowsDomainAccess(*apiKey, userID, selectedDomain, "read") {
			filtered = append(filtered, item)
		}
	}
	return filtered, nil
}

func (s *Service) ExtendMailbox(ctx context.Context, userID uint64, mailboxID uint64, req ExtendMailboxRequest, apiKeys ...portal.APIKey) (Mailbox, error) {
	if req.ExpiresInHours <= 0 {
		return Mailbox{}, ErrInvalidMailboxTTL
	}

	item, err := s.repo.FindByUserAndID(ctx, userID, mailboxID)
	if err != nil {
		return Mailbox{}, err
	}
	if apiKey := optionalAPIKey(apiKeys...); apiKey != nil {
		if !portal.APIKeyHasDomainBindings(*apiKey) {
			item.Status = "active"
			item.UpdatedAt = time.Now()
			updated, err := s.repo.Update(ctx, item)
			if err == nil {
				s.invalidateCaches(ctx, userID)
			}
			return updated, err
		}
		selectedDomain, err := s.domainRepo.GetActiveByID(ctx, item.DomainID)
		if err != nil {
			return Mailbox{}, err
		}
		if !apiKeyAllowsDomainAccess(*apiKey, userID, selectedDomain, "write") {
			return Mailbox{}, portal.ErrAPIKeyForbidden
		}
	}

	base := time.Now()
	if item.ExpiresAt.After(base) {
		base = item.ExpiresAt
	}

	item.ExpiresAt = base.Add(time.Duration(req.ExpiresInHours) * time.Hour)
	item.Status = "active"
	item.UpdatedAt = time.Now()
	updated, err := s.repo.Update(ctx, item)
	if err == nil {
		s.invalidateCaches(ctx, userID)
	}
	return updated, err
}

func (s *Service) ReleaseMailbox(ctx context.Context, userID uint64, mailboxID uint64, apiKeys ...portal.APIKey) (Mailbox, error) {
	item, err := s.repo.FindByUserAndID(ctx, userID, mailboxID)
	if err != nil {
		return Mailbox{}, err
	}
	if apiKey := optionalAPIKey(apiKeys...); apiKey != nil {
		if !portal.APIKeyHasDomainBindings(*apiKey) {
			released := item
			released.Status = "released"
			released.UpdatedAt = time.Now()

			if err := s.repo.DeleteByID(ctx, mailboxID); err != nil {
				return Mailbox{}, err
			}
			if s.messagePurger != nil {
				if err := s.messagePurger.SoftDeleteByMailboxIDs(ctx, []uint64{mailboxID}); err != nil {
					return Mailbox{}, err
				}
			}
			s.invalidateCaches(ctx, userID)
			return released, nil
		}
		selectedDomain, err := s.domainRepo.GetActiveByID(ctx, item.DomainID)
		if err != nil {
			return Mailbox{}, err
		}
		if !apiKeyAllowsDomainAccess(*apiKey, userID, selectedDomain, "write") {
			return Mailbox{}, portal.ErrAPIKeyForbidden
		}
	}

	released := item
	released.Status = "released"
	released.UpdatedAt = time.Now()

	if err := s.repo.DeleteByID(ctx, mailboxID); err != nil {
		return Mailbox{}, err
	}
	if s.messagePurger != nil {
		if err := s.messagePurger.SoftDeleteByMailboxIDs(ctx, []uint64{mailboxID}); err != nil {
			return Mailbox{}, err
		}
	}
	s.invalidateCaches(ctx, userID)
	return released, nil
}

func (s *Service) BuildDashboard(ctx context.Context, userID uint64, apiKeys ...portal.APIKey) (DashboardPayload, error) {
	apiKey := optionalAPIKey(apiKeys...)

	if s.cache != nil && apiKey == nil {
		var cached DashboardPayload
		ok, err := s.cache.Get(ctx, dashboardCacheKey(userID), &cached)
		if err == nil && ok {
			return cached, nil
		}
	}

	items, err := s.repo.ListByUserID(ctx, userID)
	if err != nil {
		return DashboardPayload{}, err
	}
	items = activeMailboxesOnly(items)

	var availableDomains []domain.Domain
	if apiKey == nil {
		availableDomains, err = s.domainRepo.ListAccessibleActive(ctx, userID)
		if err != nil {
			return DashboardPayload{}, err
		}
	} else {
		availableDomains, err = s.domainRepo.ListActive(ctx)
		if err != nil {
			return DashboardPayload{}, err
		}
	}
	availableDomains = filterMailboxCreatableDomains(availableDomains)

	if apiKey != nil {
		filteredDomains := make([]domain.Domain, 0, len(availableDomains))
		allowedDomainIDs := map[uint64]struct{}{}
		for _, item := range availableDomains {
			if !apiKeyAllowsDomainAccess(*apiKey, userID, item, "read") {
				continue
			}
			filteredDomains = append(filteredDomains, item)
			allowedDomainIDs[item.ID] = struct{}{}
		}
		availableDomains = filteredDomains

		filteredMailboxes := make([]Mailbox, 0, len(items))
		for _, item := range items {
			if _, ok := allowedDomainIDs[item.DomainID]; ok || !portal.APIKeyHasDomainBindings(*apiKey) {
				filteredMailboxes = append(filteredMailboxes, item)
			}
		}
		items = filteredMailboxes
	}

	payload := DashboardPayload{
		TotalMailboxCount:  len(items),
		ActiveMailboxCount: len(items),
		AvailableDomains:   availableDomains,
		Mailboxes:          items,
		UnreadCounts:       map[uint64]int{},
	}

	if s.unreadCounter != nil && len(items) > 0 {
		ids := make([]uint64, 0, len(items))
		for _, item := range items {
			ids = append(ids, item.ID)
		}
		if counts, err := s.unreadCounter.CountUnreadByMailboxIDs(ctx, ids); err == nil {
			payload.UnreadCounts = counts
		}
	}

	if s.cache != nil && apiKey == nil {
		_ = s.cache.Set(ctx, dashboardCacheKey(userID), time.Minute, payload)
	}
	return payload, nil
}

func activeMailboxesOnly(items []Mailbox) []Mailbox {
	filtered := make([]Mailbox, 0, len(items))
	for _, item := range items {
		if item.Status != "active" {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func randomLocalPart() (string, error) {
	buf := make([]byte, 6)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func resolveLocalPart(value string) (string, error) {
	trimmed := strings.TrimSpace(strings.ToLower(value))
	if trimmed == "" {
		return randomLocalPart()
	}
	if !localPartPattern.MatchString(trimmed) {
		return "", ErrInvalidLocalPart
	}
	return trimmed, nil
}

func dashboardCacheKey(userID uint64) string {
	return fmt.Sprintf("cache:dashboard:user:%d", userID)
}

func adminOverviewCacheKey() string {
	return "cache:admin:overview"
}

func optionalJSONCache(items []*sharedcache.JSONCache) *sharedcache.JSONCache {
	if len(items) == 0 {
		return nil
	}
	return items[0]
}

func optionalAPIKey(items ...portal.APIKey) *portal.APIKey {
	if len(items) == 0 {
		return nil
	}
	return &items[0]
}

func boundResourceFromDomain(item domain.Domain) portal.BoundResource {
	return portal.BoundResource{
		NodeID:            &item.ID,
		Visibility:        item.Visibility,
		PublicationStatus: item.PublicationStatus,
		OwnerUserID:       item.OwnerUserID,
	}
}

func apiKeyAllowsDomainAccess(apiKey portal.APIKey, userID uint64, item domain.Domain, requiredAccess string) bool {
	resource := boundResourceFromDomain(item)
	return portal.APIKeyAllowsBoundResource(apiKey, userID, resource, requiredAccess) ||
		portal.APIKeyAllowsExplicitPrivateBinding(apiKey, resource, requiredAccess)
}

func requiresPublicPoolUse(visibility string) bool {
	switch strings.TrimSpace(visibility) {
	case "public_pool", "platform_public":
		return true
	default:
		return false
	}
}

func filterMailboxCreatableDomains(items []domain.Domain) []domain.Domain {
	filtered := make([]domain.Domain, 0, len(items))
	for _, item := range items {
		if RequiresVerifiedSubdomain(item) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func RequiresVerifiedSubdomain(item domain.Domain) bool {
	isSubdomain := item.Kind == "subdomain" || item.Level > 0 || (item.RootDomain != "" && item.RootDomain != item.Domain)
	if !isSubdomain {
		return false
	}
	return !(item.HealthStatus == "healthy" || item.VerificationScore >= 100)
}

func ResolveLocalPart(value string) (string, error) {
	return resolveLocalPart(value)
}

func (s *Service) invalidateCaches(ctx context.Context, userID uint64) {
	if s.cache == nil {
		return
	}
	_ = s.cache.Delete(ctx, dashboardCacheKey(userID), adminOverviewCacheKey())
}
