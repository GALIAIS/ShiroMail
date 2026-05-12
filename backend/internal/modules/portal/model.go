package portal

import (
	"context"
	"time"
)

type Notice struct {
	ID          uint64    `json:"id"`
	Title       string    `json:"title"`
	Body        string    `json:"body"`
	Category    string    `json:"category"`
	Level       string    `json:"level"`
	PublishedAt time.Time `json:"publishedAt"`
}

type FeedbackTicket struct {
	ID        uint64    `json:"id"`
	UserID    uint64    `json:"userId"`
	Category  string    `json:"category"`
	Subject   string    `json:"subject"`
	Content   string    `json:"content"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type APIKeyResourcePolicy struct {
	DomainAccessMode           string `json:"domainAccessMode"`
	AllowPlatformPublicDomains bool   `json:"allowPlatformPublicDomains"`
	AllowUserPublishedDomains  bool   `json:"allowUserPublishedDomains"`
	AllowOwnedPrivateDomains   bool   `json:"allowOwnedPrivateDomains"`
	AllowProviderMutation      bool   `json:"allowProviderMutation"`
	AllowProtectedRecordWrite  bool   `json:"allowProtectedRecordWrite"`
}

type APIKeyDomainBinding struct {
	ID          uint64  `json:"id"`
	ZoneID      *uint64 `json:"zoneId,omitempty"`
	NodeID      *uint64 `json:"nodeId,omitempty"`
	AccessLevel string  `json:"accessLevel"`
}

type APIKey struct {
	ID             uint64                `json:"id"`
	UserID         uint64                `json:"userId"`
	Name           string                `json:"name"`
	KeyPrefix      string                `json:"keyPrefix"`
	KeyPreview     string                `json:"keyPreview"`
	PlainSecret    string                `json:"plainSecret,omitempty"`
	SecretHash     string                `json:"-"`
	Status         string                `json:"status"`
	Scopes         []string              `json:"scopes"`
	Roles          []string              `json:"roles,omitempty"`
	ResourcePolicy APIKeyResourcePolicy  `json:"resourcePolicy"`
	DomainBindings []APIKeyDomainBinding `json:"domainBindings"`
	ExpiresAt      *time.Time            `json:"expiresAt,omitempty"`
	LastUsedAt     *time.Time            `json:"lastUsedAt,omitempty"`
	CreatedAt      time.Time             `json:"createdAt"`
	RevokedAt      *time.Time            `json:"revokedAt,omitempty"`
	RotatedAt      *time.Time            `json:"rotatedAt,omitempty"`
}

// Supported webhook event types.
var SupportedWebhookEvents = []string{
	"new_message",
	"message_read",
	"message_deleted",
	"mailbox_created",
}

type Webhook struct {
	ID              uint64     `json:"id"`
	UserID          uint64     `json:"userId"`
	Name            string     `json:"name"`
	TargetURL       string     `json:"targetUrl"`
	SecretPreview   string     `json:"secretPreview"`
	Events          []string   `json:"events"`
	Enabled         bool       `json:"enabled"`
	LastDeliveredAt *time.Time `json:"lastDeliveredAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

type WebhookDeliveryLog struct {
	ID             uint64    `json:"id"`
	WebhookID      uint64    `json:"webhookId"`
	Event          string    `json:"event"`
	TargetURL      string    `json:"targetUrl"`
	RequestBody    string    `json:"requestBody,omitempty"`
	ResponseStatus int       `json:"responseStatus"`
	LatencyMs      int       `json:"latencyMs"`
	Success        bool      `json:"success"`
	ErrorMessage   string    `json:"errorMessage,omitempty"`
	CreatedAt      time.Time `json:"createdAt"`
}

type ProfileSettings struct {
	UserID             uint64    `json:"userId"`
	DisplayName        string    `json:"displayName"`
	Email              string    `json:"email"`
	Locale             string    `json:"locale"`
	Timezone           string    `json:"timezone"`
	AutoRefreshSeconds int       `json:"autoRefreshSeconds"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type BillingProfile struct {
	UserID            uint64    `json:"userId"`
	PlanCode          string    `json:"planCode"`
	PlanName          string    `json:"planName"`
	Status            string    `json:"status"`
	MailboxQuota      int       `json:"mailboxQuota"`
	DomainQuota       int       `json:"domainQuota"`
	DailyRequestLimit int       `json:"dailyRequestLimit"`
	RenewalAt         time.Time `json:"renewalAt"`
}

type BalanceEntry struct {
	ID          uint64    `json:"id"`
	UserID      uint64    `json:"userId"`
	EntryType   string    `json:"entryType"`
	Amount      int64     `json:"amount"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"createdAt"`
}

type DocArticle struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	Category    string    `json:"category"`
	Summary     string    `json:"summary"`
	ReadTimeMin int       `json:"readTimeMin"`
	Tags        []string  `json:"tags"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type ProfileOverview struct {
	Username            string `json:"username"`
	Email               string `json:"email"`
	DisplayName         string `json:"displayName"`
	MailboxQuota        int    `json:"mailboxQuota"`
	DomainQuota         int    `json:"domainQuota"`
	ActiveAPIKeyCount   int    `json:"activeApiKeyCount"`
	EnabledWebhookCount int    `json:"enabledWebhookCount"`
	OpenFeedbackCount   int    `json:"openFeedbackCount"`
	NoticeCount         int    `json:"noticeCount"`
	BalanceCents        int64  `json:"balanceCents"`
}

type Repository interface {
	ListNotices(ctx context.Context) ([]Notice, error)
	CreateNotice(ctx context.Context, item Notice) (Notice, error)
	UpdateNotice(ctx context.Context, item Notice) (Notice, error)
	DeleteNotice(ctx context.Context, id uint64) error
	ListFeedbackByUser(ctx context.Context, userID uint64) ([]FeedbackTicket, error)
	CreateFeedback(ctx context.Context, item FeedbackTicket) (FeedbackTicket, error)
	ListAPIKeysByUser(ctx context.Context, userID uint64) ([]APIKey, error)
	ListAllAPIKeys(ctx context.Context) ([]APIKey, error)
	AuthenticateAPIKey(ctx context.Context, presented string) (APIKey, error)
	CreateAPIKey(ctx context.Context, item APIKey) (APIKey, error)
	RotateAPIKey(ctx context.Context, userID uint64, apiKeyID uint64, preview string, secretHash string) (APIKey, error)
	RevokeAPIKey(ctx context.Context, userID uint64, apiKeyID uint64) (APIKey, error)
	ListWebhooksByUser(ctx context.Context, userID uint64) ([]Webhook, error)
	ListAllWebhooks(ctx context.Context) ([]Webhook, error)
	CreateWebhook(ctx context.Context, item Webhook) (Webhook, error)
	UpdateWebhook(ctx context.Context, item Webhook) (Webhook, error)
	ToggleWebhook(ctx context.Context, userID uint64, webhookID uint64, enabled bool) (Webhook, error)
	ListWebhookDeliveryLogs(ctx context.Context, userID uint64, webhookID uint64, limit int) ([]WebhookDeliveryLog, error)
	GetWebhookDeliveryLog(ctx context.Context, userID uint64, deliveryID uint64) (WebhookDeliveryLog, error)
	ListDocs(ctx context.Context) ([]DocArticle, error)
	CreateDoc(ctx context.Context, item DocArticle) (DocArticle, error)
	UpdateDoc(ctx context.Context, item DocArticle) (DocArticle, error)
	DeleteDoc(ctx context.Context, id string) error
	GetProfileSettings(ctx context.Context, userID uint64) (ProfileSettings, error)
	UpsertProfileSettings(ctx context.Context, item ProfileSettings) (ProfileSettings, error)
	GetBillingProfile(ctx context.Context, userID uint64) (BillingProfile, error)
	ListBalanceEntries(ctx context.Context, userID uint64) ([]BalanceEntry, error)
	BalanceSum(ctx context.Context, userID uint64) int64
}
