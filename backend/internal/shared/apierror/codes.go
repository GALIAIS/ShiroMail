package apierror

import "net/http"

// AUTH module errors
var (
	ErrInvalidRequest            = New("AUTH_001", "invalid request", http.StatusBadRequest)
	ErrUnauthorized              = New("AUTH_002", "unauthorized", http.StatusUnauthorized)
	ErrInvalidCredentials        = New("AUTH_003", "invalid credentials", http.StatusUnauthorized)
	ErrInvalidRefreshToken       = New("AUTH_004", "invalid refresh token", http.StatusUnauthorized)
	ErrUserNotFound              = New("AUTH_005", "user not found", http.StatusNotFound)
	ErrRegistrationDisabled      = New("AUTH_006", "registration disabled", http.StatusForbidden)
	ErrEmailVerificationRequired = New("AUTH_007", "email verification required", http.StatusForbidden)
	ErrTwoFactorRequired         = New("AUTH_008", "two factor required", http.StatusForbidden)
	ErrVerificationExceeded      = New("AUTH_009", "verification attempts exceeded", http.StatusTooManyRequests)
	ErrOAuthFailed               = New("AUTH_010", "oauth authentication failed", http.StatusUnauthorized)
	ErrEmailChangeFailed         = New("AUTH_011", "email change failed", http.StatusBadRequest)
	ErrPasswordChangeFailed      = New("AUTH_012", "password change failed", http.StatusUnauthorized)
	ErrTOTPSetupFailed           = New("AUTH_013", "totp setup failed", http.StatusInternalServerError)
	ErrTOTPVerifyFailed          = New("AUTH_014", "totp verification failed", http.StatusUnauthorized)
	ErrAccountProfileFailed      = New("AUTH_015", "failed to load account profile", http.StatusInternalServerError)
	ErrAccountUpdateFailed       = New("AUTH_016", "failed to update account profile", http.StatusInternalServerError)
	ErrForgotPasswordFailed      = New("AUTH_017", "user not found", http.StatusNotFound)
	ErrResetPasswordFailed       = New("AUTH_018", "reset password failed", http.StatusUnauthorized)
	ErrAccountSuspended          = New("AUTH_019", "account suspended", http.StatusForbidden)
	ErrForbidden                 = New("AUTH_020", "forbidden", http.StatusForbidden)
	ErrRegistrationConflict      = New("AUTH_021", "registration failed", http.StatusConflict)
)

// MAILBOX module errors
var (
	ErrMailboxNotFound            = New("MAILBOX_001", "mailbox not found", http.StatusNotFound)
	ErrMailboxAddressConflict     = New("MAILBOX_002", "mailbox address already exists", http.StatusConflict)
	ErrMailboxInvalidTTL          = New("MAILBOX_003", "expiresInHours must be greater than zero", http.StatusBadRequest)
	ErrMailboxInvalidLocalPart    = New("MAILBOX_004", "invalid localPart", http.StatusBadRequest)
	ErrMailboxDomainVerification  = New("MAILBOX_005", "subdomains must be verified before mailbox creation", http.StatusBadRequest)
	ErrMailboxCreateFailed        = New("MAILBOX_006", "failed to create mailbox", http.StatusInternalServerError)
	ErrMailboxListFailed          = New("MAILBOX_007", "failed to list mailboxes", http.StatusInternalServerError)
	ErrMailboxExtendFailed        = New("MAILBOX_008", "failed to extend mailbox", http.StatusInternalServerError)
	ErrMailboxReleaseFailed       = New("MAILBOX_009", "failed to release mailbox", http.StatusInternalServerError)
	ErrMailboxDashboardFailed     = New("MAILBOX_010", "failed to build dashboard", http.StatusInternalServerError)
	ErrMailboxForwardingFailed    = New("MAILBOX_011", "failed to update forwarding", http.StatusInternalServerError)
)

// DOMAIN module errors
var (
	ErrDomainNotFound              = New("DOMAIN_001", "domain not found", http.StatusNotFound)
	ErrDomainAlreadyExists         = New("DOMAIN_002", "domain already exists", http.StatusConflict)
	ErrDomainInvalid               = New("DOMAIN_003", "invalid domain", http.StatusBadRequest)
	ErrDomainHasChildren           = New("DOMAIN_004", "domain still has subdomains", http.StatusBadRequest)
	ErrDomainHasMailboxes          = New("DOMAIN_005", "domain still has mailboxes", http.StatusBadRequest)
	ErrDomainInvalidPublication    = New("DOMAIN_006", "invalid publication state", http.StatusBadRequest)
	ErrDomainListFailed            = New("DOMAIN_007", "failed to list domains", http.StatusInternalServerError)
	ErrDomainCreateFailed          = New("DOMAIN_008", "failed to create domain", http.StatusInternalServerError)
	ErrDomainDeleteFailed          = New("DOMAIN_009", "failed to delete domain", http.StatusInternalServerError)
	ErrDomainVerifyFailed          = New("DOMAIN_010", "domain verification failed", http.StatusBadGateway)
	ErrDomainPublicationFailed     = New("DOMAIN_011", "failed to update publication", http.StatusInternalServerError)
	ErrDomainGenerateFailed        = New("DOMAIN_012", "failed to generate subdomains", http.StatusInternalServerError)
)

// PROVIDER module errors
var (
	ErrProviderAccountNotFound     = New("PROVIDER_001", "provider account not found", http.StatusNotFound)
	ErrProviderAdapterUnavailable  = New("PROVIDER_002", "provider adapter unavailable", http.StatusBadRequest)
	ErrProviderAccountInUse        = New("PROVIDER_003", "provider account is still bound to domains", http.StatusBadRequest)
	ErrProviderImmutableFields     = New("PROVIDER_004", "provider and auth type cannot be changed while domains are bound", http.StatusBadRequest)
	ErrProviderSecretNotFound      = New("PROVIDER_005", "secret ref not found", http.StatusNotFound)
	ErrProviderSecretInvalid       = New("PROVIDER_006", "invalid provider secret", http.StatusBadRequest)
	ErrProviderCreateFailed        = New("PROVIDER_007", "failed to create provider account", http.StatusInternalServerError)
	ErrProviderUpdateFailed        = New("PROVIDER_008", "failed to update provider account", http.StatusInternalServerError)
	ErrProviderDeleteFailed        = New("PROVIDER_009", "failed to delete provider account", http.StatusInternalServerError)
	ErrProviderValidateFailed      = New("PROVIDER_010", "provider validation failed", http.StatusBadGateway)
	ErrProviderZonesFailed         = New("PROVIDER_011", "failed to list provider zones", http.StatusBadGateway)
	ErrProviderRecordsFailed       = New("PROVIDER_012", "failed to list provider records", http.StatusBadGateway)
)

// DNS module errors
var (
	ErrDNSChangeSetNotFound        = New("DNS_001", "dns change set not found", http.StatusNotFound)
	ErrDNSInvalidRequest           = New("DNS_002", "invalid dns change set request", http.StatusBadRequest)
	ErrDNSUnsupportedRecordType    = New("DNS_003", "unsupported dns record type", http.StatusBadRequest)
	ErrDNSChangeSetListFailed      = New("DNS_004", "failed to list provider change sets", http.StatusInternalServerError)
	ErrDNSChangeSetPreviewFailed   = New("DNS_005", "failed to preview provider change set", http.StatusInternalServerError)
	ErrDNSChangeSetApplyFailed     = New("DNS_006", "failed to apply provider change set", http.StatusInternalServerError)
	ErrDNSVerificationListFailed   = New("DNS_007", "failed to list provider verifications", http.StatusInternalServerError)
)

// MESSAGE module errors
var (
	ErrMessageNotFound             = New("MESSAGE_001", "message not found", http.StatusNotFound)
	ErrMessageDeleted              = New("MESSAGE_002", "message deleted", http.StatusNotFound)
	ErrMessageContentUnavailable   = New("MESSAGE_003", "message content unavailable", http.StatusNotFound)
	ErrAttachmentNotFound          = New("MESSAGE_004", "attachment not found", http.StatusNotFound)
	ErrMessageListFailed           = New("MESSAGE_005", "failed to list messages", http.StatusInternalServerError)
	ErrMessageLoadFailed           = New("MESSAGE_006", "failed to load message", http.StatusInternalServerError)
	ErrMessageRawFailed            = New("MESSAGE_007", "failed to load raw message", http.StatusInternalServerError)
	ErrMessageParseFailed          = New("MESSAGE_008", "failed to parse raw message", http.StatusInternalServerError)
	ErrMessageAttachmentFailed     = New("MESSAGE_009", "failed to load attachment", http.StatusInternalServerError)
	ErrMessageTrendFailed          = New("MESSAGE_010", "failed to load trend", http.StatusInternalServerError)
	ErrMessageSearchFailed         = New("MESSAGE_011", "failed to search messages", http.StatusInternalServerError)
	ErrMessageReceiveFailed        = New("MESSAGE_012", "failed to receive raw message", http.StatusInternalServerError)
	ErrMessageBatchDeleteFailed    = New("MESSAGE_013", "batch delete failed", http.StatusInternalServerError)
	ErrMessageBatchReadFailed      = New("MESSAGE_014", "batch read update failed", http.StatusInternalServerError)
	ErrMessageOwnershipFailed      = New("MESSAGE_015", "message does not belong to user", http.StatusForbidden)
	ErrMessageTooManyIDs           = New("MESSAGE_016", "too many ids (max 100)", http.StatusBadRequest)
	ErrMessageIDsRequired          = New("MESSAGE_017", "ids required", http.StatusBadRequest)
)

// ADMIN module errors
var (
	ErrAdminInvalidReviewDecision  = New("ADMIN_001", "invalid domain review decision", http.StatusBadRequest)
	ErrAdminInvalidUserRoles       = New("ADMIN_002", "at least one valid role is required", http.StatusBadRequest)
	ErrAdminInvalidUserProfile     = New("ADMIN_003", "invalid user profile", http.StatusBadRequest)
	ErrAdminCannotBanSelf          = New("ADMIN_004", "cannot ban your own account", http.StatusBadRequest)
	ErrAdminCannotBanAdmin         = New("ADMIN_005", "cannot ban an admin account", http.StatusBadRequest)
	ErrAdminCannotRemoveOwnRole    = New("ADMIN_006", "cannot remove your own admin role", http.StatusBadRequest)
	ErrAdminCannotRemoveLastRole   = New("ADMIN_007", "cannot remove the last admin role", http.StatusBadRequest)
	ErrAdminCannotDeleteSelf       = New("ADMIN_008", "cannot delete your own account", http.StatusBadRequest)
	ErrAdminCannotDeleteLastAdmin  = New("ADMIN_009", "cannot delete the last admin account", http.StatusBadRequest)
	ErrAdminUserHasMailboxes       = New("ADMIN_010", "user still has mailboxes", http.StatusBadRequest)
	ErrAdminUserOwnsDomains        = New("ADMIN_011", "user still owns domains", http.StatusBadRequest)
	ErrAdminUserOwnsProviders      = New("ADMIN_012", "user still owns provider accounts", http.StatusBadRequest)
	ErrAdminDomainHasMailboxes     = New("ADMIN_013", "domain still has mailboxes", http.StatusBadRequest)
	ErrAdminDomainHasChildren      = New("ADMIN_014", "domain still has subdomains", http.StatusBadRequest)
	ErrAdminProviderInUse          = New("ADMIN_015", "provider account is still bound to domains", http.StatusBadRequest)
	ErrAdminProviderImmutable      = New("ADMIN_016", "provider and auth type cannot be changed while domains are bound", http.StatusBadRequest)
	ErrAdminOverviewFailed         = New("ADMIN_017", "failed to build overview", http.StatusInternalServerError)
	ErrAdminUsernameExists         = New("ADMIN_018", "username already exists", http.StatusBadRequest)
	ErrAdminEmailExists            = New("ADMIN_019", "email already exists", http.StatusBadRequest)
	ErrAdminBatchActionInvalid     = New("ADMIN_020", "action must be ban, unban, or delete", http.StatusBadRequest)
)

// EXTRACTOR module errors
var (
	ErrExtractorRuleNotFound       = New("EXTRACTOR_001", "extractor rule not found", http.StatusNotFound)
	ErrExtractorInvalidPattern     = New("EXTRACTOR_002", "invalid regex pattern", http.StatusBadRequest)
	ErrExtractorInvalidRule        = New("EXTRACTOR_003", "invalid extractor rule", http.StatusBadRequest)
	ErrExtractorCreateFailed       = New("EXTRACTOR_004", "failed to create extractor rule", http.StatusInternalServerError)
	ErrExtractorUpdateFailed       = New("EXTRACTOR_005", "failed to update extractor rule", http.StatusInternalServerError)
	ErrExtractorDeleteFailed       = New("EXTRACTOR_006", "failed to delete extractor rule", http.StatusInternalServerError)
	ErrExtractorTestFailed         = New("EXTRACTOR_007", "failed to test extractor rule", http.StatusInternalServerError)
	ErrExtractorListFailed         = New("EXTRACTOR_008", "failed to list extractor rules", http.StatusInternalServerError)
)

// PORTAL module errors
var (
	ErrPortalNotFound              = New("PORTAL_001", "portal record not found", http.StatusNotFound)
	ErrPortalForbidden             = New("PORTAL_002", "api key forbidden", http.StatusForbidden)
	ErrPortalOverviewFailed        = New("PORTAL_003", "failed to load overview", http.StatusInternalServerError)
	ErrPortalFeedbackFailed        = New("PORTAL_004", "failed to submit feedback", http.StatusInternalServerError)
	ErrPortalAPIKeyCreateFailed    = New("PORTAL_005", "failed to create api key", http.StatusInternalServerError)
	ErrPortalAPIKeyNotFound        = New("PORTAL_006", "api key not found", http.StatusNotFound)
	ErrPortalWebhookNotFound       = New("PORTAL_007", "webhook not found", http.StatusNotFound)
	ErrPortalWebhookCreateFailed   = New("PORTAL_008", "failed to create webhook", http.StatusInternalServerError)
	ErrPortalWebhookUnavailable    = New("PORTAL_009", "webhook dispatcher not available", http.StatusServiceUnavailable)
	ErrPortalDeliveryNotFound      = New("PORTAL_010", "delivery log not found", http.StatusNotFound)
	ErrPortalBillingFailed         = New("PORTAL_011", "failed to load billing", http.StatusInternalServerError)
	ErrPortalSettingsFailed        = New("PORTAL_012", "failed to load settings", http.StatusInternalServerError)
)

// SYSTEM module errors
var (
	ErrSystemConfigListFailed      = New("SYSTEM_001", "failed to list configs", http.StatusInternalServerError)
	ErrSystemConfigUpsertFailed    = New("SYSTEM_002", "failed to upsert config", http.StatusInternalServerError)
	ErrSystemConfigDeleteFailed    = New("SYSTEM_003", "failed to delete config", http.StatusInternalServerError)
	ErrSystemSpoolUnavailable      = New("SYSTEM_004", "inbound spool unavailable", http.StatusNotFound)
	ErrSystemSpoolItemNotFound     = New("SYSTEM_005", "inbound spool item not found", http.StatusNotFound)
	ErrSystemSpoolListFailed       = New("SYSTEM_006", "failed to list inbound spool", http.StatusInternalServerError)
	ErrSystemSMTPMetricsFailed     = New("SYSTEM_007", "failed to load smtp metrics", http.StatusInternalServerError)
	ErrSystemMonitoringFailed      = New("SYSTEM_008", "failed to load system monitoring", http.StatusInternalServerError)
	ErrSystemAuditFailed           = New("SYSTEM_009", "failed to list audit logs", http.StatusInternalServerError)
	ErrSystemSettingsFailed        = New("SYSTEM_010", "failed to load settings", http.StatusInternalServerError)
	ErrSystemJobsFailed            = New("SYSTEM_011", "failed to list jobs", http.StatusInternalServerError)
)

// INGEST module errors
var (
	ErrIngestMessageNotFound       = New("INGEST_001", "message not found", http.StatusNotFound)
	ErrIngestSpoolItemNotFound     = New("INGEST_002", "spool item not found", http.StatusNotFound)
	ErrIngestMailUnavailable       = New("INGEST_003", "mail ingest unavailable", http.StatusServiceUnavailable)
)
