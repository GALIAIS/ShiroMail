package admin

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"shiro-email/backend/internal/modules/auth"
	"shiro-email/backend/internal/modules/domain"
	"shiro-email/backend/internal/modules/mailbox"
	"shiro-email/backend/internal/modules/message"
	"shiro-email/backend/internal/modules/portal"
	"shiro-email/backend/internal/modules/system"
	sharedcache "shiro-email/backend/internal/shared/cache"
	"shiro-email/backend/internal/shared/security"
)

var ErrInvalidDomainReviewDecision = errors.New("invalid domain review decision")
var ErrInvalidUserRoles = errors.New("at least one valid role is required")
var ErrInvalidUserProfile = errors.New("invalid user profile")
var ErrCannotBanSelf = errors.New("cannot ban your own account")
var ErrCannotBanAdmin = errors.New("cannot ban an admin account")
var ErrCannotRemoveOwnAdminRole = errors.New("cannot remove your own admin role")
var ErrCannotRemoveLastAdminRole = errors.New("cannot remove the last admin role")
var ErrCannotDeleteOwnAccount = errors.New("cannot delete your own account")
var ErrCannotDeleteLastAdmin = errors.New("cannot delete the last admin account")
var ErrUserHasMailboxes = errors.New("user still has mailboxes")
var ErrUserOwnsDomains = errors.New("user still owns domains")
var ErrUserOwnsProviderAccounts = errors.New("user still owns provider accounts")
var ErrDomainHasMailboxes = errors.New("domain still has mailboxes")
var ErrDomainHasChildren = errors.New("domain still has subdomains")
var ErrProviderAccountInUse = errors.New("provider account is still bound to domains")
var ErrProviderAccountImmutableFieldsLocked = errors.New("provider and auth type cannot be changed while domains are bound")

type OverviewDTO struct {
	ActiveMailboxCount int `json:"activeMailboxCount"`
	TodayMessageCount  int `json:"todayMessageCount"`
	ActiveDomainCount  int `json:"activeDomainCount"`
	FailedJobCount     int `json:"failedJobCount"`
}

type MailboxFeedItem struct {
	ID            uint64    `json:"id"`
	UserID        uint64    `json:"userId"`
	DomainID      uint64    `json:"domainId"`
	Domain        string    `json:"domain"`
	LocalPart     string    `json:"localPart"`
	Address       string    `json:"address"`
	OwnerUsername string    `json:"ownerUsername"`
	Status        string    `json:"status"`
	ExpiresAt     time.Time `json:"expiresAt"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type MessageFeedItem struct {
	ID             uint64    `json:"id"`
	Subject        string    `json:"subject"`
	MailboxAddress string    `json:"mailboxAddress"`
	FromAddr       string    `json:"fromAddr"`
	Status         string    `json:"status"`
	ReceivedAt     time.Time `json:"receivedAt"`
}

type Service struct {
	authRepo    auth.Repository
	domainRepo  domain.Repository
	domainSvc   *domain.Service
	mailboxRepo mailbox.Repository
	messageRepo message.Repository
	messageSvc  *message.Service
	portalRepo  portal.Repository
	jobRepo     system.JobRepository
	auditRepo   system.AuditRepository
	cache       *sharedcache.JSONCache
}

func NewService(authRepo auth.Repository, domainRepo domain.Repository, domainSvc *domain.Service, mailboxRepo mailbox.Repository, messageRepo message.Repository, messageSvc *message.Service, portalRepo portal.Repository, jobRepo system.JobRepository, auditRepo system.AuditRepository, cache ...*sharedcache.JSONCache) *Service {
	return &Service{
		authRepo:    authRepo,
		domainRepo:  domainRepo,
		domainSvc:   domainSvc,
		mailboxRepo: mailboxRepo,
		messageRepo: messageRepo,
		messageSvc:  messageSvc,
		portalRepo:  portalRepo,
		jobRepo:     jobRepo,
		auditRepo:   auditRepo,
		cache:       optionalJSONCache(cache),
	}
}

type UserFeedItem struct {
	ID            uint64   `json:"id"`
	Username      string   `json:"username"`
	Email         string   `json:"email"`
	Status        string   `json:"status"`
	EmailVerified bool     `json:"emailVerified"`
	Roles         []string `json:"roles"`
	Mailboxes     int      `json:"mailboxes"`
}

type UserDetailMailbox struct {
	ID        uint64    `json:"id"`
	Address   string    `json:"address"`
	Domain    string    `json:"domain"`
	Status    string    `json:"status"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
}

type UserDetailWebhook struct {
	ID        uint64    `json:"id"`
	Name      string    `json:"name"`
	TargetURL string    `json:"targetUrl"`
	Enabled   bool      `json:"enabled"`
	Events    []string  `json:"events"`
	CreatedAt time.Time `json:"createdAt"`
}

type UserDetailAPIKey struct {
	ID         uint64    `json:"id"`
	Name       string    `json:"name"`
	KeyPreview string    `json:"keyPreview"`
	Status     string    `json:"status"`
	Scopes     []string  `json:"scopes"`
	CreatedAt  time.Time `json:"createdAt"`
}

type UserDetailAuditEntry struct {
	ID           uint64         `json:"id"`
	Action       string         `json:"action"`
	ResourceType string         `json:"resourceType"`
	ResourceID   string         `json:"resourceId"`
	Detail       map[string]any `json:"detail"`
	CreatedAt    time.Time      `json:"createdAt"`
}

type UserDetailDTO struct {
	ID            uint64                 `json:"id"`
	Username      string                 `json:"username"`
	Email         string                 `json:"email"`
	Status        string                 `json:"status"`
	EmailVerified bool                   `json:"emailVerified"`
	Roles         []string               `json:"roles"`
	Mailboxes     []UserDetailMailbox    `json:"mailboxes"`
	Webhooks      []UserDetailWebhook    `json:"webhooks"`
	APIKeys       []UserDetailAPIKey     `json:"apiKeys"`
	AuditLog      []UserDetailAuditEntry `json:"auditLog"`
}

func (s *Service) ListUsers(ctx context.Context) ([]UserFeedItem, error) {
	users, err := s.authRepo.ListUsers(ctx)
	if err != nil {
		return nil, err
	}

	items := make([]UserFeedItem, 0, len(users))
	for _, user := range users {
		mailboxes, err := s.mailboxRepo.ListByUserID(ctx, user.ID)
		if err != nil {
			return nil, err
		}
		mailboxes = activeAdminMailboxesOnly(mailboxes)
		items = append(items, UserFeedItem{
			ID:            user.ID,
			Username:      user.Username,
			Email:         user.Email,
			Status:        user.Status,
			EmailVerified: user.EmailVerified,
			Roles:         user.Roles,
			Mailboxes:     len(mailboxes),
		})
	}
	return items, nil
}

func (s *Service) GetUserDetail(ctx context.Context, userID uint64) (UserDetailDTO, error) {
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return UserDetailDTO{}, err
	}

	mailboxes, _ := s.mailboxRepo.ListByUserID(ctx, user.ID)
	detailMailboxes := make([]UserDetailMailbox, 0, len(mailboxes))
	for _, mb := range mailboxes {
		detailMailboxes = append(detailMailboxes, UserDetailMailbox{
			ID:        mb.ID,
			Address:   mb.Address,
			Domain:    mb.Domain,
			Status:    mb.Status,
			ExpiresAt: mb.ExpiresAt,
			CreatedAt: mb.CreatedAt,
		})
	}

	webhooks, _ := s.portalRepo.ListWebhooksByUser(ctx, user.ID)
	detailWebhooks := make([]UserDetailWebhook, 0, len(webhooks))
	for _, wh := range webhooks {
		detailWebhooks = append(detailWebhooks, UserDetailWebhook{
			ID:        wh.ID,
			Name:      wh.Name,
			TargetURL: wh.TargetURL,
			Enabled:   wh.Enabled,
			Events:    wh.Events,
			CreatedAt: wh.CreatedAt,
		})
	}

	apiKeys, _ := s.portalRepo.ListAPIKeysByUser(ctx, user.ID)
	detailAPIKeys := make([]UserDetailAPIKey, 0, len(apiKeys))
	for _, key := range apiKeys {
		detailAPIKeys = append(detailAPIKeys, UserDetailAPIKey{
			ID:         key.ID,
			Name:       key.Name,
			KeyPreview: key.KeyPreview,
			Status:     key.Status,
			Scopes:     key.Scopes,
			CreatedAt:  key.CreatedAt,
		})
	}

	auditLogs, _ := s.auditRepo.List(ctx)
	detailAudit := make([]UserDetailAuditEntry, 0)
	for _, entry := range auditLogs {
		if entry.ActorUserID == user.ID {
			detailAudit = append(detailAudit, UserDetailAuditEntry{
				ID:           entry.ID,
				Action:       entry.Action,
				ResourceType: entry.ResourceType,
				ResourceID:   entry.ResourceID,
				Detail:       entry.Detail,
				CreatedAt:    entry.CreatedAt,
			})
		}
		if len(detailAudit) >= 20 {
			break
		}
	}

	return UserDetailDTO{
		ID:            user.ID,
		Username:      user.Username,
		Email:         user.Email,
		Status:        user.Status,
		EmailVerified: user.EmailVerified,
		Roles:         user.Roles,
		Mailboxes:     detailMailboxes,
		Webhooks:      detailWebhooks,
		APIKeys:       detailAPIKeys,
		AuditLog:      detailAudit,
	}, nil
}

type UpdateUserInput struct {
	Username      string
	Email         string
	Status        string
	EmailVerified bool
	Roles         []string
	NewPassword   string
}

func (s *Service) UpdateUser(ctx context.Context, actorID uint64, userID uint64, input UpdateUserInput) (UserFeedItem, error) {
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return UserFeedItem{}, err
	}

	normalizedRoles := normalizeRoleCodes(input.Roles)
	if len(normalizedRoles) == 0 {
		return UserFeedItem{}, ErrInvalidUserRoles
	}
	if actorID == userID && !containsRole(normalizedRoles, "admin") {
		return UserFeedItem{}, ErrCannotRemoveOwnAdminRole
	}
	if containsRole(user.Roles, "admin") && !containsRole(normalizedRoles, "admin") {
		adminCount, countErr := s.countAdminUsers(ctx)
		if countErr != nil {
			return UserFeedItem{}, countErr
		}
		if adminCount <= 1 {
			return UserFeedItem{}, ErrCannotRemoveLastAdminRole
		}
	}

	user.Username = strings.TrimSpace(input.Username)
	user.Email = strings.TrimSpace(input.Email)
	user.Status = strings.TrimSpace(input.Status)
	user.EmailVerified = input.EmailVerified
	if user.Username == "" || user.Email == "" {
		return UserFeedItem{}, ErrInvalidUserProfile
	}
	if user.Status == "" {
		user.Status = "active"
	}
	if !isValidUserStatus(user.Status) {
		return UserFeedItem{}, ErrInvalidUserProfile
	}

	updated, err := s.authRepo.UpdateUser(ctx, user)
	if err != nil {
		return UserFeedItem{}, err
	}
	updated, err = s.authRepo.UpdateUserRoles(ctx, userID, normalizedRoles)
	if err != nil {
		return UserFeedItem{}, err
	}
	if updated.Status == "banned" || updated.Status == "disabled" {
		_ = s.authRepo.RevokeUserRefreshTokens(ctx, userID)
	}
	if strings.TrimSpace(input.NewPassword) != "" {
		passwordHash, hashErr := security.HashPassword(input.NewPassword)
		if hashErr != nil {
			return UserFeedItem{}, hashErr
		}
		if err := s.authRepo.UpdateUserPassword(ctx, userID, passwordHash); err != nil {
			return UserFeedItem{}, err
		}
		if err := s.authRepo.RevokeUserRefreshTokens(ctx, userID); err != nil {
			return UserFeedItem{}, err
		}
	}

	return s.buildUserFeedItem(ctx, actorID, updated, "admin.user.update", map[string]any{
		"username":      updated.Username,
		"email":         updated.Email,
		"status":        updated.Status,
		"emailVerified": updated.EmailVerified,
		"roles":         updated.Roles,
		"passwordReset": strings.TrimSpace(input.NewPassword) != "",
	})
}

func (s *Service) UpdateUserRoles(ctx context.Context, actorID uint64, userID uint64, roles []string) (UserFeedItem, error) {
	normalizedRoles := normalizeRoleCodes(roles)
	if len(normalizedRoles) == 0 {
		return UserFeedItem{}, ErrInvalidUserRoles
	}
	if actorID == userID && !containsRole(normalizedRoles, "admin") {
		return UserFeedItem{}, ErrCannotRemoveOwnAdminRole
	}
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return UserFeedItem{}, err
	}
	if containsRole(user.Roles, "admin") && !containsRole(normalizedRoles, "admin") {
		adminCount, countErr := s.countAdminUsers(ctx)
		if countErr != nil {
			return UserFeedItem{}, countErr
		}
		if adminCount <= 1 {
			return UserFeedItem{}, ErrCannotRemoveLastAdminRole
		}
	}

	updated, err := s.authRepo.UpdateUserRoles(ctx, userID, normalizedRoles)
	if err != nil {
		return UserFeedItem{}, err
	}

	return s.buildUserFeedItem(ctx, actorID, updated, "admin.user.roles.update", map[string]any{
		"username": updated.Username,
		"roles":    updated.Roles,
	})
}

func (s *Service) BanUser(ctx context.Context, actorID uint64, userID uint64, reason string) (UserFeedItem, error) {
	if actorID == userID {
		return UserFeedItem{}, ErrCannotBanSelf
	}
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return UserFeedItem{}, err
	}
	if containsRole(user.Roles, "admin") {
		return UserFeedItem{}, ErrCannotBanAdmin
	}
	user.Status = "banned"
	updated, err := s.authRepo.UpdateUser(ctx, user)
	if err != nil {
		return UserFeedItem{}, err
	}
	_ = s.authRepo.RevokeUserRefreshTokens(ctx, userID)
	return s.buildUserFeedItem(ctx, actorID, updated, "admin.user.ban", map[string]any{
		"reason": reason,
	})
}

func (s *Service) UnbanUser(ctx context.Context, actorID uint64, userID uint64) (UserFeedItem, error) {
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return UserFeedItem{}, err
	}
	if user.Status != "banned" {
		return UserFeedItem{}, ErrInvalidUserProfile
	}
	user.Status = "active"
	updated, err := s.authRepo.UpdateUser(ctx, user)
	if err != nil {
		return UserFeedItem{}, err
	}
	return s.buildUserFeedItem(ctx, actorID, updated, "admin.user.unban", nil)
}

func (s *Service) DeleteUser(ctx context.Context, actorID uint64, userID uint64) error {
	if actorID == userID {
		return ErrCannotDeleteOwnAccount
	}

	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return err
	}
	if containsRole(user.Roles, "admin") {
		adminCount, countErr := s.countAdminUsers(ctx)
		if countErr != nil {
			return countErr
		}
		if adminCount <= 1 {
			return ErrCannotDeleteLastAdmin
		}
	}

	domains, err := s.domainRepo.ListAll(ctx)
	if err != nil {
		return err
	}
	for _, item := range domains {
		if item.OwnerUserID != nil && *item.OwnerUserID == userID {
			return ErrUserOwnsDomains
		}
	}

	providerAccounts, err := s.domainRepo.ListProviderAccounts(ctx)
	if err != nil {
		return err
	}
	for _, item := range providerAccounts {
		if item.OwnerUserID != nil && *item.OwnerUserID == userID {
			return ErrUserOwnsProviderAccounts
		}
	}

	deletedMailboxIDs, err := s.mailboxRepo.DeleteByUserID(ctx, userID)
	if err != nil {
		return err
	}
	if len(deletedMailboxIDs) > 0 {
		if err := s.messageRepo.SoftDeleteByMailboxIDs(ctx, deletedMailboxIDs); err != nil {
			return err
		}
		if s.messageSvc != nil {
			for _, mailboxID := range deletedMailboxIDs {
				s.messageSvc.InvalidateMailboxListCache(ctx, mailboxID)
			}
		}
	}

	if err := s.authRepo.RevokeUserRefreshTokens(ctx, userID); err != nil {
		return err
	}
	if err := s.authRepo.DeleteUser(ctx, userID); err != nil {
		return err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.user.delete", "user", strconv.FormatUint(userID, 10), map[string]any{
		"username":          user.Username,
		"email":             user.Email,
		"roles":             user.Roles,
		"deletedMailboxIDs": deletedMailboxIDs,
	})
	return nil
}

func (s *Service) Overview(ctx context.Context) (*OverviewDTO, error) {
	if s.cache != nil {
		var cached OverviewDTO
		ok, err := s.cache.Get(ctx, adminOverviewCacheKey(), &cached)
		if err == nil && ok {
			return &cached, nil
		}
	}

	payload := &OverviewDTO{
		ActiveMailboxCount: s.mailboxRepo.CountActive(ctx),
		TodayMessageCount:  s.messageRepo.CountToday(ctx),
		ActiveDomainCount:  s.domainRepo.CountActive(ctx),
		FailedJobCount:     s.jobRepo.CountFailed(ctx),
	}
	if s.cache != nil {
		_ = s.cache.Set(ctx, adminOverviewCacheKey(), time.Minute, payload)
	}
	return payload, nil
}

func (s *Service) ListDomains(ctx context.Context) ([]domain.Domain, error) {
	items, err := s.domainRepo.ListAll(ctx)
	if err != nil {
		return nil, err
	}

	filtered := make([]domain.Domain, 0, len(items))
	for _, item := range items {
		if isPlatformDomain(item) {
			filtered = append(filtered, item)
		}
	}
	return filtered, nil
}

func (s *Service) ListDomainProviders(ctx context.Context) ([]domain.ProviderAccount, error) {
	var (
		items []domain.ProviderAccount
		err   error
	)
	if s.domainSvc != nil {
		items, err = s.domainSvc.ListProviderAccounts(ctx)
	} else {
		items, err = s.domainRepo.ListProviderAccounts(ctx)
	}
	if err != nil {
		return nil, err
	}

	filtered := make([]domain.ProviderAccount, 0, len(items))
	for _, item := range items {
		if isPlatformProviderAccount(item) {
			filtered = append(filtered, item)
		}
	}
	return filtered, nil
}

func (s *Service) ListMailboxes(ctx context.Context) ([]MailboxFeedItem, error) {
	items, err := s.mailboxRepo.ListAll(ctx)
	if err != nil {
		return nil, err
	}
	items = activeAdminMailboxesOnly(items)

	feed := make([]MailboxFeedItem, 0, len(items))
	for _, item := range items {
		owner, findErr := s.authRepo.FindUserByID(ctx, item.UserID)
		if findErr != nil {
			continue
		}

		feed = append(feed, MailboxFeedItem{
			ID:            item.ID,
			UserID:        item.UserID,
			DomainID:      item.DomainID,
			Domain:        item.Domain,
			LocalPart:     item.LocalPart,
			Address:       item.Address,
			OwnerUsername: owner.Username,
			Status:        item.Status,
			ExpiresAt:     item.ExpiresAt,
			CreatedAt:     item.CreatedAt,
			UpdatedAt:     item.UpdatedAt,
		})
	}

	sort.Slice(feed, func(i, j int) bool {
		return feed[i].ID < feed[j].ID
	})

	return feed, nil
}

func (s *Service) ListMailboxDomains(ctx context.Context) ([]domain.Domain, error) {
	return s.domainRepo.ListActive(ctx)
}

func (s *Service) CreateMailbox(ctx context.Context, actorID uint64, userID uint64, req mailbox.CreateMailboxRequest) (mailbox.Mailbox, error) {
	if req.ExpiresInHours <= 0 {
		return mailbox.Mailbox{}, mailbox.ErrInvalidMailboxTTL
	}
	if _, err := s.authRepo.FindUserByID(ctx, userID); err != nil {
		return mailbox.Mailbox{}, err
	}

	selectedDomain, err := s.domainRepo.GetActiveByID(ctx, req.DomainID)
	if err != nil {
		return mailbox.Mailbox{}, err
	}
	if mailbox.RequiresVerifiedSubdomain(selectedDomain) {
		return mailbox.Mailbox{}, mailbox.ErrDomainVerificationRequired
	}

	localPart, err := mailbox.ResolveLocalPart(req.LocalPart)
	if err != nil {
		return mailbox.Mailbox{}, err
	}

	item, err := s.mailboxRepo.Create(ctx, mailbox.Mailbox{
		UserID:    userID,
		DomainID:  selectedDomain.ID,
		Domain:    selectedDomain.Domain,
		LocalPart: localPart,
		Address:   localPart + "@" + selectedDomain.Domain,
		Status:    "active",
		ExpiresAt: time.Now().Add(time.Duration(req.ExpiresInHours) * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		return mailbox.Mailbox{}, err
	}

	s.invalidateMailboxCaches(ctx, userID)
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.mailbox.create", "mailbox", strconv.FormatUint(item.ID, 10), map[string]any{
		"userId":         item.UserID,
		"domainId":       item.DomainID,
		"address":        item.Address,
		"expiresInHours": req.ExpiresInHours,
	})
	return item, nil
}

func (s *Service) ExtendMailbox(ctx context.Context, actorID uint64, mailboxID uint64, expiresInHours int) (mailbox.Mailbox, error) {
	if expiresInHours <= 0 {
		return mailbox.Mailbox{}, mailbox.ErrInvalidMailboxTTL
	}

	item, err := s.mailboxRepo.FindByID(ctx, mailboxID)
	if err != nil {
		return mailbox.Mailbox{}, err
	}

	base := time.Now()
	if item.ExpiresAt.After(base) {
		base = item.ExpiresAt
	}

	item.ExpiresAt = base.Add(time.Duration(expiresInHours) * time.Hour)
	item.Status = "active"
	item.UpdatedAt = time.Now()

	updated, err := s.mailboxRepo.Update(ctx, item)
	if err != nil {
		return mailbox.Mailbox{}, err
	}

	s.invalidateMailboxCaches(ctx, updated.UserID)
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.mailbox.extend", "mailbox", strconv.FormatUint(updated.ID, 10), map[string]any{
		"userId":         updated.UserID,
		"address":        updated.Address,
		"expiresAt":      updated.ExpiresAt,
		"expiresInHours": expiresInHours,
		"status":         updated.Status,
	})
	return updated, nil
}

func (s *Service) ReleaseMailbox(ctx context.Context, actorID uint64, mailboxID uint64) (mailbox.Mailbox, error) {
	item, err := s.mailboxRepo.FindByID(ctx, mailboxID)
	if err != nil {
		return mailbox.Mailbox{}, err
	}

	released := item
	released.Status = "released"
	released.UpdatedAt = time.Now()

	if err := s.mailboxRepo.DeleteByID(ctx, mailboxID); err != nil {
		return mailbox.Mailbox{}, err
	}
	if err := s.messageRepo.SoftDeleteByMailboxIDs(ctx, []uint64{mailboxID}); err != nil {
		return mailbox.Mailbox{}, err
	}

	s.invalidateMailboxCaches(ctx, released.UserID)
	if s.messageSvc != nil {
		s.messageSvc.InvalidateMailboxListCache(ctx, released.ID)
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.mailbox.release", "mailbox", strconv.FormatUint(released.ID, 10), map[string]any{
		"userId":    released.UserID,
		"address":   released.Address,
		"expiresAt": released.ExpiresAt,
		"status":    released.Status,
	})
	return released, nil
}

func (s *Service) ListMessages(ctx context.Context) ([]MessageFeedItem, error) {
	mailboxes, err := s.mailboxRepo.ListActive(ctx)
	if err != nil {
		return nil, err
	}

	feed := make([]MessageFeedItem, 0)
	for _, item := range mailboxes {
		messages, listErr := s.messageRepo.ListByMailboxID(ctx, item.ID)
		if listErr != nil {
			return nil, listErr
		}

		for _, record := range messages {
			status := "seen"
			if !record.IsRead {
				status = "new"
			}

			feed = append(feed, MessageFeedItem{
				ID:             record.ID,
				Subject:        record.Subject,
				MailboxAddress: item.Address,
				FromAddr:       record.FromAddr,
				Status:         status,
				ReceivedAt:     record.ReceivedAt,
			})
		}
	}

	sort.Slice(feed, func(i, j int) bool {
		if feed[i].ReceivedAt.Equal(feed[j].ReceivedAt) {
			return feed[i].ID < feed[j].ID
		}
		return feed[i].ReceivedAt.After(feed[j].ReceivedAt)
	})

	return feed, nil
}

func (s *Service) ListMailboxMessages(ctx context.Context, mailboxID uint64) ([]message.Summary, error) {
	if s.messageSvc == nil {
		return nil, message.ErrMessageContentUnavailable
	}
	return s.messageSvc.ListByMailboxForAdmin(ctx, mailboxID)
}

func (s *Service) GetMailboxMessage(ctx context.Context, mailboxID uint64, messageID uint64) (message.Message, error) {
	if s.messageSvc == nil {
		return message.Message{}, message.ErrMessageContentUnavailable
	}
	return s.messageSvc.GetByMailboxAndIDForAdmin(ctx, mailboxID, messageID)
}

func (s *Service) DownloadMailboxMessageRaw(ctx context.Context, mailboxID uint64, messageID uint64) (message.Download, error) {
	if s.messageSvc == nil {
		return message.Download{}, message.ErrMessageContentUnavailable
	}
	return s.messageSvc.DownloadRawByMailboxAndIDForAdmin(ctx, mailboxID, messageID)
}

func (s *Service) ParseMailboxMessageRaw(ctx context.Context, mailboxID uint64, messageID uint64) (message.ParsedRawMessage, error) {
	if s.messageSvc == nil {
		return message.ParsedRawMessage{}, message.ErrMessageContentUnavailable
	}
	return s.messageSvc.ParseRawByMailboxAndIDForAdmin(ctx, mailboxID, messageID)
}

func (s *Service) DownloadMailboxMessageAttachment(ctx context.Context, mailboxID uint64, messageID uint64, attachmentIndex int) (message.Download, error) {
	if s.messageSvc == nil {
		return message.Download{}, message.ErrMessageContentUnavailable
	}
	return s.messageSvc.DownloadAttachmentByMailboxAndIDForAdmin(ctx, mailboxID, messageID, attachmentIndex)
}

func (s *Service) UpsertDomain(ctx context.Context, actorID uint64, item domain.Domain) (domain.Domain, error) {
	if item.ProviderAccountID != nil {
		account, err := s.requirePlatformProviderAccount(ctx, *item.ProviderAccountID)
		if err != nil {
			return domain.Domain{}, err
		}
		item.ProviderAccountID = &account.ID
	}

	if item.ID != 0 {
		existing, err := s.domainRepo.GetActiveByID(ctx, item.ID)
		if err != nil {
			return domain.Domain{}, err
		}
		if !isPlatformDomain(existing) {
			return domain.Domain{}, domain.ErrDomainNotFound
		}
	} else if strings.TrimSpace(item.Domain) != "" {
		existing, err := s.domainRepo.FindByDomain(ctx, item.Domain)
		if err == nil && !isPlatformDomain(existing) {
			return domain.Domain{}, domain.ErrDomainNotFound
		}
		if err != nil && !errors.Is(err, domain.ErrDomainNotFound) {
			return domain.Domain{}, err
		}
	}

	item.OwnerUserID = nil
	updated, err := s.domainRepo.Upsert(ctx, item)
	if err != nil {
		return domain.Domain{}, err
	}
	s.invalidateDomainCaches(ctx)
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain.upsert", "domain", updated.Domain, map[string]any{
		"status":            updated.Status,
		"visibility":        updated.Visibility,
		"publicationStatus": updated.PublicationStatus,
		"providerAccountId": updated.ProviderAccountID,
		"isDefault":         updated.IsDefault,
		"weight":            updated.Weight,
	})
	return updated, nil
}

func (s *Service) DeleteDomain(ctx context.Context, actorID uint64, domainID uint64) error {
	target, err := s.domainRepo.GetActiveByID(ctx, domainID)
	if err != nil {
		return err
	}
	if !isPlatformDomain(target) {
		return domain.ErrDomainNotFound
	}

	allDomains, err := s.domainRepo.ListAll(ctx)
	if err != nil {
		return err
	}
	deleteTargets := collectAdminDomainDeleteTargets(target, allDomains)

	mailboxes, err := s.mailboxRepo.ListActive(ctx)
	if err != nil {
		return err
	}
	deleteTargetIDs := make(map[uint64]struct{}, len(deleteTargets))
	for _, item := range deleteTargets {
		deleteTargetIDs[item.ID] = struct{}{}
	}
	for _, item := range mailboxes {
		if _, ok := deleteTargetIDs[item.DomainID]; ok {
			return ErrDomainHasMailboxes
		}
	}
	for _, item := range deleteTargets {
		if _, err := s.mailboxRepo.DeleteInactiveByDomainID(ctx, item.ID); err != nil {
			return err
		}
	}
	for _, item := range deleteTargets {
		if err := s.domainRepo.DeleteDomain(ctx, item.ID); err != nil {
			return err
		}
	}
	s.invalidateDomainCaches(ctx)
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain.delete", "domain", target.Domain, map[string]any{
		"domainId": target.ID,
		"domain":   target.Domain,
	})
	return nil
}

func collectAdminDomainDeleteTargets(target domain.Domain, allDomains []domain.Domain) []domain.Domain {
	items := []domain.Domain{target}
	for _, item := range allDomains {
		if item.ID == target.ID {
			continue
		}
		if !strings.HasSuffix(item.Domain, "."+target.Domain) {
			continue
		}
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Level == items[j].Level {
			return items[i].ID > items[j].ID
		}
		return items[i].Level > items[j].Level
	})
	return items
}

func (s *Service) ReviewDomainPublication(ctx context.Context, actorID uint64, domainID uint64, decision string) (domain.Domain, error) {
	item, err := s.domainRepo.GetActiveByID(ctx, domainID)
	if err != nil {
		return domain.Domain{}, err
	}
	if isPlatformDomain(item) {
		return domain.Domain{}, domain.ErrDomainNotFound
	}

	switch decision {
	case "approve":
		item.Visibility = "public_pool"
		item.PublicationStatus = "approved"
	case "reject":
		item.Visibility = "private"
		item.PublicationStatus = "rejected"
	default:
		return domain.Domain{}, ErrInvalidDomainReviewDecision
	}

	updated, err := s.domainRepo.Upsert(ctx, item)
	if err != nil {
		return domain.Domain{}, err
	}
	s.invalidateDomainCaches(ctx)

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain.public_pool."+decision, "domain", updated.Domain, map[string]any{
		"visibility":        updated.Visibility,
		"publicationStatus": updated.PublicationStatus,
	})
	return updated, nil
}

func (s *Service) VerifyDomain(ctx context.Context, actorID uint64, domainID uint64) (domain.DomainVerificationResult, error) {
	if s.domainSvc == nil {
		return domain.DomainVerificationResult{}, domain.ErrProviderAdapterUnavailable
	}

	result, err := s.domainSvc.VerifyDomain(ctx, domainID)
	if err != nil {
		return domain.DomainVerificationResult{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain.verify", "domain", result.Domain.Domain, map[string]any{
		"passed":        result.Passed,
		"summary":       result.Summary,
		"verifiedCount": result.VerifiedCount,
		"totalCount":    result.TotalCount,
		"zoneName":      result.ZoneName,
	})

	return result, nil
}

func (s *Service) CreateDomainProvider(ctx context.Context, actorID uint64, req domain.CreateProviderAccountRequest) (domain.ProviderAccount, error) {
	if s.domainSvc == nil {
		return domain.ProviderAccount{}, domain.ErrProviderAdapterUnavailable
	}

	req.OwnerType = "platform"
	req.OwnerUserID = nil
	created, err := s.domainSvc.CreateProviderAccount(ctx, req)
	if err != nil {
		return domain.ProviderAccount{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain_provider.create", "provider_account", created.DisplayName, map[string]any{
		"provider":     created.Provider,
		"ownerType":    created.OwnerType,
		"authType":     created.AuthType,
		"hasSecret":    created.HasSecret,
		"status":       created.Status,
		"capabilities": created.Capabilities,
	})
	return created, nil
}

func (s *Service) UpdateDomainProvider(ctx context.Context, actorID uint64, providerAccountID uint64, req domain.CreateProviderAccountRequest) (domain.ProviderAccount, error) {
	if s.domainSvc == nil {
		return domain.ProviderAccount{}, domain.ErrProviderAdapterUnavailable
	}

	existing, err := s.requirePlatformProviderAccount(ctx, providerAccountID)
	if err != nil {
		return domain.ProviderAccount{}, err
	}

	bound, err := s.platformProviderHasBoundDomains(ctx, providerAccountID)
	if err != nil {
		return domain.ProviderAccount{}, err
	}

	nextProvider := strings.TrimSpace(req.Provider)
	if nextProvider == "" {
		nextProvider = existing.Provider
	}
	nextAuthType := strings.TrimSpace(req.AuthType)
	if nextAuthType == "" {
		nextAuthType = existing.AuthType
	}

	if bound && (nextProvider != existing.Provider || nextAuthType != existing.AuthType) {
		return domain.ProviderAccount{}, ErrProviderAccountImmutableFieldsLocked
	}

	req.Provider = nextProvider
	req.AuthType = nextAuthType
	req.OwnerType = existing.OwnerType
	req.OwnerUserID = existing.OwnerUserID

	updated, err := s.domainSvc.UpdateProviderAccount(ctx, providerAccountID, req)
	if err != nil {
		return domain.ProviderAccount{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain_provider.update", "provider_account", strconv.FormatUint(updated.ID, 10), map[string]any{
		"providerAccountId": updated.ID,
		"displayName":       updated.DisplayName,
		"provider":          updated.Provider,
		"authType":          updated.AuthType,
		"status":            updated.Status,
		"capabilities":      updated.Capabilities,
		"hasSecret":         updated.HasSecret,
		"boundDomains":      bound,
	})

	return updated, nil
}

func (s *Service) DeleteDomainProvider(ctx context.Context, actorID uint64, providerAccountID uint64) error {
	account, err := s.requirePlatformProviderAccount(ctx, providerAccountID)
	if err != nil {
		return err
	}

	bound, err := s.platformProviderHasBoundDomains(ctx, providerAccountID)
	if err != nil {
		return err
	}
	if bound {
		return ErrProviderAccountInUse
	}

	if err := s.domainRepo.DeleteProviderAccount(ctx, providerAccountID); err != nil {
		return err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain_provider.delete", "provider_account", account.DisplayName, map[string]any{
		"providerAccountId": account.ID,
		"displayName":       account.DisplayName,
		"provider":          account.Provider,
	})
	return nil
}

func (s *Service) ValidateDomainProvider(ctx context.Context, actorID uint64, providerAccountID uint64) (domain.ProviderAccount, error) {
	if s.domainSvc == nil {
		return domain.ProviderAccount{}, domain.ErrProviderAdapterUnavailable
	}
	if _, err := s.requirePlatformProviderAccount(ctx, providerAccountID); err != nil {
		return domain.ProviderAccount{}, err
	}

	updated, err := s.domainSvc.ValidateProviderAccount(ctx, providerAccountID)
	if err != nil {
		return domain.ProviderAccount{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain_provider.validate", "provider_account", updated.DisplayName, map[string]any{
		"provider":     updated.Provider,
		"status":       updated.Status,
		"capabilities": updated.Capabilities,
	})
	return updated, nil
}

func (s *Service) ListDomainProviderZones(ctx context.Context, providerAccountID uint64) ([]domain.ProviderZone, error) {
	if s.domainSvc == nil {
		return nil, domain.ErrProviderAdapterUnavailable
	}
	if _, err := s.requirePlatformProviderAccount(ctx, providerAccountID); err != nil {
		return nil, err
	}
	return s.domainSvc.ListProviderZones(ctx, providerAccountID)
}

func (s *Service) ListDomainProviderRecords(ctx context.Context, providerAccountID uint64, zoneID string) ([]domain.ProviderRecord, error) {
	if s.domainSvc == nil {
		return nil, domain.ErrProviderAdapterUnavailable
	}
	if _, err := s.requirePlatformProviderAccount(ctx, providerAccountID); err != nil {
		return nil, err
	}
	return s.domainSvc.ListProviderRecords(ctx, providerAccountID, zoneID)
}

func (s *Service) ListDomainProviderChangeSets(ctx context.Context, providerAccountID uint64, zoneID string) ([]domain.DNSChangeSet, error) {
	if s.domainSvc == nil {
		return nil, domain.ErrProviderAdapterUnavailable
	}
	if _, err := s.requirePlatformProviderAccount(ctx, providerAccountID); err != nil {
		return nil, err
	}
	return s.domainSvc.ListProviderChangeSets(ctx, providerAccountID, zoneID)
}

func (s *Service) ListDomainProviderVerifications(ctx context.Context, providerAccountID uint64, zoneID string, zoneName string) ([]domain.VerificationProfile, error) {
	if s.domainSvc == nil {
		return nil, domain.ErrProviderAdapterUnavailable
	}
	if _, err := s.requirePlatformProviderAccount(ctx, providerAccountID); err != nil {
		return nil, err
	}
	return s.domainSvc.PreviewProviderVerifications(ctx, providerAccountID, zoneID, zoneName)
}

func (s *Service) PreviewDomainProviderChangeSet(ctx context.Context, actorID uint64, providerAccountID uint64, zoneID string, req domain.PreviewProviderChangeSetRequest) (domain.DNSChangeSet, error) {
	if s.domainSvc == nil {
		return domain.DNSChangeSet{}, domain.ErrProviderAdapterUnavailable
	}
	if _, err := s.requirePlatformProviderAccount(ctx, providerAccountID); err != nil {
		return domain.DNSChangeSet{}, err
	}

	changeSet, err := s.domainSvc.PreviewProviderChangeSet(ctx, providerAccountID, zoneID, actorID, req)
	if err != nil {
		return domain.DNSChangeSet{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain_provider.change_set.preview", "dns_change_set", strconv.FormatUint(changeSet.ID, 10), map[string]any{
		"providerAccountId": changeSet.ProviderAccountID,
		"providerZoneId":    changeSet.ProviderZoneID,
		"zoneName":          changeSet.ZoneName,
		"summary":           changeSet.Summary,
		"status":            changeSet.Status,
	})
	return changeSet, nil
}

func (s *Service) ApplyDomainProviderChangeSet(ctx context.Context, actorID uint64, changeSetID uint64) (domain.DNSChangeSet, error) {
	if s.domainSvc == nil {
		return domain.DNSChangeSet{}, domain.ErrProviderAdapterUnavailable
	}
	changeSet, err := s.domainRepo.GetDNSChangeSetByID(ctx, changeSetID)
	if err != nil {
		return domain.DNSChangeSet{}, err
	}
	if _, err := s.requirePlatformProviderAccount(ctx, changeSet.ProviderAccountID); err != nil {
		return domain.DNSChangeSet{}, err
	}

	changeSet, err = s.domainSvc.ApplyProviderChangeSet(ctx, changeSetID)
	if err != nil {
		return domain.DNSChangeSet{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.domain_provider.change_set.apply", "dns_change_set", strconv.FormatUint(changeSet.ID, 10), map[string]any{
		"providerAccountId": changeSet.ProviderAccountID,
		"providerZoneId":    changeSet.ProviderZoneID,
		"zoneName":          changeSet.ZoneName,
		"summary":           changeSet.Summary,
		"status":            changeSet.Status,
	})
	return changeSet, nil
}

func isPlatformDomain(item domain.Domain) bool {
	return item.OwnerUserID == nil
}

func isPlatformProviderAccount(item domain.ProviderAccount) bool {
	ownerType := strings.TrimSpace(item.OwnerType)
	return item.OwnerUserID == nil && (ownerType == "" || ownerType == "platform")
}

func (s *Service) platformProviderHasBoundDomains(ctx context.Context, providerAccountID uint64) (bool, error) {
	domains, err := s.domainRepo.ListAll(ctx)
	if err != nil {
		return false, err
	}
	for _, item := range domains {
		if !isPlatformDomain(item) {
			continue
		}
		if item.ProviderAccountID != nil && *item.ProviderAccountID == providerAccountID {
			return true, nil
		}
	}
	return false, nil
}

func (s *Service) requirePlatformProviderAccount(ctx context.Context, providerAccountID uint64) (domain.ProviderAccount, error) {
	item, err := s.domainRepo.GetProviderAccountByID(ctx, providerAccountID)
	if err != nil {
		return domain.ProviderAccount{}, err
	}
	if !isPlatformProviderAccount(item) {
		return domain.ProviderAccount{}, domain.ErrProviderAccountNotFound
	}
	return item, nil
}

func (s *Service) ListAPIKeys(ctx context.Context, actorID uint64) ([]portal.APIKey, error) {
	items, err := s.portalRepo.ListAPIKeysByUser(ctx, actorID)
	if err != nil {
		return nil, err
	}
	active := make([]portal.APIKey, 0, len(items))
	for _, item := range items {
		if item.Status != "active" {
			continue
		}
		active = append(active, item)
	}
	return normalizeAdminAPIKeys(active), nil
}

func (s *Service) CreateAPIKey(ctx context.Context, actorID uint64, input portal.CreateAPIKeyInput) (portal.APIKey, error) {
	created, err := portal.NewService(s.portalRepo, s.authRepo).CreateAPIKey(ctx, actorID, input)
	if err != nil {
		return portal.APIKey{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.api_key.create", "api_key", strconv.FormatUint(created.ID, 10), map[string]any{
		"targetUserId":      created.UserID,
		"status":            created.Status,
		"scopeCount":        len(created.Scopes),
		"bindingCount":      len(created.DomainBindings),
		"domainAccessMode":  created.ResourcePolicy.DomainAccessMode,
		"allowOwnedPrivate": created.ResourcePolicy.AllowOwnedPrivateDomains,
		"allowPlatform":     created.ResourcePolicy.AllowPlatformPublicDomains,
		"allowPublicPool":   created.ResourcePolicy.AllowUserPublishedDomains,
	})
	return created, nil
}

func (s *Service) RotateAPIKey(ctx context.Context, actorID uint64, apiKeyID uint64) (portal.APIKey, error) {
	existing, err := s.findAPIKeyByID(ctx, actorID, apiKeyID)
	if err != nil {
		return portal.APIKey{}, err
	}

	rotated, err := portal.NewService(s.portalRepo, s.authRepo).RotateAPIKey(ctx, existing.UserID, apiKeyID)
	if err != nil {
		return portal.APIKey{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.api_key.rotate", "api_key", strconv.FormatUint(rotated.ID, 10), map[string]any{
		"targetUserId": rotated.UserID,
		"status":       rotated.Status,
		"rotatedAt":    rotated.RotatedAt,
	})
	return rotated, nil
}

func (s *Service) RevokeAPIKey(ctx context.Context, actorID uint64, apiKeyID uint64) (portal.APIKey, error) {
	existing, err := s.findAPIKeyByID(ctx, actorID, apiKeyID)
	if err != nil {
		return portal.APIKey{}, err
	}

	revoked, err := portal.NewService(s.portalRepo, s.authRepo).RevokeAPIKey(ctx, existing.UserID, apiKeyID)
	if err != nil {
		return portal.APIKey{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.api_key.revoke", "api_key", strconv.FormatUint(revoked.ID, 10), map[string]any{
		"targetUserId": revoked.UserID,
		"status":       revoked.Status,
		"revokedAt":    revoked.RevokedAt,
	})
	return revoked, nil
}

func (s *Service) ListWebhooks(ctx context.Context) ([]portal.Webhook, error) {
	return s.portalRepo.ListAllWebhooks(ctx)
}

func (s *Service) CreateWebhook(ctx context.Context, actorID uint64, userID uint64, name string, targetURL string, events []string) (portal.Webhook, error) {
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return portal.Webhook{}, err
	}

	created, err := portal.NewService(s.portalRepo, s.authRepo).CreateWebhook(ctx, userID, name, targetURL, events)
	if err != nil {
		return portal.Webhook{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.webhook.create", "webhook", strconv.FormatUint(created.ID, 10), map[string]any{
		"targetUserId":   created.UserID,
		"targetUsername": user.Username,
		"name":           created.Name,
		"targetUrl":      created.TargetURL,
		"eventCount":     len(created.Events),
		"enabled":        created.Enabled,
	})
	return created, nil
}

func (s *Service) UpdateWebhook(ctx context.Context, actorID uint64, webhookID uint64, name string, targetURL string, events []string) (portal.Webhook, error) {
	existing, err := s.findWebhookByID(ctx, webhookID)
	if err != nil {
		return portal.Webhook{}, err
	}

	updated, err := portal.NewService(s.portalRepo, s.authRepo).UpdateWebhook(ctx, existing.UserID, webhookID, name, targetURL, events)
	if err != nil {
		return portal.Webhook{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.webhook.update", "webhook", strconv.FormatUint(updated.ID, 10), map[string]any{
		"targetUserId": updated.UserID,
		"name":         updated.Name,
		"targetUrl":    updated.TargetURL,
		"eventCount":   len(updated.Events),
		"enabled":      updated.Enabled,
	})
	return updated, nil
}

func (s *Service) ToggleWebhook(ctx context.Context, actorID uint64, webhookID uint64, enabled bool) (portal.Webhook, error) {
	existing, err := s.findWebhookByID(ctx, webhookID)
	if err != nil {
		return portal.Webhook{}, err
	}

	updated, err := portal.NewService(s.portalRepo, s.authRepo).ToggleWebhook(ctx, existing.UserID, webhookID, enabled)
	if err != nil {
		return portal.Webhook{}, err
	}

	_, _ = s.auditRepo.Create(ctx, actorID, "admin.webhook.toggle", "webhook", strconv.FormatUint(updated.ID, 10), map[string]any{
		"targetUserId": updated.UserID,
		"enabled":      updated.Enabled,
	})
	return updated, nil
}

func (s *Service) ListNotices(ctx context.Context) ([]portal.Notice, error) {
	return s.portalRepo.ListNotices(ctx)
}

func (s *Service) CreateNotice(ctx context.Context, title string, body string, category string, level string) (portal.Notice, error) {
	return portal.NewService(s.portalRepo, s.authRepo).CreateNotice(ctx, title, body, category, level)
}

func (s *Service) UpdateNotice(ctx context.Context, actorID uint64, noticeID uint64, title string, body string, category string, level string) (portal.Notice, error) {
	updated, err := portal.NewService(s.portalRepo, s.authRepo).UpdateNotice(ctx, noticeID, title, body, category, level)
	if err != nil {
		return portal.Notice{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.notice.update", "notice", strconv.FormatUint(updated.ID, 10), map[string]any{
		"title":    updated.Title,
		"category": updated.Category,
		"level":    updated.Level,
	})
	return updated, nil
}

func (s *Service) DeleteNotice(ctx context.Context, actorID uint64, noticeID uint64) error {
	if err := portal.NewService(s.portalRepo, s.authRepo).DeleteNotice(ctx, noticeID); err != nil {
		return err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.notice.delete", "notice", strconv.FormatUint(noticeID, 10), map[string]any{
		"noticeId": noticeID,
	})
	return nil
}

func (s *Service) ListDocs(ctx context.Context) ([]portal.DocArticle, error) {
	return portal.NewService(s.portalRepo, s.authRepo).ListDocs(ctx)
}

func (s *Service) CreateDoc(ctx context.Context, actorID uint64, title string, category string, summary string, readTimeMin int, tags []string) (portal.DocArticle, error) {
	item, err := portal.NewService(s.portalRepo, s.authRepo).CreateDoc(ctx, title, category, summary, readTimeMin, tags)
	if err != nil {
		return portal.DocArticle{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.doc.create", "doc", item.ID, map[string]any{
		"title":       item.Title,
		"category":    item.Category,
		"readTimeMin": item.ReadTimeMin,
		"tagCount":    len(item.Tags),
	})
	return item, nil
}

func (s *Service) UpdateDoc(ctx context.Context, actorID uint64, docID string, title string, category string, summary string, readTimeMin int, tags []string) (portal.DocArticle, error) {
	item, err := portal.NewService(s.portalRepo, s.authRepo).UpdateDoc(ctx, docID, title, category, summary, readTimeMin, tags)
	if err != nil {
		return portal.DocArticle{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.doc.update", "doc", item.ID, map[string]any{
		"title":       item.Title,
		"category":    item.Category,
		"readTimeMin": item.ReadTimeMin,
		"tagCount":    len(item.Tags),
	})
	return item, nil
}

func (s *Service) DeleteDoc(ctx context.Context, actorID uint64, docID string) error {
	if err := portal.NewService(s.portalRepo, s.authRepo).DeleteDoc(ctx, docID); err != nil {
		return err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.doc.delete", "doc", docID, map[string]any{
		"docId": docID,
	})
	return nil
}

type DailyStatItem struct {
	Date            string `json:"date"`
	TotalMessages   int    `json:"totalMessages"`
	ActiveUsers     int    `json:"activeUsers"`
	ActiveMailboxes int    `json:"activeMailboxes"`
}

func (s *Service) ExportDailyStats(ctx context.Context) ([]DailyStatItem, error) {
	today := time.Now().Format("2006-01-02")
	users, err := s.authRepo.ListUsers(ctx)
	if err != nil {
		return nil, err
	}
	activeUsers := 0
	for _, user := range users {
		if user.Status == "active" {
			activeUsers++
		}
	}
	return []DailyStatItem{
		{
			Date:            today,
			TotalMessages:   s.messageRepo.CountToday(ctx),
			ActiveUsers:     activeUsers,
			ActiveMailboxes: s.mailboxRepo.CountActive(ctx),
		},
	}, nil
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

func (s *Service) invalidateDomainCaches(ctx context.Context) {
	if s.cache == nil {
		return
	}
	_ = s.cache.Delete(ctx, adminOverviewCacheKey())
	_ = s.cache.DeleteByPattern(ctx, "cache:dashboard:user:*")
}

func (s *Service) findAPIKeyByID(ctx context.Context, userID uint64, apiKeyID uint64) (portal.APIKey, error) {
	items, err := s.portalRepo.ListAPIKeysByUser(ctx, userID)
	if err != nil {
		return portal.APIKey{}, err
	}
	for _, item := range items {
		if item.ID == apiKeyID {
			return item, nil
		}
	}
	return portal.APIKey{}, portal.ErrNotFound
}

func (s *Service) findWebhookByID(ctx context.Context, webhookID uint64) (portal.Webhook, error) {
	items, err := s.portalRepo.ListAllWebhooks(ctx)
	if err != nil {
		return portal.Webhook{}, err
	}
	for _, item := range items {
		if item.ID == webhookID {
			return item, nil
		}
	}
	return portal.Webhook{}, portal.ErrNotFound
}

func (s *Service) invalidateMailboxCaches(ctx context.Context, userID uint64) {
	if s.cache == nil {
		return
	}
	_ = s.cache.Delete(ctx, adminOverviewCacheKey(), fmt.Sprintf("cache:dashboard:user:%d", userID))
}

func normalizeRoleCodes(roles []string) []string {
	if len(roles) == 0 {
		return nil
	}

	seen := make(map[string]struct{}, len(roles))
	items := make([]string, 0, len(roles))
	for _, role := range roles {
		if role == "" {
			continue
		}
		if _, ok := seen[role]; ok {
			continue
		}
		seen[role] = struct{}{}
		items = append(items, role)
	}
	sort.Strings(items)
	return items
}

func (s *Service) countAdminUsers(ctx context.Context) (int, error) {
	users, err := s.authRepo.ListUsers(ctx)
	if err != nil {
		return 0, err
	}
	count := 0
	for _, user := range users {
		if containsRole(user.Roles, "admin") {
			count++
		}
	}
	return count, nil
}

func (s *Service) buildUserFeedItem(ctx context.Context, actorID uint64, user auth.User, auditAction string, auditDetail map[string]any) (UserFeedItem, error) {
	mailboxes, err := s.mailboxRepo.ListByUserID(ctx, user.ID)
	if err != nil {
		return UserFeedItem{}, err
	}
	mailboxes = activeAdminMailboxesOnly(mailboxes)

	_, _ = s.auditRepo.Create(ctx, actorID, auditAction, "user", strconv.FormatUint(user.ID, 10), auditDetail)
	return UserFeedItem{
		ID:            user.ID,
		Username:      user.Username,
		Email:         user.Email,
		Status:        user.Status,
		EmailVerified: user.EmailVerified,
		Roles:         user.Roles,
		Mailboxes:     len(mailboxes),
	}, nil
}

func containsRole(roles []string, target string) bool {
	for _, role := range roles {
		if role == target {
			return true
		}
	}
	return false
}

func isValidUserStatus(status string) bool {
	switch status {
	case "active", "pending_verification", "disabled", "banned":
		return true
	default:
		return false
	}
}

func normalizeAdminAPIKey(item portal.APIKey) portal.APIKey {
	item.KeyPreview = portal.MaskAPIKeySecret(item.KeyPreview)
	item.PlainSecret = ""
	if item.Scopes == nil {
		item.Scopes = []string{}
	}
	if item.DomainBindings == nil {
		item.DomainBindings = []portal.APIKeyDomainBinding{}
	}
	return item
}

func activeAdminMailboxesOnly(items []mailbox.Mailbox) []mailbox.Mailbox {
	now := time.Now()
	filtered := make([]mailbox.Mailbox, 0, len(items))
	for _, item := range items {
		if item.Status != "active" {
			continue
		}
		if !item.ExpiresAt.After(now) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func normalizeAdminAPIKeys(items []portal.APIKey) []portal.APIKey {
	if len(items) == 0 {
		return []portal.APIKey{}
	}

	output := make([]portal.APIKey, 0, len(items))
	for _, item := range items {
		output = append(output, normalizeAdminAPIKey(item))
	}
	return output
}
