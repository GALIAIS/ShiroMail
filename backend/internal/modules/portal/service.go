package portal

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"shiro-email/backend/internal/modules/auth"
	"shiro-email/backend/internal/shared/security"
)

var ErrNotFound = errors.New("portal record not found")

type Service struct {
	repo     Repository
	authRepo auth.Repository
}

type CreateAPIKeyInput struct {
	Name           string
	Scopes         []string
	ExpiresAt      *time.Time
	ResourcePolicy APIKeyResourcePolicy
	DomainBindings []APIKeyDomainBinding
}

func NewService(repo Repository, authRepo auth.Repository) *Service {
	return &Service{repo: repo, authRepo: authRepo}
}

func (s *Service) Overview(ctx context.Context, userID uint64) (ProfileOverview, error) {
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return ProfileOverview{}, err
	}
	if err := s.ensureUserDefaults(ctx, user); err != nil {
		return ProfileOverview{}, err
	}
	profile, err := s.repo.GetProfileSettings(ctx, userID)
	if err != nil {
		return ProfileOverview{}, err
	}
	billing, err := s.repo.GetBillingProfile(ctx, userID)
	if err != nil {
		return ProfileOverview{}, err
	}
	apiKeys, err := s.repo.ListAPIKeysByUser(ctx, userID)
	if err != nil {
		return ProfileOverview{}, err
	}
	webhooks, err := s.repo.ListWebhooksByUser(ctx, userID)
	if err != nil {
		return ProfileOverview{}, err
	}
	feedback, err := s.repo.ListFeedbackByUser(ctx, userID)
	if err != nil {
		return ProfileOverview{}, err
	}
	notices, err := s.repo.ListNotices(ctx)
	if err != nil {
		return ProfileOverview{}, err
	}

	activeAPIKeys := 0
	for _, item := range apiKeys {
		if item.Status == "active" {
			activeAPIKeys++
		}
	}

	enabledWebhooks := 0
	for _, item := range webhooks {
		if item.Enabled {
			enabledWebhooks++
		}
	}

	openFeedback := 0
	for _, item := range feedback {
		if item.Status != "closed" {
			openFeedback++
		}
	}

	return ProfileOverview{
		Username:            user.Username,
		Email:               user.Email,
		DisplayName:         profile.DisplayName,
		MailboxQuota:        billing.MailboxQuota,
		DomainQuota:         billing.DomainQuota,
		ActiveAPIKeyCount:   activeAPIKeys,
		EnabledWebhookCount: enabledWebhooks,
		OpenFeedbackCount:   openFeedback,
		NoticeCount:         len(notices),
		BalanceCents:        s.repo.BalanceSum(ctx, userID),
	}, nil
}

func (s *Service) ListNotices(ctx context.Context) ([]Notice, error) {
	return s.repo.ListNotices(ctx)
}

func (s *Service) CreateNotice(ctx context.Context, title string, body string, category string, level string) (Notice, error) {
	return s.repo.CreateNotice(ctx, Notice{
		Title:       strings.TrimSpace(title),
		Body:        strings.TrimSpace(body),
		Category:    strings.TrimSpace(category),
		Level:       strings.TrimSpace(level),
		PublishedAt: time.Now(),
	})
}

func (s *Service) UpdateNotice(ctx context.Context, id uint64, title string, body string, category string, level string) (Notice, error) {
	return s.repo.UpdateNotice(ctx, Notice{
		ID:       id,
		Title:    strings.TrimSpace(title),
		Body:     strings.TrimSpace(body),
		Category: strings.TrimSpace(category),
		Level:    strings.TrimSpace(level),
	})
}

func (s *Service) DeleteNotice(ctx context.Context, id uint64) error {
	return s.repo.DeleteNotice(ctx, id)
}

func (s *Service) ListFeedback(ctx context.Context, userID uint64) ([]FeedbackTicket, error) {
	return s.repo.ListFeedbackByUser(ctx, userID)
}

func (s *Service) CreateFeedback(ctx context.Context, userID uint64, category string, subject string, content string) (FeedbackTicket, error) {
	return s.repo.CreateFeedback(ctx, FeedbackTicket{
		UserID:   userID,
		Category: strings.TrimSpace(category),
		Subject:  strings.TrimSpace(subject),
		Content:  strings.TrimSpace(content),
		Status:   "open",
	})
}

func (s *Service) ListAPIKeys(ctx context.Context, userID uint64) ([]APIKey, error) {
	items, err := s.repo.ListAPIKeysByUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	normalized := normalizeAPIKeys(items)
	filtered := make([]APIKey, 0, len(normalized))
	for _, item := range normalized {
		if item.Status != "active" {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered, nil
}

func (s *Service) CreateAPIKey(ctx context.Context, userID uint64, input CreateAPIKeyInput) (APIKey, error) {
	plainSecret, err := generatePreview("sk_live_")
	if err != nil {
		return APIKey{}, err
	}
	secretHash, err := security.HashPassword(plainSecret)
	if err != nil {
		return APIKey{}, err
	}
	domainBindings := sanitizeAPIKeyDomainBindings(input.DomainBindings)
	created, err := s.repo.CreateAPIKey(ctx, APIKey{
		UserID:         userID,
		Name:           strings.TrimSpace(input.Name),
		KeyPrefix:      apiKeyPrefix(plainSecret),
		KeyPreview:     MaskAPIKeySecret(plainSecret),
		SecretHash:     secretHash,
		Status:         "active",
		Scopes:         sanitizeAPIKeyScopes(input.Scopes),
		ExpiresAt:      input.ExpiresAt,
		ResourcePolicy: normalizeAPIKeyResourcePolicy(input.ResourcePolicy, len(domainBindings) > 0),
		DomainBindings: domainBindings,
	})
	if err != nil {
		return APIKey{}, err
	}
	created = normalizeAPIKey(created)
	created.PlainSecret = plainSecret
	return created, nil
}

func (s *Service) RotateAPIKey(ctx context.Context, userID uint64, apiKeyID uint64) (APIKey, error) {
	plainSecret, err := generatePreview("sk_live_")
	if err != nil {
		return APIKey{}, err
	}
	secretHash, err := security.HashPassword(plainSecret)
	if err != nil {
		return APIKey{}, err
	}
	item, err := s.repo.RotateAPIKey(ctx, userID, apiKeyID, plainSecret, secretHash)
	if err != nil {
		return APIKey{}, err
	}
	item = normalizeAPIKey(item)
	item.PlainSecret = plainSecret
	return item, nil
}

func (s *Service) RevokeAPIKey(ctx context.Context, userID uint64, apiKeyID uint64) (APIKey, error) {
	item, err := s.repo.RevokeAPIKey(ctx, userID, apiKeyID)
	if err != nil {
		return APIKey{}, err
	}
	return normalizeAPIKey(item), nil
}

func (s *Service) ListWebhooks(ctx context.Context, userID uint64) ([]Webhook, error) {
	return s.repo.ListWebhooksByUser(ctx, userID)
}

func (s *Service) CreateWebhook(ctx context.Context, userID uint64, name string, targetURL string, events []string) (Webhook, error) {
	preview, err := generatePreview("whsec_")
	if err != nil {
		return Webhook{}, err
	}
	return s.repo.CreateWebhook(ctx, Webhook{
		UserID:        userID,
		Name:          strings.TrimSpace(name),
		TargetURL:     strings.TrimSpace(targetURL),
		SecretPreview: preview,
		Events:        sanitizeEvents(events),
		Enabled:       true,
	})
}

func (s *Service) UpdateWebhook(ctx context.Context, userID uint64, webhookID uint64, name string, targetURL string, events []string) (Webhook, error) {
	items, err := s.repo.ListWebhooksByUser(ctx, userID)
	if err != nil {
		return Webhook{}, err
	}
	for _, item := range items {
		if item.ID == webhookID {
			item.Name = strings.TrimSpace(name)
			item.TargetURL = strings.TrimSpace(targetURL)
			item.Events = sanitizeEvents(events)
			return s.repo.UpdateWebhook(ctx, item)
		}
	}
	return Webhook{}, ErrNotFound
}

func (s *Service) ToggleWebhook(ctx context.Context, userID uint64, webhookID uint64, enabled bool) (Webhook, error) {
	return s.repo.ToggleWebhook(ctx, userID, webhookID, enabled)
}

func (s *Service) ListWebhookDeliveryLogs(ctx context.Context, userID uint64, webhookID uint64) ([]WebhookDeliveryLog, error) {
	return s.repo.ListWebhookDeliveryLogs(ctx, userID, webhookID, 50)
}

func (s *Service) RetryWebhookDelivery(ctx context.Context, userID uint64, deliveryID uint64, retrier WebhookRetrier) (WebhookTestResult, error) {
	log, err := s.repo.GetWebhookDeliveryLog(ctx, userID, deliveryID)
	if err != nil {
		return WebhookTestResult{}, err
	}
	webhooks, err := s.repo.ListWebhooksByUser(ctx, userID)
	if err != nil {
		return WebhookTestResult{}, err
	}
	var targetWebhook Webhook
	found := false
	for _, wh := range webhooks {
		if wh.ID == log.WebhookID {
			targetWebhook = wh
			found = true
			break
		}
	}
	if !found {
		return WebhookTestResult{}, ErrNotFound
	}
	body := []byte(log.RequestBody)
	result := retrier.RetryDeliver(ctx, userID, targetWebhook, body)
	return result, nil
}

func (s *Service) TestWebhook(ctx context.Context, userID uint64, webhookID uint64) (Webhook, error) {
	items, err := s.repo.ListWebhooksByUser(ctx, userID)
	if err != nil {
		return Webhook{}, err
	}
	for _, item := range items {
		if item.ID == webhookID {
			return item, nil
		}
	}
	return Webhook{}, ErrNotFound
}

func (s *Service) ListDocs(ctx context.Context) ([]DocArticle, error) {
	return s.repo.ListDocs(ctx)
}

func (s *Service) CreateDoc(ctx context.Context, title string, category string, summary string, readTimeMin int, tags []string) (DocArticle, error) {
	item := DocArticle{
		ID:          buildDocArticleID(title),
		Title:       strings.TrimSpace(title),
		Category:    strings.TrimSpace(category),
		Summary:     strings.TrimSpace(summary),
		ReadTimeMin: normalizeDocReadTime(readTimeMin),
		Tags:        sanitizeDocTags(tags),
	}
	return s.repo.CreateDoc(ctx, item)
}

func (s *Service) UpdateDoc(ctx context.Context, id string, title string, category string, summary string, readTimeMin int, tags []string) (DocArticle, error) {
	return s.repo.UpdateDoc(ctx, DocArticle{
		ID:          strings.TrimSpace(id),
		Title:       strings.TrimSpace(title),
		Category:    strings.TrimSpace(category),
		Summary:     strings.TrimSpace(summary),
		ReadTimeMin: normalizeDocReadTime(readTimeMin),
		Tags:        sanitizeDocTags(tags),
	})
}

func (s *Service) DeleteDoc(ctx context.Context, id string) error {
	return s.repo.DeleteDoc(ctx, strings.TrimSpace(id))
}

func (s *Service) GetBilling(ctx context.Context, userID uint64) (BillingProfile, error) {
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return BillingProfile{}, err
	}
	if err := s.ensureUserDefaults(ctx, user); err != nil {
		return BillingProfile{}, err
	}
	return s.repo.GetBillingProfile(ctx, userID)
}

func (s *Service) GetBalance(ctx context.Context, userID uint64) (map[string]any, error) {
	items, err := s.repo.ListBalanceEntries(ctx, userID)
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"balanceCents": s.repo.BalanceSum(ctx, userID),
		"entries":      items,
	}, nil
}

func (s *Service) GetSettings(ctx context.Context, userID uint64) (ProfileSettings, error) {
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return ProfileSettings{}, err
	}
	if err := s.ensureUserDefaults(ctx, user); err != nil {
		return ProfileSettings{}, err
	}
	item, err := s.repo.GetProfileSettings(ctx, userID)
	if err != nil {
		return ProfileSettings{}, err
	}
	item.Email = user.Email
	return item, nil
}

func (s *Service) UpdateSettings(ctx context.Context, userID uint64, displayName string, locale string, timezone string, autoRefreshSeconds int) (ProfileSettings, error) {
	user, err := s.authRepo.FindUserByID(ctx, userID)
	if err != nil {
		return ProfileSettings{}, err
	}
	if err := s.ensureUserDefaults(ctx, user); err != nil {
		return ProfileSettings{}, err
	}
	current, err := s.repo.GetProfileSettings(ctx, userID)
	if err != nil {
		return ProfileSettings{}, err
	}
	current.DisplayName = strings.TrimSpace(displayName)
	current.Locale = strings.TrimSpace(locale)
	current.Timezone = strings.TrimSpace(timezone)
	current.AutoRefreshSeconds = autoRefreshSeconds
	updated, err := s.repo.UpsertProfileSettings(ctx, current)
	if err != nil {
		return ProfileSettings{}, err
	}
	updated.Email = user.Email
	return updated, nil
}

func (s *Service) ensureUserDefaults(ctx context.Context, user auth.User) error {
	return EnsureDemoData(ctx, s.repo, user)
}

func sanitizeEvents(items []string) []string {
	if len(items) == 0 {
		return SupportedWebhookEvents
	}
	output := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		// Allow wildcard or any recognized event type
		if trimmed != "*" && !slices.Contains(SupportedWebhookEvents, trimmed) {
			continue
		}
		seen[trimmed] = struct{}{}
		output = append(output, trimmed)
	}
	if len(output) == 0 {
		return SupportedWebhookEvents
	}
	return output
}

func sanitizeAPIKeyScopes(items []string) []string {
	if len(items) == 0 {
		return []string{
			"mailboxes.read",
			"mailboxes.write",
			"messages.read",
			"messages.write",
			"messages.attachments.read",
			"domains.read",
			"domains.verify",
		}
	}

	output := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		output = append(output, trimmed)
	}
	if len(output) == 0 {
		return sanitizeAPIKeyScopes(nil)
	}
	slices.Sort(output)
	return output
}

func normalizeAPIKeyResourcePolicy(policy APIKeyResourcePolicy, hasBindings bool) APIKeyResourcePolicy {
	if !hasBindings {
		return APIKeyResourcePolicy{
			DomainAccessMode:           "mixed",
			AllowPlatformPublicDomains: true,
			AllowUserPublishedDomains:  true,
			AllowOwnedPrivateDomains:   true,
			AllowProviderMutation:      policy.AllowProviderMutation,
			AllowProtectedRecordWrite:  policy.AllowProtectedRecordWrite,
		}
	}

	mode := strings.TrimSpace(policy.DomainAccessMode)
	if mode == "" {
		mode = "mixed"
	}

	allowPlatform := policy.AllowPlatformPublicDomains
	allowUserPublished := policy.AllowUserPublishedDomains
	allowOwned := policy.AllowOwnedPrivateDomains
	if !allowPlatform && !allowUserPublished && !allowOwned {
		switch mode {
		case "public_only":
			allowPlatform = true
			allowUserPublished = true
		case "private_only":
			allowOwned = true
		default:
			allowPlatform = true
			allowUserPublished = true
			allowOwned = true
		}
	}

	return APIKeyResourcePolicy{
		DomainAccessMode:           mode,
		AllowPlatformPublicDomains: allowPlatform,
		AllowUserPublishedDomains:  allowUserPublished,
		AllowOwnedPrivateDomains:   allowOwned,
		AllowProviderMutation:      policy.AllowProviderMutation,
		AllowProtectedRecordWrite:  policy.AllowProtectedRecordWrite,
	}
}

func sanitizeAPIKeyDomainBindings(items []APIKeyDomainBinding) []APIKeyDomainBinding {
	if len(items) == 0 {
		return []APIKeyDomainBinding{}
	}

	output := make([]APIKeyDomainBinding, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		if item.ZoneID == nil && item.NodeID == nil {
			continue
		}

		accessLevel := strings.TrimSpace(item.AccessLevel)
		if accessLevel == "" {
			accessLevel = "read"
		}

		zoneKey := "nil"
		if item.ZoneID != nil {
			zoneKey = fmt.Sprintf("%d", *item.ZoneID)
		}

		nodeKey := "nil"
		if item.NodeID != nil {
			nodeKey = fmt.Sprintf("%d", *item.NodeID)
		}

		key := zoneKey + ":" + nodeKey + ":" + accessLevel
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}

		output = append(output, APIKeyDomainBinding{
			ID:          item.ID,
			ZoneID:      item.ZoneID,
			NodeID:      item.NodeID,
			AccessLevel: accessLevel,
		})
	}
	return output
}

func normalizeAPIKey(item APIKey) APIKey {
	item.KeyPreview = MaskAPIKeySecret(item.KeyPreview)
	item.Scopes = sanitizeAPIKeyScopes(item.Scopes)
	item.DomainBindings = sanitizeAPIKeyDomainBindings(item.DomainBindings)
	item.ResourcePolicy = normalizeAPIKeyResourcePolicy(item.ResourcePolicy, len(item.DomainBindings) > 0)
	item.PlainSecret = ""
	return item
}

func normalizeAPIKeys(items []APIKey) []APIKey {
	if len(items) == 0 {
		return []APIKey{}
	}

	output := make([]APIKey, 0, len(items))
	for _, item := range items {
		output = append(output, normalizeAPIKey(item))
	}
	return output
}

func MaskAPIKeySecret(secret string) string {
	trimmed := strings.TrimSpace(secret)
	if trimmed == "" {
		return ""
	}
	if len(trimmed) <= 16 {
		return trimmed
	}
	return trimmed[:12] + "..." + trimmed[len(trimmed)-4:]
}

func generatePreview(prefix string) (string, error) {
	buf := make([]byte, 18)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("generate preview: %w", err)
	}
	return prefix + base64.RawURLEncoding.EncodeToString(buf), nil
}

var docArticleIDPattern = regexp.MustCompile(`[^a-z0-9]+`)

func buildDocArticleID(title string) string {
	base := strings.ToLower(strings.TrimSpace(title))
	base = docArticleIDPattern.ReplaceAllString(base, "-")
	base = strings.Trim(base, "-")
	if base == "" {
		base = "doc"
	}
	return base + "-" + strconv.FormatInt(time.Now().UnixNano(), 36)
}

func sanitizeDocTags(items []string) []string {
	if len(items) == 0 {
		return []string{}
	}

	output := make([]string, 0, len(items))
	seen := map[string]struct{}{}
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed == "" {
			continue
		}
		if _, ok := seen[trimmed]; ok {
			continue
		}
		seen[trimmed] = struct{}{}
		output = append(output, trimmed)
	}
	slices.Sort(output)
	return output
}

func normalizeDocReadTime(minutes int) int {
	if minutes <= 0 {
		return 5
	}
	return minutes
}
