package system

import (
	"context"
	"sort"
	"sync"
	"time"
)

type InboundSpoolRecord struct {
	ID               uint64                `json:"id"`
	MailFrom         string                `json:"mailFrom"`
	Recipients       []string              `json:"recipients"`
	TargetMailboxIDs []uint64              `json:"targetMailboxIds"`
	Status           string                `json:"status"`
	ErrorMessage     string                `json:"errorMessage,omitempty"`
	Diagnostic       *SMTPStatusDiagnostic `json:"diagnostic,omitempty"`
	AttemptCount     int                   `json:"attemptCount"`
	MaxAttempts      int                   `json:"maxAttempts"`
	CreatedAt        time.Time             `json:"createdAt"`
	UpdatedAt        time.Time             `json:"updatedAt"`
	NextAttemptAt    time.Time             `json:"nextAttemptAt"`
	ProcessedAt      *time.Time            `json:"processedAt,omitempty"`
}

type InboundSpoolListOptions struct {
	Status      string
	FailureMode string
	Page        int
	PageSize    int
}

type InboundSpoolSummary struct {
	Total      int `json:"total"`
	Pending    int `json:"pending"`
	Processing int `json:"processing"`
	Completed  int `json:"completed"`
	Failed     int `json:"failed"`
}

type InboundSpoolFailureReason struct {
	Message    string                `json:"message"`
	Count      int                   `json:"count"`
	Diagnostic *SMTPStatusDiagnostic `json:"diagnostic,omitempty"`
}

type InboundSpoolListResult struct {
	Items          []InboundSpoolRecord        `json:"items"`
	Total          int                         `json:"total"`
	Page           int                         `json:"page"`
	PageSize       int                         `json:"pageSize"`
	Summary        InboundSpoolSummary         `json:"summary"`
	FailureReasons []InboundSpoolFailureReason `json:"failureReasons"`
}

type SMTPMetricsSnapshot struct {
	SessionsStarted    int64              `json:"sessionsStarted"`
	RecipientsAccepted int64              `json:"recipientsAccepted"`
	BytesReceived      int64              `json:"bytesReceived"`
	Accepted           map[string]int64   `json:"accepted"`
	Rejected           map[string]int64   `json:"rejected"`
	RejectedDetails    []SMTPMetricReason `json:"rejectedDetails,omitempty"`
	SpoolProcessed     map[string]int64   `json:"spoolProcessed"`
}

type SMTPMetricReason struct {
	Key        string               `json:"key"`
	Count      int64                `json:"count"`
	Diagnostic SMTPStatusDiagnostic `json:"diagnostic"`
}

type DomainPublicPoolPolicy struct {
	RequiresReview bool `json:"requiresReview"`
}

type ConfigEntry struct {
	Key       string         `json:"key"`
	Value     map[string]any `json:"value"`
	UpdatedBy uint64         `json:"updatedBy"`
	UpdatedAt time.Time      `json:"updatedAt"`
}

type SettingsSection struct {
	Key         string        `json:"key"`
	Title       string        `json:"title"`
	Description string        `json:"description"`
	Items       []ConfigEntry `json:"items"`
}

type JobRecord struct {
	ID           uint64                `json:"id"`
	JobType      string                `json:"jobType"`
	Status       string                `json:"status"`
	ErrorMessage string                `json:"errorMessage,omitempty"`
	Diagnostic   *SMTPStatusDiagnostic `json:"diagnostic,omitempty"`
	CreatedAt    time.Time             `json:"createdAt"`
}

type AuditLog struct {
	ID           uint64         `json:"id"`
	ActorUserID  uint64         `json:"actorUserId"`
	Action       string         `json:"action"`
	ResourceType string         `json:"resourceType"`
	ResourceID   string         `json:"resourceId"`
	Detail       map[string]any `json:"detail"`
	CreatedAt    time.Time      `json:"createdAt"`
}

type MailDeliveryTestResult struct {
	Status    string `json:"status"`
	Recipient string `json:"recipient"`
}

type MailDeliveryDiagnostic struct {
	Stage     string `json:"stage,omitempty"`
	Code      string `json:"code,omitempty"`
	Hint      string `json:"hint,omitempty"`
	Retryable bool   `json:"retryable"`
}

type PublicSiteStats struct {
	ActiveMailboxCount int       `json:"activeMailboxCount"`
	TodayMessageCount  int       `json:"todayMessageCount"`
	ActiveDomainCount  int       `json:"activeDomainCount"`
	TotalUserCount     int       `json:"totalUserCount"`
	FailedJobCount     int       `json:"failedJobCount"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type ConfigRepository interface {
	List(ctx context.Context) ([]ConfigEntry, error)
	Upsert(ctx context.Context, key string, value map[string]any, actorID uint64) (ConfigEntry, error)
	Delete(ctx context.Context, key string) error
}

type JobRepository interface {
	List(ctx context.Context) ([]JobRecord, error)
	Create(ctx context.Context, jobType string, status string, errorMessage string) (JobRecord, error)
	CountFailed(ctx context.Context) int
}

type AuditListOptions struct {
	Page   int
	Size   int
	Action string
}

type AuditListResult struct {
	Items []AuditLog `json:"items"`
	Total int64      `json:"total"`
	Page  int        `json:"page"`
	Size  int        `json:"pageSize"`
}

type AuditRepository interface {
	List(ctx context.Context) ([]AuditLog, error)
	ListPaginated(ctx context.Context, opts AuditListOptions) (AuditListResult, error)
	Create(ctx context.Context, actorID uint64, action string, resourceType string, resourceID string, detail map[string]any) (AuditLog, error)
}

type MailDeliveryTester interface {
	SendTestMail(ctx context.Context, to string) error
}

type MemoryConfigRepository struct {
	mu      sync.RWMutex
	records map[string]ConfigEntry
}

type MemoryJobRepository struct {
	mu      sync.RWMutex
	nextID  uint64
	records []JobRecord
}

type MemoryAuditRepository struct {
	mu      sync.RWMutex
	nextID  uint64
	records []AuditLog
}

func NewMemoryConfigRepository() *MemoryConfigRepository {
	return &MemoryConfigRepository{
		records: map[string]ConfigEntry{},
	}
}

func NewMemoryJobRepository() *MemoryJobRepository {
	return &MemoryJobRepository{
		nextID: 1,
	}
}

func NewMemoryAuditRepository() *MemoryAuditRepository {
	return &MemoryAuditRepository{
		nextID: 1,
	}
}

func (r *MemoryConfigRepository) List(_ context.Context) ([]ConfigEntry, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	items := make([]ConfigEntry, 0, len(r.records))
	for _, item := range r.records {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].Key < items[j].Key
	})
	return items, nil
}

func (r *MemoryConfigRepository) Upsert(_ context.Context, key string, value map[string]any, actorID uint64) (ConfigEntry, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	item := ConfigEntry{
		Key:       key,
		Value:     cloneMap(value),
		UpdatedBy: actorID,
		UpdatedAt: time.Now(),
	}
	r.records[key] = item
	return item, nil
}

func (r *MemoryConfigRepository) Delete(_ context.Context, key string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.records, key)
	return nil
}

func (r *MemoryJobRepository) List(_ context.Context) ([]JobRecord, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	items := make([]JobRecord, len(r.records))
	copy(items, r.records)
	sort.Slice(items, func(i, j int) bool {
		return items[i].ID > items[j].ID
	})
	return items, nil
}

func (r *MemoryJobRepository) Create(_ context.Context, jobType string, status string, errorMessage string) (JobRecord, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	item := JobRecord{
		ID:           r.nextID,
		JobType:      jobType,
		Status:       status,
		ErrorMessage: errorMessage,
		CreatedAt:    time.Now(),
	}
	r.nextID++
	r.records = append(r.records, item)
	return item, nil
}

func (r *MemoryJobRepository) CountFailed(_ context.Context) int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	count := 0
	for _, item := range r.records {
		if item.Status == "failed" {
			count++
		}
	}
	return count
}

func (r *MemoryAuditRepository) List(_ context.Context) ([]AuditLog, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	items := make([]AuditLog, len(r.records))
	copy(items, r.records)
	sort.Slice(items, func(i, j int) bool {
		return items[i].ID > items[j].ID
	})
	return items, nil
}

func (r *MemoryAuditRepository) ListPaginated(_ context.Context, opts AuditListOptions) (AuditListResult, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	page := opts.Page
	if page <= 0 {
		page = 1
	}
	size := opts.Size
	if size <= 0 {
		size = 20
	}
	if size > 100 {
		size = 100
	}

	filtered := make([]AuditLog, 0, len(r.records))
	for _, item := range r.records {
		if opts.Action != "" && item.Action != opts.Action {
			continue
		}
		filtered = append(filtered, item)
	}
	sort.Slice(filtered, func(i, j int) bool {
		return filtered[i].ID > filtered[j].ID
	})

	total := int64(len(filtered))
	start := (page - 1) * size
	if start > len(filtered) {
		start = len(filtered)
	}
	end := start + size
	if end > len(filtered) {
		end = len(filtered)
	}

	return AuditListResult{
		Items: filtered[start:end],
		Total: total,
		Page:  page,
		Size:  size,
	}, nil
}

func (r *MemoryAuditRepository) Create(_ context.Context, actorID uint64, action string, resourceType string, resourceID string, detail map[string]any) (AuditLog, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	item := AuditLog{
		ID:           r.nextID,
		ActorUserID:  actorID,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Detail:       cloneMap(detail),
		CreatedAt:    time.Now(),
	}
	r.nextID++
	r.records = append(r.records, item)
	return item, nil
}

func cloneMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}
	output := make(map[string]any, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}
