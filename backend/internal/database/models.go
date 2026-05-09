package database

import "time"

type UserRow struct {
	ID            uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	Username      string    `gorm:"column:username"`
	Email         string    `gorm:"column:email"`
	PasswordHash  string    `gorm:"column:password_hash"`
	Status        string    `gorm:"column:status"`
	EmailVerified bool      `gorm:"column:email_verified"`
	CreatedAt     time.Time `gorm:"column:created_at"`
	UpdatedAt     time.Time `gorm:"column:updated_at"`
}

func (UserRow) TableName() string {
	return "users"
}

type RoleRow struct {
	ID   uint64 `gorm:"column:id;primaryKey;autoIncrement"`
	Code string `gorm:"column:code"`
	Name string `gorm:"column:name"`
}

func (RoleRow) TableName() string {
	return "roles"
}

type UserRoleRow struct {
	UserID uint64 `gorm:"column:user_id;primaryKey"`
	RoleID uint64 `gorm:"column:role_id;primaryKey"`
}

func (UserRoleRow) TableName() string {
	return "user_roles"
}

type AuthEmailVerificationRow struct {
	ID         uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	UserID     uint64     `gorm:"column:user_id"`
	Email      string     `gorm:"column:email"`
	Purpose    string     `gorm:"column:purpose"`
	TicketHash string     `gorm:"column:ticket_hash"`
	CodeHash   string     `gorm:"column:code_hash"`
	ExpiresAt  time.Time  `gorm:"column:expires_at"`
	ConsumedAt *time.Time `gorm:"column:consumed_at"`
	LastSentAt time.Time  `gorm:"column:last_sent_at"`
	Attempts   int        `gorm:"column:attempts"`
	CreatedAt  time.Time  `gorm:"column:created_at"`
	UpdatedAt  time.Time  `gorm:"column:updated_at"`
}

func (AuthEmailVerificationRow) TableName() string {
	return "auth_email_verifications"
}

type UserTOTPCredentialRow struct {
	UserID           uint64     `gorm:"column:user_id;primaryKey"`
	SecretCiphertext string     `gorm:"column:secret_ciphertext"`
	Enabled          bool       `gorm:"column:enabled"`
	VerifiedAt       *time.Time `gorm:"column:verified_at"`
	LastUsedAt       *time.Time `gorm:"column:last_used_at"`
	CreatedAt        time.Time  `gorm:"column:created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at"`
}

func (UserTOTPCredentialRow) TableName() string {
	return "user_totp_credentials"
}

type AuthMFAChallengeRow struct {
	ID         uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	UserID     uint64     `gorm:"column:user_id"`
	TicketHash string     `gorm:"column:ticket_hash"`
	Purpose    string     `gorm:"column:purpose"`
	ExpiresAt  time.Time  `gorm:"column:expires_at"`
	ConsumedAt *time.Time `gorm:"column:consumed_at"`
	CreatedAt  time.Time  `gorm:"column:created_at"`
}

func (AuthMFAChallengeRow) TableName() string {
	return "auth_mfa_challenges"
}

type DomainRow struct {
	ID                uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	Domain            string    `gorm:"column:domain"`
	Status            string    `gorm:"column:status"`
	OwnerUserID       *uint64   `gorm:"column:owner_user_id"`
	Visibility        string    `gorm:"column:visibility"`
	PublicationStatus string    `gorm:"column:publication_status"`
	VerificationScore int       `gorm:"column:verification_score"`
	HealthStatus      string    `gorm:"column:health_status"`
	IsDefault         bool      `gorm:"column:is_default"`
	Weight            int       `gorm:"column:weight"`
	DailyLimit        int       `gorm:"column:daily_limit"`
	CreatedAt         time.Time `gorm:"column:created_at"`
	UpdatedAt         time.Time `gorm:"column:updated_at"`
}

func (DomainRow) TableName() string {
	return "domains"
}

type ProviderAccountRow struct {
	ID               uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	Provider         string     `gorm:"column:provider"`
	OwnerType        string     `gorm:"column:owner_type"`
	OwnerUserID      *uint64    `gorm:"column:owner_user_id"`
	DisplayName      string     `gorm:"column:display_name"`
	AuthType         string     `gorm:"column:auth_type"`
	SecretRef        string     `gorm:"column:secret_ref"`
	Status           string     `gorm:"column:status"`
	CapabilitiesJSON []byte     `gorm:"column:capabilities_json"`
	LastSyncAt       *time.Time `gorm:"column:last_sync_at"`
	CreatedAt        time.Time  `gorm:"column:created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at"`
}

func (ProviderAccountRow) TableName() string {
	return "provider_accounts"
}

type DNSZoneRow struct {
	ID                uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	ProviderAccountID *uint64   `gorm:"column:provider_account_id"`
	ProviderZoneID    string    `gorm:"column:provider_zone_id"`
	OwnerUserID       *uint64   `gorm:"column:owner_user_id"`
	ZoneName          string    `gorm:"column:zone_name"`
	Status            string    `gorm:"column:status"`
	Visibility        string    `gorm:"column:visibility"`
	PublicationStatus string    `gorm:"column:publication_status"`
	VerificationScore int       `gorm:"column:verification_score"`
	HealthStatus      string    `gorm:"column:health_status"`
	CreatedAt         time.Time `gorm:"column:created_at"`
	UpdatedAt         time.Time `gorm:"column:updated_at"`
}

func (DNSZoneRow) TableName() string {
	return "dns_zones"
}

type DomainNodeRow struct {
	ID             uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	ZoneID         uint64    `gorm:"column:zone_id"`
	ParentNodeID   *uint64   `gorm:"column:parent_node_id"`
	FQDN           string    `gorm:"column:fqdn"`
	Kind           string    `gorm:"column:kind"`
	Level          int       `gorm:"column:level"`
	AllocationMode string    `gorm:"column:allocation_mode"`
	Status         string    `gorm:"column:status"`
	Weight         int       `gorm:"column:weight"`
	IsDefault      bool      `gorm:"column:is_default"`
	CreatedAt      time.Time `gorm:"column:created_at"`
	UpdatedAt      time.Time `gorm:"column:updated_at"`
}

func (DomainNodeRow) TableName() string {
	return "domain_nodes"
}

type DomainVerificationRow struct {
	ID                  uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	ZoneID              uint64     `gorm:"column:zone_id"`
	NodeID              *uint64    `gorm:"column:node_id"`
	VerificationType    string     `gorm:"column:verification_type"`
	Status              string     `gorm:"column:status"`
	ExpectedRecordsJSON []byte     `gorm:"column:expected_records_json"`
	ObservedRecordsJSON []byte     `gorm:"column:observed_records_json"`
	GuidanceJSON        []byte     `gorm:"column:guidance_json"`
	LastCheckedAt       *time.Time `gorm:"column:last_checked_at"`
	LastError           string     `gorm:"column:last_error"`
	CreatedAt           time.Time  `gorm:"column:created_at"`
	UpdatedAt           time.Time  `gorm:"column:updated_at"`
}

func (DomainVerificationRow) TableName() string {
	return "domain_verifications"
}

type DNSChangeSetRow struct {
	ID                  uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	ZoneID              *uint64    `gorm:"column:zone_id"`
	ProviderAccountID   uint64     `gorm:"column:provider_account_id"`
	ProviderZoneID      string     `gorm:"column:provider_zone_id"`
	ZoneName            string     `gorm:"column:zone_name"`
	RequestedByUserID   uint64     `gorm:"column:requested_by_user_id"`
	RequestedByAPIKeyID *uint64    `gorm:"column:requested_by_api_key_id"`
	Status              string     `gorm:"column:status"`
	Provider            string     `gorm:"column:provider"`
	Summary             string     `gorm:"column:summary"`
	CreatedAt           time.Time  `gorm:"column:created_at"`
	AppliedAt           *time.Time `gorm:"column:applied_at"`
}

func (DNSChangeSetRow) TableName() string {
	return "dns_change_sets"
}

type DNSChangeOperationRow struct {
	ID          uint64 `gorm:"column:id;primaryKey;autoIncrement"`
	ChangeSetID uint64 `gorm:"column:change_set_id"`
	Operation   string `gorm:"column:operation"`
	RecordType  string `gorm:"column:record_type"`
	RecordName  string `gorm:"column:record_name"`
	BeforeJSON  []byte `gorm:"column:before_json"`
	AfterJSON   []byte `gorm:"column:after_json"`
	Status      string `gorm:"column:status"`
}

func (DNSChangeOperationRow) TableName() string {
	return "dns_change_operations"
}

type MailboxRow struct {
	ID            uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	UserID        uint64     `gorm:"column:user_id"`
	DomainID      uint64     `gorm:"column:domain_id"`
	LocalPart     string     `gorm:"column:local_part"`
	Address       string     `gorm:"column:address"`
	Status        string     `gorm:"column:status"`
	ExpiresAt     time.Time  `gorm:"column:expires_at"`
	IsFavorite    bool       `gorm:"column:is_favorite"`
	Source        string     `gorm:"column:source"`
	RetentionDays int        `gorm:"column:retention_days"`
	LastMessageAt *time.Time `gorm:"column:last_message_at"`
	CreatedAt     time.Time  `gorm:"column:created_at"`
	UpdatedAt     time.Time  `gorm:"column:updated_at"`
}

func (MailboxRow) TableName() string {
	return "mailboxes"
}

type MessageRow struct {
	ID               uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	MailboxID        uint64    `gorm:"column:mailbox_id"`
	LegacyMailboxKey string    `gorm:"column:legacy_mailbox_key"`
	LegacyMessageKey string    `gorm:"column:legacy_message_key"`
	SourceKind       string    `gorm:"column:source_kind"`
	SourceMessageID  string    `gorm:"column:source_message_id"`
	MailboxAddress   string    `gorm:"column:mailbox_address"`
	FromAddr         string    `gorm:"column:from_addr"`
	ToAddr           string    `gorm:"column:to_addr"`
	Subject          string    `gorm:"column:subject"`
	TextPreview      string    `gorm:"column:text_preview"`
	HTMLPreview      string    `gorm:"column:html_preview"`
	TextBody         string    `gorm:"column:text_body"`
	HTMLBody         string    `gorm:"column:html_body"`
	HeadersJSON      []byte    `gorm:"column:headers_json"`
	RawStorageKey    string    `gorm:"column:raw_storage_key"`
	HasAttachments   bool      `gorm:"column:has_attachments"`
	SizeBytes        int64     `gorm:"column:size_bytes"`
	IsRead           bool      `gorm:"column:is_read"`
	IsDeleted        bool      `gorm:"column:is_deleted"`
	ReceivedAt       time.Time `gorm:"column:received_at"`
	CreatedAt        time.Time `gorm:"column:created_at"`
}

func (MessageRow) TableName() string {
	return "messages"
}

type MessageAttachmentRow struct {
	ID          uint64 `gorm:"column:id;primaryKey;autoIncrement"`
	MessageID   uint64 `gorm:"column:message_id"`
	FileName    string `gorm:"column:filename"`
	ContentType string `gorm:"column:content_type"`
	SizeBytes   int64  `gorm:"column:size_bytes"`
	StorageKey  string `gorm:"column:storage_key"`
}

func (MessageAttachmentRow) TableName() string {
	return "message_attachments"
}

type RuleRow struct {
	ID             string    `gorm:"column:id;primaryKey"`
	Name           string    `gorm:"column:name"`
	RetentionHours int       `gorm:"column:retention_hours"`
	AutoExtend     bool      `gorm:"column:auto_extend"`
	UpdatedAt      time.Time `gorm:"column:updated_at"`
}

func (RuleRow) TableName() string {
	return "rules"
}

type MailExtractorRuleRow struct {
	ID                uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	OwnerUserID       *uint64   `gorm:"column:owner_user_id"`
	SourceType        string    `gorm:"column:source_type"`
	TemplateKey       string    `gorm:"column:template_key"`
	Name              string    `gorm:"column:name"`
	Description       string    `gorm:"column:description"`
	Label             string    `gorm:"column:label"`
	Enabled           bool      `gorm:"column:enabled"`
	TargetFieldsJSON  []byte    `gorm:"column:target_fields_json"`
	Pattern           string    `gorm:"column:pattern"`
	Flags             string    `gorm:"column:flags"`
	ResultMode        string    `gorm:"column:result_mode"`
	CaptureGroupIndex *int      `gorm:"column:capture_group_index"`
	MailboxScopeJSON  []byte    `gorm:"column:mailbox_scope_json"`
	DomainScopeJSON   []byte    `gorm:"column:domain_scope_json"`
	SenderContains    string    `gorm:"column:sender_contains"`
	SubjectContains   string    `gorm:"column:subject_contains"`
	SortOrder         int       `gorm:"column:sort_order"`
	CreatedAt         time.Time `gorm:"column:created_at"`
	UpdatedAt         time.Time `gorm:"column:updated_at"`
}

func (MailExtractorRuleRow) TableName() string {
	return "mail_extractor_rules"
}

type UserMailExtractorTemplateRow struct {
	UserID    uint64    `gorm:"column:user_id;primaryKey"`
	RuleID    uint64    `gorm:"column:rule_id;primaryKey"`
	Enabled   bool      `gorm:"column:enabled"`
	CreatedAt time.Time `gorm:"column:created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at"`
}

func (UserMailExtractorTemplateRow) TableName() string {
	return "user_mail_extractor_templates"
}

type SystemConfigRow struct {
	ID          uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	ConfigKey   string    `gorm:"column:config_key"`
	ConfigValue []byte    `gorm:"column:config_value"`
	UpdatedBy   uint64    `gorm:"column:updated_by"`
	UpdatedAt   time.Time `gorm:"column:updated_at"`
}

func (SystemConfigRow) TableName() string {
	return "system_configs"
}

type JobRow struct {
	ID           uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	JobType      string     `gorm:"column:job_type"`
	Status       string     `gorm:"column:status"`
	Payload      []byte     `gorm:"column:payload"`
	ErrorMessage string     `gorm:"column:error_message"`
	ScheduledAt  time.Time  `gorm:"column:scheduled_at"`
	FinishedAt   *time.Time `gorm:"column:finished_at"`
	CreatedAt    time.Time  `gorm:"column:created_at"`
}

func (JobRow) TableName() string {
	return "jobs"
}

type InboundMessageSpoolRow struct {
	ID               uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	MailFrom         string     `gorm:"column:mail_from"`
	RecipientsJSON   []byte     `gorm:"column:recipients_json"`
	TargetMailboxIDs []byte     `gorm:"column:target_mailbox_ids_json"`
	RawMessage       []byte     `gorm:"column:raw_message"`
	Status           string     `gorm:"column:status"`
	ErrorMessage     string     `gorm:"column:error_message"`
	AttemptCount     int        `gorm:"column:attempt_count"`
	MaxAttempts      int        `gorm:"column:max_attempts"`
	CreatedAt        time.Time  `gorm:"column:created_at"`
	UpdatedAt        time.Time  `gorm:"column:updated_at"`
	NextAttemptAt    time.Time  `gorm:"column:next_attempt_at"`
	ProcessedAt      *time.Time `gorm:"column:processed_at"`
}

func (InboundMessageSpoolRow) TableName() string {
	return "inbound_message_spool"
}

type AuditLogRow struct {
	ID           uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	ActorUserID  uint64    `gorm:"column:actor_user_id"`
	Action       string    `gorm:"column:action"`
	ResourceType string    `gorm:"column:resource_type"`
	ResourceID   string    `gorm:"column:resource_id"`
	Detail       []byte    `gorm:"column:detail"`
	CreatedAt    time.Time `gorm:"column:created_at"`
}

func (AuditLogRow) TableName() string {
	return "audit_logs"
}

type NoticeRow struct {
	ID          uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	Title       string    `gorm:"column:title"`
	Body        string    `gorm:"column:body"`
	Category    string    `gorm:"column:category"`
	Level       string    `gorm:"column:level"`
	PublishedAt time.Time `gorm:"column:published_at"`
	CreatedAt   time.Time `gorm:"column:created_at"`
	UpdatedAt   time.Time `gorm:"column:updated_at"`
}

func (NoticeRow) TableName() string {
	return "notices"
}

type DocArticleRow struct {
	ID          string    `gorm:"column:id;primaryKey"`
	Title       string    `gorm:"column:title"`
	Category    string    `gorm:"column:category"`
	Summary     string    `gorm:"column:summary"`
	ReadTimeMin int       `gorm:"column:read_time_min"`
	TagsJSON    []byte    `gorm:"column:tags_json"`
	CreatedAt   time.Time `gorm:"column:created_at"`
	UpdatedAt   time.Time `gorm:"column:updated_at"`
}

func (DocArticleRow) TableName() string {
	return "doc_articles"
}

type FeedbackRow struct {
	ID        uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	UserID    uint64    `gorm:"column:user_id"`
	Category  string    `gorm:"column:category"`
	Subject   string    `gorm:"column:subject"`
	Content   string    `gorm:"column:content"`
	Status    string    `gorm:"column:status"`
	CreatedAt time.Time `gorm:"column:created_at"`
	UpdatedAt time.Time `gorm:"column:updated_at"`
}

func (FeedbackRow) TableName() string {
	return "feedback_tickets"
}

type APIKeyRow struct {
	ID         uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	UserID     uint64     `gorm:"column:user_id"`
	Name       string     `gorm:"column:name"`
	KeyPrefix  string     `gorm:"column:key_prefix"`
	KeyPreview string     `gorm:"column:key_preview"`
	SecretHash string     `gorm:"column:secret_hash"`
	Status     string     `gorm:"column:status"`
	ExpiresAt  *time.Time `gorm:"column:expires_at"`
	LastUsedAt *time.Time `gorm:"column:last_used_at"`
	CreatedAt  time.Time  `gorm:"column:created_at"`
	RevokedAt  *time.Time `gorm:"column:revoked_at"`
	RotatedAt  *time.Time `gorm:"column:rotated_at"`
}

func (APIKeyRow) TableName() string {
	return "user_api_keys"
}

type APIKeyScopeRow struct {
	APIKeyID uint64 `gorm:"column:api_key_id;primaryKey"`
	Scope    string `gorm:"column:scope;primaryKey"`
}

func (APIKeyScopeRow) TableName() string {
	return "api_key_scopes"
}

type APIKeyResourcePolicyRow struct {
	APIKeyID                   uint64 `gorm:"column:api_key_id;primaryKey"`
	DomainAccessMode           string `gorm:"column:domain_access_mode"`
	AllowPlatformPublicDomains bool   `gorm:"column:allow_platform_public_domains"`
	AllowUserPublishedDomains  bool   `gorm:"column:allow_user_published_domains"`
	AllowOwnedPrivateDomains   bool   `gorm:"column:allow_owned_private_domains"`
	AllowProviderMutation      bool   `gorm:"column:allow_provider_mutation"`
	AllowProtectedRecordWrite  bool   `gorm:"column:allow_protected_record_write"`
}

func (APIKeyResourcePolicyRow) TableName() string {
	return "api_key_resource_policies"
}

type APIKeyDomainBindingRow struct {
	ID          uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	APIKeyID    uint64    `gorm:"column:api_key_id"`
	ZoneID      *uint64   `gorm:"column:zone_id"`
	NodeID      *uint64   `gorm:"column:node_id"`
	AccessLevel string    `gorm:"column:access_level"`
	CreatedAt   time.Time `gorm:"column:created_at"`
}

func (APIKeyDomainBindingRow) TableName() string {
	return "api_key_domain_bindings"
}

type WebhookRow struct {
	ID              uint64     `gorm:"column:id;primaryKey;autoIncrement"`
	UserID          uint64     `gorm:"column:user_id"`
	Name            string     `gorm:"column:name"`
	TargetURL       string     `gorm:"column:target_url"`
	SecretPreview   string     `gorm:"column:secret_preview"`
	EventsJSON      []byte     `gorm:"column:events_json"`
	Enabled         bool       `gorm:"column:enabled"`
	LastDeliveredAt *time.Time `gorm:"column:last_delivered_at"`
	CreatedAt       time.Time  `gorm:"column:created_at"`
	UpdatedAt       time.Time  `gorm:"column:updated_at"`
}

func (WebhookRow) TableName() string {
	return "user_webhooks"
}

type UserProfileRow struct {
	UserID             uint64    `gorm:"column:user_id;primaryKey"`
	DisplayName        string    `gorm:"column:display_name"`
	Locale             string    `gorm:"column:locale"`
	Timezone           string    `gorm:"column:timezone"`
	AutoRefreshSeconds int       `gorm:"column:auto_refresh_seconds"`
	CreatedAt          time.Time `gorm:"column:created_at"`
	UpdatedAt          time.Time `gorm:"column:updated_at"`
}

func (UserProfileRow) TableName() string {
	return "user_profiles"
}

type BillingProfileRow struct {
	UserID            uint64    `gorm:"column:user_id;primaryKey"`
	PlanCode          string    `gorm:"column:plan_code"`
	PlanName          string    `gorm:"column:plan_name"`
	Status            string    `gorm:"column:status"`
	MailboxQuota      int       `gorm:"column:mailbox_quota"`
	DomainQuota       int       `gorm:"column:domain_quota"`
	DailyRequestLimit int       `gorm:"column:daily_request_limit"`
	RenewalAt         time.Time `gorm:"column:renewal_at"`
	CreatedAt         time.Time `gorm:"column:created_at"`
	UpdatedAt         time.Time `gorm:"column:updated_at"`
}

func (BillingProfileRow) TableName() string {
	return "user_billing_profiles"
}

type BalanceEntryRow struct {
	ID          uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	UserID      uint64    `gorm:"column:user_id"`
	EntryType   string    `gorm:"column:entry_type"`
	Amount      int64     `gorm:"column:amount"`
	Description string    `gorm:"column:description"`
	CreatedAt   time.Time `gorm:"column:created_at"`
}

func (BalanceEntryRow) TableName() string {
	return "user_balance_entries"
}

type WebhookDeliveryLogRow struct {
	ID             uint64    `gorm:"column:id;primaryKey;autoIncrement"`
	WebhookID      uint64    `gorm:"column:webhook_id"`
	UserID         uint64    `gorm:"column:user_id"`
	Event          string    `gorm:"column:event"`
	TargetURL      string    `gorm:"column:target_url"`
	RequestBody    string    `gorm:"column:request_body"`
	ResponseStatus int       `gorm:"column:response_status"`
	ResponseBody   string    `gorm:"column:response_body"`
	LatencyMs      int       `gorm:"column:latency_ms"`
	Success        bool      `gorm:"column:success"`
	ErrorMessage   string    `gorm:"column:error_message"`
	Attempt        int       `gorm:"column:attempt"`
	CreatedAt      time.Time `gorm:"column:created_at"`
}

func (WebhookDeliveryLogRow) TableName() string {
	return "webhook_delivery_logs"
}
