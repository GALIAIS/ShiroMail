package portal

import (
	"context"
	"fmt"
	"slices"
	"sync"
	"time"

	"shiro-email/backend/internal/shared/security"
)

type MemoryRepository struct {
	mu            sync.RWMutex
	nextFeedback  uint64
	nextAPIKey    uint64
	nextWebhook   uint64
	nextDoc       uint64
	notices       []Notice
	feedback      []FeedbackTicket
	apiKeys       []APIKey
	webhooks      []Webhook
	docs          []DocArticle
	profiles      map[uint64]ProfileSettings
	billing       map[uint64]BillingProfile
	balanceByUser map[uint64][]BalanceEntry
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{
		nextFeedback:  1,
		nextAPIKey:    1,
		nextWebhook:   1,
		nextDoc:       1,
		profiles:      map[uint64]ProfileSettings{},
		billing:       map[uint64]BillingProfile{},
		balanceByUser: map[uint64][]BalanceEntry{},
	}
}

func (r *MemoryRepository) ListNotices(_ context.Context) ([]Notice, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]Notice, len(r.notices))
	copy(items, r.notices)
	slices.Reverse(items)
	return items, nil
}

func (r *MemoryRepository) CreateNotice(_ context.Context, item Notice) (Notice, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	item.ID = uint64(len(r.notices) + 1)
	if item.PublishedAt.IsZero() {
		item.PublishedAt = time.Now()
	}
	r.notices = append(r.notices, item)
	return item, nil
}

func (r *MemoryRepository) UpdateNotice(_ context.Context, item Notice) (Notice, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for index, existing := range r.notices {
		if existing.ID != item.ID {
			continue
		}
		item.PublishedAt = existing.PublishedAt
		r.notices[index] = item
		return item, nil
	}
	return Notice{}, ErrNotFound
}

func (r *MemoryRepository) DeleteNotice(_ context.Context, id uint64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for index, item := range r.notices {
		if item.ID != id {
			continue
		}
		r.notices = append(r.notices[:index], r.notices[index+1:]...)
		return nil
	}
	return ErrNotFound
}

func (r *MemoryRepository) ListFeedbackByUser(_ context.Context, userID uint64) ([]FeedbackTicket, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]FeedbackTicket, 0)
	for _, item := range r.feedback {
		if item.UserID == userID {
			items = append(items, item)
		}
	}
	slices.Reverse(items)
	return items, nil
}

func (r *MemoryRepository) CreateFeedback(_ context.Context, item FeedbackTicket) (FeedbackTicket, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	item.ID = r.nextFeedback
	r.nextFeedback++
	now := time.Now()
	item.CreatedAt = now
	item.UpdatedAt = now
	r.feedback = append(r.feedback, item)
	return item, nil
}

func (r *MemoryRepository) ListAPIKeysByUser(_ context.Context, userID uint64) ([]APIKey, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]APIKey, 0)
	for _, item := range r.apiKeys {
		if item.UserID == userID {
			items = append(items, item)
		}
	}
	slices.Reverse(items)
	return items, nil
}

func (r *MemoryRepository) CreateAPIKey(_ context.Context, item APIKey) (APIKey, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	item.ID = r.nextAPIKey
	r.nextAPIKey++
	item.CreatedAt = time.Now()
	r.apiKeys = append(r.apiKeys, item)
	return item, nil
}

func (r *MemoryRepository) AuthenticateAPIKey(_ context.Context, presented string) (APIKey, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for index, item := range r.apiKeys {
		if item.Status != "active" {
			continue
		}
		if item.KeyPreview != presented && !security.VerifyPassword(item.SecretHash, presented) {
			continue
		}

		now := time.Now()
		item.LastUsedAt = &now
		r.apiKeys[index] = item
		return item, nil
	}

	return APIKey{}, ErrNotFound
}

func (r *MemoryRepository) ListAllAPIKeys(_ context.Context) ([]APIKey, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]APIKey, len(r.apiKeys))
	copy(items, r.apiKeys)
	slices.Reverse(items)
	return items, nil
}

func (r *MemoryRepository) RotateAPIKey(_ context.Context, userID uint64, apiKeyID uint64, preview string, secretHash string) (APIKey, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	for index, item := range r.apiKeys {
		if item.UserID == userID && item.ID == apiKeyID {
			item.KeyPrefix = apiKeyPrefix(preview)
			item.KeyPreview = preview
			item.SecretHash = secretHash
			item.RotatedAt = &now
			r.apiKeys[index] = item
			return item, nil
		}
	}
	return APIKey{}, ErrNotFound
}

func (r *MemoryRepository) RevokeAPIKey(_ context.Context, userID uint64, apiKeyID uint64) (APIKey, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	for index, item := range r.apiKeys {
		if item.UserID == userID && item.ID == apiKeyID {
			item.Status = "revoked"
			item.RevokedAt = &now
			r.apiKeys[index] = item
			return item, nil
		}
	}
	return APIKey{}, ErrNotFound
}

func (r *MemoryRepository) ListWebhooksByUser(_ context.Context, userID uint64) ([]Webhook, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]Webhook, 0)
	for _, item := range r.webhooks {
		if item.UserID == userID {
			items = append(items, item)
		}
	}
	slices.Reverse(items)
	return items, nil
}

func (r *MemoryRepository) CreateWebhook(_ context.Context, item Webhook) (Webhook, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	item.ID = r.nextWebhook
	r.nextWebhook++
	now := time.Now()
	item.CreatedAt = now
	item.UpdatedAt = now
	r.webhooks = append(r.webhooks, item)
	return item, nil
}

func (r *MemoryRepository) ListAllWebhooks(_ context.Context) ([]Webhook, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]Webhook, len(r.webhooks))
	copy(items, r.webhooks)
	slices.Reverse(items)
	return items, nil
}

func (r *MemoryRepository) UpdateWebhook(_ context.Context, item Webhook) (Webhook, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for index, existing := range r.webhooks {
		if existing.ID == item.ID && existing.UserID == item.UserID {
			item.CreatedAt = existing.CreatedAt
			item.UpdatedAt = time.Now()
			r.webhooks[index] = item
			return item, nil
		}
	}
	return Webhook{}, ErrNotFound
}

func (r *MemoryRepository) ToggleWebhook(_ context.Context, userID uint64, webhookID uint64, enabled bool) (Webhook, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for index, item := range r.webhooks {
		if item.UserID == userID && item.ID == webhookID {
			item.Enabled = enabled
			item.UpdatedAt = time.Now()
			r.webhooks[index] = item
			return item, nil
		}
	}
	return Webhook{}, ErrNotFound
}

func (r *MemoryRepository) ListDocs(_ context.Context) ([]DocArticle, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]DocArticle, len(r.docs))
	copy(items, r.docs)
	slices.Reverse(items)
	return items, nil
}

func (r *MemoryRepository) CreateDoc(_ context.Context, item DocArticle) (DocArticle, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	item.ID = fmt.Sprintf("%d", r.nextDoc)
	r.nextDoc++
	item.CreatedAt = now
	item.UpdatedAt = now
	r.docs = append(r.docs, item)
	return item, nil
}

func (r *MemoryRepository) UpdateDoc(_ context.Context, item DocArticle) (DocArticle, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for index, existing := range r.docs {
		if existing.ID != item.ID {
			continue
		}
		item.CreatedAt = existing.CreatedAt
		item.UpdatedAt = time.Now()
		r.docs[index] = item
		return item, nil
	}
	return DocArticle{}, ErrNotFound
}

func (r *MemoryRepository) DeleteDoc(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for index, item := range r.docs {
		if item.ID != id {
			continue
		}
		r.docs = append(r.docs[:index], r.docs[index+1:]...)
		return nil
	}
	return ErrNotFound
}

func (r *MemoryRepository) GetProfileSettings(_ context.Context, userID uint64) (ProfileSettings, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	item, ok := r.profiles[userID]
	if !ok {
		return ProfileSettings{}, ErrNotFound
	}
	return item, nil
}

func (r *MemoryRepository) UpsertProfileSettings(_ context.Context, item ProfileSettings) (ProfileSettings, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if existing, ok := r.profiles[item.UserID]; ok {
		item.CreatedAt = existing.CreatedAt
	} else {
		item.CreatedAt = time.Now()
	}
	item.UpdatedAt = time.Now()
	r.profiles[item.UserID] = item
	return item, nil
}

func (r *MemoryRepository) GetBillingProfile(_ context.Context, userID uint64) (BillingProfile, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	item, ok := r.billing[userID]
	if !ok {
		return BillingProfile{}, ErrNotFound
	}
	return item, nil
}

func (r *MemoryRepository) ListBalanceEntries(_ context.Context, userID uint64) ([]BalanceEntry, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	items := make([]BalanceEntry, len(r.balanceByUser[userID]))
	copy(items, r.balanceByUser[userID])
	slices.Reverse(items)
	return items, nil
}

func (r *MemoryRepository) ListWebhookDeliveryLogs(_ context.Context, _ uint64, _ uint64, _ int) ([]WebhookDeliveryLog, error) {
	return nil, nil
}

func (r *MemoryRepository) BalanceSum(_ context.Context, userID uint64) int64 {
	r.mu.RLock()
	defer r.mu.RUnlock()
	var total int64
	for _, item := range r.balanceByUser[userID] {
		total += item.Amount
	}
	return total
}
