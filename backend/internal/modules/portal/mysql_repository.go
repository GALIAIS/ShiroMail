package portal

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"

	"shiro-email/backend/internal/database"
	"shiro-email/backend/internal/shared/security"
)

type MySQLRepository struct {
	db *gorm.DB
}

func NewMySQLRepository(db *gorm.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (r *MySQLRepository) ListNotices(ctx context.Context) ([]Notice, error) {
	var rows []database.NoticeRow
	if err := r.db.WithContext(ctx).Order("published_at DESC, id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]Notice, 0, len(rows))
	for _, row := range rows {
		items = append(items, Notice{ID: row.ID, Title: row.Title, Body: row.Body, Category: row.Category, Level: row.Level, PublishedAt: row.PublishedAt})
	}
	return items, nil
}

func (r *MySQLRepository) CreateNotice(ctx context.Context, item Notice) (Notice, error) {
	row := database.NoticeRow{
		Title:       item.Title,
		Body:        item.Body,
		Category:    item.Category,
		Level:       item.Level,
		PublishedAt: item.PublishedAt,
	}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return Notice{}, err
	}
	return Notice{ID: row.ID, Title: row.Title, Body: row.Body, Category: row.Category, Level: row.Level, PublishedAt: row.PublishedAt}, nil
}

func (r *MySQLRepository) UpdateNotice(ctx context.Context, item Notice) (Notice, error) {
	result := r.db.WithContext(ctx).Model(&database.NoticeRow{}).Where("id = ?", item.ID).Updates(map[string]any{
		"title":      item.Title,
		"body":       item.Body,
		"category":   item.Category,
		"level":      item.Level,
		"updated_at": time.Now(),
	})
	if result.Error != nil {
		return Notice{}, result.Error
	}
	if result.RowsAffected == 0 {
		return Notice{}, ErrNotFound
	}

	var row database.NoticeRow
	if err := r.db.WithContext(ctx).Where("id = ?", item.ID).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Notice{}, ErrNotFound
		}
		return Notice{}, err
	}
	return Notice{ID: row.ID, Title: row.Title, Body: row.Body, Category: row.Category, Level: row.Level, PublishedAt: row.PublishedAt}, nil
}

func (r *MySQLRepository) DeleteNotice(ctx context.Context, id uint64) error {
	result := r.db.WithContext(ctx).Delete(&database.NoticeRow{}, "id = ?", id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *MySQLRepository) ListFeedbackByUser(ctx context.Context, userID uint64) ([]FeedbackTicket, error) {
	var rows []database.FeedbackRow
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]FeedbackTicket, 0, len(rows))
	for _, row := range rows {
		items = append(items, FeedbackTicket{ID: row.ID, UserID: row.UserID, Category: row.Category, Subject: row.Subject, Content: row.Content, Status: row.Status, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt})
	}
	return items, nil
}

func (r *MySQLRepository) CreateFeedback(ctx context.Context, item FeedbackTicket) (FeedbackTicket, error) {
	row := database.FeedbackRow{UserID: item.UserID, Category: item.Category, Subject: item.Subject, Content: item.Content, Status: item.Status}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return FeedbackTicket{}, err
	}
	return FeedbackTicket{ID: row.ID, UserID: row.UserID, Category: row.Category, Subject: row.Subject, Content: row.Content, Status: row.Status, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}, nil
}

func (r *MySQLRepository) ListAPIKeysByUser(ctx context.Context, userID uint64) ([]APIKey, error) {
	var rows []database.APIKeyRow
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return r.hydrateAPIKeys(ctx, rows)
}

func (r *MySQLRepository) CreateAPIKey(ctx context.Context, item APIKey) (APIKey, error) {
	tx := r.db.WithContext(ctx).Begin()
	if tx.Error != nil {
		return APIKey{}, tx.Error
	}

	row := database.APIKeyRow{
		UserID:     item.UserID,
		Name:       item.Name,
		KeyPrefix:  item.KeyPrefix,
		KeyPreview: item.KeyPreview,
		SecretHash: item.SecretHash,
		Status:     item.Status,
		ExpiresAt:  item.ExpiresAt,
	}
	if err := tx.Create(&row).Error; err != nil {
		tx.Rollback()
		return APIKey{}, err
	}
	if err := replaceAPIKeyRelations(ctx, tx, row.ID, item.Scopes, item.ResourcePolicy, item.DomainBindings); err != nil {
		tx.Rollback()
		return APIKey{}, err
	}
	if err := tx.Commit().Error; err != nil {
		return APIKey{}, err
	}
	return r.getAPIKey(ctx, item.UserID, row.ID)
}

func (r *MySQLRepository) AuthenticateAPIKey(ctx context.Context, presented string) (APIKey, error) {
	prefix := apiKeyPrefix(presented)
	if prefix == "" {
		return APIKey{}, ErrNotFound
	}

	var rows []database.APIKeyRow
	if err := r.db.WithContext(ctx).
		Where("key_prefix = ? AND status = ?", prefix, "active").
		Order("id DESC").
		Find(&rows).Error; err != nil {
		return APIKey{}, err
	}

	for _, row := range rows {
		if row.KeyPreview != presented && !security.VerifyPassword(row.SecretHash, presented) {
			continue
		}

		now := time.Now()
		if row.ExpiresAt != nil && row.ExpiresAt.Before(now) {
			continue
		}

		if err := r.db.WithContext(ctx).
			Model(&database.APIKeyRow{}).
			Where("id = ?", row.ID).
			Update("last_used_at", now).Error; err != nil {
			return APIKey{}, err
		}

		row.LastUsedAt = &now
		items, err := r.hydrateAPIKeys(ctx, []database.APIKeyRow{row})
		if err != nil {
			return APIKey{}, err
		}
		if len(items) == 0 {
			break
		}
		return items[0], nil
	}

	return APIKey{}, ErrNotFound
}

func (r *MySQLRepository) ListAllAPIKeys(ctx context.Context) ([]APIKey, error) {
	var rows []database.APIKeyRow
	if err := r.db.WithContext(ctx).Order("id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	return r.hydrateAPIKeys(ctx, rows)
}

func (r *MySQLRepository) RotateAPIKey(ctx context.Context, userID uint64, apiKeyID uint64, preview string, secretHash string) (APIKey, error) {
	now := time.Now()
	result := r.db.WithContext(ctx).Model(&database.APIKeyRow{}).Where("id = ? AND user_id = ?", apiKeyID, userID).Updates(map[string]any{
		"key_prefix":  apiKeyPrefix(preview),
		"key_preview": preview,
		"secret_hash": secretHash,
		"rotated_at":  now,
	})
	if result.Error != nil {
		return APIKey{}, result.Error
	}
	if result.RowsAffected == 0 {
		return APIKey{}, ErrNotFound
	}
	return r.getAPIKey(ctx, userID, apiKeyID)
}

func (r *MySQLRepository) RevokeAPIKey(ctx context.Context, userID uint64, apiKeyID uint64) (APIKey, error) {
	now := time.Now()
	result := r.db.WithContext(ctx).Model(&database.APIKeyRow{}).Where("id = ? AND user_id = ?", apiKeyID, userID).Updates(map[string]any{"status": "revoked", "revoked_at": now})
	if result.Error != nil {
		return APIKey{}, result.Error
	}
	if result.RowsAffected == 0 {
		return APIKey{}, ErrNotFound
	}
	return r.getAPIKey(ctx, userID, apiKeyID)
}

func (r *MySQLRepository) ListWebhooksByUser(ctx context.Context, userID uint64) ([]Webhook, error) {
	var rows []database.WebhookRow
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]Webhook, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapWebhookRow(row))
	}
	return items, nil
}

func (r *MySQLRepository) CreateWebhook(ctx context.Context, item Webhook) (Webhook, error) {
	payload, err := json.Marshal(item.Events)
	if err != nil {
		return Webhook{}, err
	}
	row := database.WebhookRow{UserID: item.UserID, Name: item.Name, TargetURL: item.TargetURL, SecretPreview: item.SecretPreview, EventsJSON: payload, Enabled: item.Enabled}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return Webhook{}, err
	}
	return mapWebhookRow(row), nil
}

func (r *MySQLRepository) ListAllWebhooks(ctx context.Context) ([]Webhook, error) {
	var rows []database.WebhookRow
	if err := r.db.WithContext(ctx).Order("id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]Webhook, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapWebhookRow(row))
	}
	return items, nil
}

func (r *MySQLRepository) UpdateWebhook(ctx context.Context, item Webhook) (Webhook, error) {
	payload, err := json.Marshal(item.Events)
	if err != nil {
		return Webhook{}, err
	}
	result := r.db.WithContext(ctx).Model(&database.WebhookRow{}).Where("id = ? AND user_id = ?", item.ID, item.UserID).Updates(map[string]any{
		"name":           item.Name,
		"target_url":     item.TargetURL,
		"events_json":    payload,
		"enabled":        item.Enabled,
		"secret_preview": item.SecretPreview,
		"updated_at":     time.Now(),
	})
	if result.Error != nil {
		return Webhook{}, result.Error
	}
	if result.RowsAffected == 0 {
		return Webhook{}, ErrNotFound
	}
	return r.getWebhook(ctx, item.UserID, item.ID)
}

func (r *MySQLRepository) ToggleWebhook(ctx context.Context, userID uint64, webhookID uint64, enabled bool) (Webhook, error) {
	result := r.db.WithContext(ctx).Model(&database.WebhookRow{}).Where("id = ? AND user_id = ?", webhookID, userID).Updates(map[string]any{"enabled": enabled, "updated_at": time.Now()})
	if result.Error != nil {
		return Webhook{}, result.Error
	}
	if result.RowsAffected == 0 {
		return Webhook{}, ErrNotFound
	}
	return r.getWebhook(ctx, userID, webhookID)
}

func (r *MySQLRepository) ListWebhookDeliveryLogs(ctx context.Context, userID uint64, webhookID uint64, limit int) ([]WebhookDeliveryLog, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var rows []database.WebhookDeliveryLogRow
	q := r.db.WithContext(ctx).Where("user_id = ?", userID)
	if webhookID > 0 {
		q = q.Where("webhook_id = ?", webhookID)
	}
	if err := q.Order("id DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]WebhookDeliveryLog, 0, len(rows))
	for _, row := range rows {
		items = append(items, WebhookDeliveryLog{
			ID:             row.ID,
			WebhookID:      row.WebhookID,
			Event:          row.Event,
			TargetURL:      row.TargetURL,
			ResponseStatus: row.ResponseStatus,
			LatencyMs:      row.LatencyMs,
			Success:        row.Success,
			ErrorMessage:   row.ErrorMessage,
			CreatedAt:      row.CreatedAt,
		})
	}
	return items, nil
}

func (r *MySQLRepository) ListDocs(ctx context.Context) ([]DocArticle, error) {
	var rows []database.DocArticleRow
	if err := r.db.WithContext(ctx).Order("updated_at DESC, created_at DESC, id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]DocArticle, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapDocArticleRow(row))
	}
	return items, nil
}

func (r *MySQLRepository) CreateDoc(ctx context.Context, item DocArticle) (DocArticle, error) {
	tagsJSON, err := json.Marshal(item.Tags)
	if err != nil {
		return DocArticle{}, err
	}
	row := database.DocArticleRow{
		ID:          item.ID,
		Title:       item.Title,
		Category:    item.Category,
		Summary:     item.Summary,
		ReadTimeMin: item.ReadTimeMin,
		TagsJSON:    tagsJSON,
	}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return DocArticle{}, err
	}
	return mapDocArticleRow(row), nil
}

func (r *MySQLRepository) UpdateDoc(ctx context.Context, item DocArticle) (DocArticle, error) {
	tagsJSON, err := json.Marshal(item.Tags)
	if err != nil {
		return DocArticle{}, err
	}
	result := r.db.WithContext(ctx).Model(&database.DocArticleRow{}).Where("id = ?", item.ID).Updates(map[string]any{
		"title":         item.Title,
		"category":      item.Category,
		"summary":       item.Summary,
		"read_time_min": item.ReadTimeMin,
		"tags_json":     tagsJSON,
		"updated_at":    time.Now(),
	})
	if result.Error != nil {
		return DocArticle{}, result.Error
	}
	if result.RowsAffected == 0 {
		return DocArticle{}, ErrNotFound
	}

	var row database.DocArticleRow
	if err := r.db.WithContext(ctx).Where("id = ?", item.ID).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return DocArticle{}, ErrNotFound
		}
		return DocArticle{}, err
	}
	return mapDocArticleRow(row), nil
}

func (r *MySQLRepository) DeleteDoc(ctx context.Context, id string) error {
	result := r.db.WithContext(ctx).Delete(&database.DocArticleRow{}, "id = ?", id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func (r *MySQLRepository) GetProfileSettings(ctx context.Context, userID uint64) (ProfileSettings, error) {
	var row database.UserProfileRow
	result := r.db.WithContext(ctx).Where("user_id = ?", userID).Limit(1).Find(&row)
	if result.Error != nil {
		return ProfileSettings{}, result.Error
	}
	if result.RowsAffected == 0 {
		return ProfileSettings{}, ErrNotFound
	}
	return ProfileSettings{UserID: row.UserID, DisplayName: row.DisplayName, Locale: row.Locale, Timezone: row.Timezone, AutoRefreshSeconds: row.AutoRefreshSeconds, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}, nil
}

func (r *MySQLRepository) UpsertProfileSettings(ctx context.Context, item ProfileSettings) (ProfileSettings, error) {
	values := database.UserProfileRow{UserID: item.UserID, DisplayName: item.DisplayName, Locale: item.Locale, Timezone: item.Timezone, AutoRefreshSeconds: item.AutoRefreshSeconds}
	if err := r.db.WithContext(ctx).Where("user_id = ?", item.UserID).Assign(values).FirstOrCreate(&values).Error; err != nil {
		return ProfileSettings{}, err
	}
	return r.GetProfileSettings(ctx, item.UserID)
}

func (r *MySQLRepository) GetBillingProfile(ctx context.Context, userID uint64) (BillingProfile, error) {
	var row database.BillingProfileRow
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return BillingProfile{}, ErrNotFound
		}
		return BillingProfile{}, err
	}
	return BillingProfile{UserID: row.UserID, PlanCode: row.PlanCode, PlanName: row.PlanName, Status: row.Status, MailboxQuota: row.MailboxQuota, DomainQuota: row.DomainQuota, DailyRequestLimit: row.DailyRequestLimit, RenewalAt: row.RenewalAt}, nil
}

func (r *MySQLRepository) ListBalanceEntries(ctx context.Context, userID uint64) ([]BalanceEntry, error) {
	var rows []database.BalanceEntryRow
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("created_at DESC, id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]BalanceEntry, 0, len(rows))
	for _, row := range rows {
		items = append(items, BalanceEntry{ID: row.ID, UserID: row.UserID, EntryType: row.EntryType, Amount: row.Amount, Description: row.Description, CreatedAt: row.CreatedAt})
	}
	return items, nil
}

func (r *MySQLRepository) BalanceSum(ctx context.Context, userID uint64) int64 {
	var total int64
	if err := r.db.WithContext(ctx).Model(&database.BalanceEntryRow{}).Where("user_id = ?", userID).Select("COALESCE(SUM(amount), 0)").Scan(&total).Error; err != nil {
		return 0
	}
	return total
}

func (r *MySQLRepository) getAPIKey(ctx context.Context, userID uint64, apiKeyID uint64) (APIKey, error) {
	var row database.APIKeyRow
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", apiKeyID, userID).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return APIKey{}, ErrNotFound
		}
		return APIKey{}, err
	}
	items, err := r.hydrateAPIKeys(ctx, []database.APIKeyRow{row})
	if err != nil {
		return APIKey{}, err
	}
	if len(items) == 0 {
		return APIKey{}, ErrNotFound
	}
	return items[0], nil
}

func (r *MySQLRepository) getWebhook(ctx context.Context, userID uint64, webhookID uint64) (Webhook, error) {
	var row database.WebhookRow
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", webhookID, userID).First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Webhook{}, ErrNotFound
		}
		return Webhook{}, err
	}
	return mapWebhookRow(row), nil
}

func mapAPIKeyRow(row database.APIKeyRow) APIKey {
	return APIKey{
		ID:         row.ID,
		UserID:     row.UserID,
		Name:       row.Name,
		KeyPrefix:  row.KeyPrefix,
		KeyPreview: row.KeyPreview,
		SecretHash: row.SecretHash,
		Status:     row.Status,
		ExpiresAt:  row.ExpiresAt,
		LastUsedAt: row.LastUsedAt,
		CreatedAt:  row.CreatedAt,
		RevokedAt:  row.RevokedAt,
		RotatedAt:  row.RotatedAt,
	}
}

func mapWebhookRow(row database.WebhookRow) Webhook {
	var events []string
	if len(row.EventsJSON) != 0 {
		_ = json.Unmarshal(row.EventsJSON, &events)
	}
	return Webhook{ID: row.ID, UserID: row.UserID, Name: row.Name, TargetURL: row.TargetURL, SecretPreview: row.SecretPreview, Events: events, Enabled: row.Enabled, LastDeliveredAt: row.LastDeliveredAt, CreatedAt: row.CreatedAt, UpdatedAt: row.UpdatedAt}
}

func mapDocArticleRow(row database.DocArticleRow) DocArticle {
	var tags []string
	if len(row.TagsJSON) != 0 {
		_ = json.Unmarshal(row.TagsJSON, &tags)
	}
	return DocArticle{
		ID:          row.ID,
		Title:       row.Title,
		Category:    row.Category,
		Summary:     row.Summary,
		ReadTimeMin: row.ReadTimeMin,
		Tags:        tags,
		CreatedAt:   row.CreatedAt,
		UpdatedAt:   row.UpdatedAt,
	}
}

func (r *MySQLRepository) hydrateAPIKeys(ctx context.Context, rows []database.APIKeyRow) ([]APIKey, error) {
	items := make([]APIKey, 0, len(rows))
	if len(rows) == 0 {
		return items, nil
	}

	ids := make([]uint64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}

	scopesByKey, err := r.listAPIKeyScopes(ctx, ids)
	if err != nil {
		return nil, err
	}
	policiesByKey, err := r.listAPIKeyPolicies(ctx, ids)
	if err != nil {
		return nil, err
	}
	bindingsByKey, err := r.listAPIKeyDomainBindings(ctx, ids)
	if err != nil {
		return nil, err
	}

	for _, row := range rows {
		item := mapAPIKeyRow(row)
		if scopes, ok := scopesByKey[row.ID]; ok {
			item.Scopes = scopes
		} else {
			item.Scopes = sanitizeAPIKeyScopes(nil)
		}
		item.DomainBindings = bindingsByKey[row.ID]
		if policy, ok := policiesByKey[row.ID]; ok {
			item.ResourcePolicy = policy
		} else {
			item.ResourcePolicy = normalizeAPIKeyResourcePolicy(APIKeyResourcePolicy{}, len(item.DomainBindings) > 0)
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *MySQLRepository) listAPIKeyScopes(ctx context.Context, apiKeyIDs []uint64) (map[uint64][]string, error) {
	var rows []database.APIKeyScopeRow
	if err := r.db.WithContext(ctx).Where("api_key_id IN ?", apiKeyIDs).Order("scope ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	output := make(map[uint64][]string, len(apiKeyIDs))
	for _, row := range rows {
		output[row.APIKeyID] = append(output[row.APIKeyID], row.Scope)
	}
	return output, nil
}

func (r *MySQLRepository) listAPIKeyPolicies(ctx context.Context, apiKeyIDs []uint64) (map[uint64]APIKeyResourcePolicy, error) {
	var rows []database.APIKeyResourcePolicyRow
	if err := r.db.WithContext(ctx).Where("api_key_id IN ?", apiKeyIDs).Find(&rows).Error; err != nil {
		return nil, err
	}
	output := make(map[uint64]APIKeyResourcePolicy, len(rows))
	for _, row := range rows {
		output[row.APIKeyID] = APIKeyResourcePolicy{
			DomainAccessMode:           row.DomainAccessMode,
			AllowPlatformPublicDomains: row.AllowPlatformPublicDomains,
			AllowUserPublishedDomains:  row.AllowUserPublishedDomains,
			AllowOwnedPrivateDomains:   row.AllowOwnedPrivateDomains,
			AllowProviderMutation:      row.AllowProviderMutation,
			AllowProtectedRecordWrite:  row.AllowProtectedRecordWrite,
		}
	}
	return output, nil
}

func (r *MySQLRepository) listAPIKeyDomainBindings(ctx context.Context, apiKeyIDs []uint64) (map[uint64][]APIKeyDomainBinding, error) {
	var rows []database.APIKeyDomainBindingRow
	if err := r.db.WithContext(ctx).Where("api_key_id IN ?", apiKeyIDs).Order("id ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	output := make(map[uint64][]APIKeyDomainBinding, len(rows))
	for _, row := range rows {
		output[row.APIKeyID] = append(output[row.APIKeyID], APIKeyDomainBinding{
			ID:          row.ID,
			ZoneID:      row.ZoneID,
			NodeID:      row.NodeID,
			AccessLevel: row.AccessLevel,
		})
	}
	return output, nil
}

func replaceAPIKeyRelations(ctx context.Context, db *gorm.DB, apiKeyID uint64, scopes []string, policy APIKeyResourcePolicy, bindings []APIKeyDomainBinding) error {
	if err := db.WithContext(ctx).Where("api_key_id = ?", apiKeyID).Delete(&database.APIKeyScopeRow{}).Error; err != nil {
		return err
	}

	scopeRows := make([]database.APIKeyScopeRow, 0, len(scopes))
	for _, scope := range scopes {
		scopeRows = append(scopeRows, database.APIKeyScopeRow{
			APIKeyID: apiKeyID,
			Scope:    scope,
		})
	}
	if len(scopeRows) > 0 {
		if err := db.WithContext(ctx).Create(&scopeRows).Error; err != nil {
			return err
		}
	}

	policyRow := database.APIKeyResourcePolicyRow{
		APIKeyID:                   apiKeyID,
		DomainAccessMode:           policy.DomainAccessMode,
		AllowPlatformPublicDomains: policy.AllowPlatformPublicDomains,
		AllowUserPublishedDomains:  policy.AllowUserPublishedDomains,
		AllowOwnedPrivateDomains:   policy.AllowOwnedPrivateDomains,
		AllowProviderMutation:      policy.AllowProviderMutation,
		AllowProtectedRecordWrite:  policy.AllowProtectedRecordWrite,
	}
	if policyRow.DomainAccessMode == "" {
		policyRow.DomainAccessMode = "mixed"
	}
	if err := db.WithContext(ctx).Save(&policyRow).Error; err != nil {
		return err
	}

	if err := db.WithContext(ctx).Where("api_key_id = ?", apiKeyID).Delete(&database.APIKeyDomainBindingRow{}).Error; err != nil {
		return err
	}

	bindingRows := make([]database.APIKeyDomainBindingRow, 0, len(bindings))
	for _, binding := range bindings {
		bindingRows = append(bindingRows, database.APIKeyDomainBindingRow{
			APIKeyID:    apiKeyID,
			ZoneID:      binding.ZoneID,
			NodeID:      binding.NodeID,
			AccessLevel: binding.AccessLevel,
		})
	}
	if len(bindingRows) > 0 {
		if err := db.WithContext(ctx).Create(&bindingRows).Error; err != nil {
			return err
		}
	}

	return nil
}
