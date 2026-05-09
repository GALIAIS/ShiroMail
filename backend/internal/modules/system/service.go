package system

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"
)

var ErrInboundSpoolUnavailable = errors.New("inbound spool unavailable")
var ErrInboundSpoolItemNotFound = errors.New("inbound spool item not found")

type InboundSpoolListFunc func(ctx context.Context) ([]InboundSpoolRecord, error)
type InboundSpoolRetryFunc func(ctx context.Context, id uint64) (InboundSpoolRecord, error)
type SMTPMetricsSnapshotFunc func(ctx context.Context) (SMTPMetricsSnapshot, error)
type PublicSiteStatsFunc func(ctx context.Context) (PublicSiteStats, error)
type SystemMonitoringFunc func(ctx context.Context) (SystemMonitoringSnapshot, error)

type Service struct {
	configRepo        ConfigRepository
	jobRepo           JobRepository
	auditRepo         AuditRepository
	mailTester        MailDeliveryTester
	spoolList         InboundSpoolListFunc
	spoolRetry        InboundSpoolRetryFunc
	smtpMetrics       SMTPMetricsSnapshotFunc
	publicStats       PublicSiteStatsFunc
	systemMonitoring  SystemMonitoringFunc
}

func NewService(configRepo ConfigRepository, jobRepo JobRepository, auditRepo AuditRepository, options ...any) *Service {
	var mailTester MailDeliveryTester
	var spoolList InboundSpoolListFunc
	var spoolRetry InboundSpoolRetryFunc
	var smtpMetrics SMTPMetricsSnapshotFunc
	var publicStats PublicSiteStatsFunc
	var systemMonitoring SystemMonitoringFunc
	for _, option := range options {
		if current, ok := option.(MailDeliveryTester); ok {
			mailTester = current
		}
		if current, ok := option.(InboundSpoolListFunc); ok {
			spoolList = current
		}
		if current, ok := option.(InboundSpoolRetryFunc); ok {
			spoolRetry = current
		}
		if current, ok := option.(SMTPMetricsSnapshotFunc); ok {
			smtpMetrics = current
		}
		if current, ok := option.(PublicSiteStatsFunc); ok {
			publicStats = current
		}
		if current, ok := option.(SystemMonitoringFunc); ok {
			systemMonitoring = current
		}
	}
	if mailTester == nil {
		mailTester = NewConfigMailDeliveryTester(configRepo)
	}
	return &Service{
		configRepo:       configRepo,
		jobRepo:          jobRepo,
		auditRepo:        auditRepo,
		mailTester:       mailTester,
		spoolList:        spoolList,
		spoolRetry:       spoolRetry,
		smtpMetrics:      smtpMetrics,
		publicStats:      publicStats,
		systemMonitoring: systemMonitoring,
	}
}

func (s *Service) ListConfigs(ctx context.Context) ([]ConfigEntry, error) {
	items, err := s.configRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	return mergeConfigEntries(items), nil
}

func (s *Service) UpsertConfig(ctx context.Context, actorID uint64, key string, value map[string]any) (ConfigEntry, error) {
	value = normalizeConfigValue(key, value)
	item, err := s.configRepo.Upsert(ctx, key, value, actorID)
	if err != nil {
		return ConfigEntry{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.config.upsert", "config", key, value)
	return normalizeConfigEntry(item), nil
}

func (s *Service) DeleteConfig(ctx context.Context, key string) error {
	return s.configRepo.Delete(ctx, key)
}

func (s *Service) ListSettingsSections(ctx context.Context) ([]SettingsSection, error) {
	items, err := s.ListConfigs(ctx)
	if err != nil {
		return nil, err
	}

	index := make(map[string]ConfigEntry, len(items))
	for _, item := range items {
		index[item.Key] = item
	}

	sections := make([]SettingsSection, 0, len(settingsSectionDefinitions))
	for _, definition := range settingsSectionDefinitions {
		configKeys := definition.ConfigKeys
		if definition.Key == "oauth" {
			configKeys = buildOAuthSectionKeys(items)
		}

		sectionItems := make([]ConfigEntry, 0, len(configKeys))
		for _, key := range configKeys {
			item, ok := index[key]
			if !ok {
				item = ConfigEntry{Key: key, Value: defaultConfigValueForKey(key)}
			}
			sectionItems = append(sectionItems, normalizeConfigEntry(item))
		}

		sections = append(sections, SettingsSection{
			Key:         definition.Key,
			Title:       definition.Title,
			Description: definition.Description,
			Items:       sectionItems,
		})
	}

	return sections, nil
}

func buildOAuthSectionKeys(items []ConfigEntry) []string {
	keys := []string{ConfigKeyAuthOAuthDisplay}
	seen := map[string]struct{}{
		ConfigKeyAuthOAuthDisplay: {},
	}

	for _, item := range items {
		if !strings.HasPrefix(item.Key, "auth.oauth.providers.") {
			continue
		}
		if _, ok := seen[item.Key]; ok {
			continue
		}
		seen[item.Key] = struct{}{}
		keys = append(keys, item.Key)
	}

	return keys
}

func (s *Service) PublicSiteSettings(ctx context.Context) (PublicSiteSettings, error) {
	return LoadPublicSiteSettings(ctx, s.configRepo)
}

func (s *Service) PublicStats(ctx context.Context) (PublicSiteStats, error) {
	if s.publicStats == nil {
		return PublicSiteStats{UpdatedAt: nowUTC()}, nil
	}
	item, err := s.publicStats(ctx)
	if err != nil {
		return PublicSiteStats{}, err
	}
	if item.UpdatedAt.IsZero() {
		item.UpdatedAt = nowUTC()
	}
	return item, nil
}

func (s *Service) APILimitsSettings(ctx context.Context) (APILimitsConfig, error) {
	return LoadAPILimitsSettings(ctx, s.configRepo)
}

func (s *Service) SendMailDeliveryTest(ctx context.Context, actorID uint64, to string) (MailDeliveryTestResult, error) {
	settings, err := LoadMailDeliverySettings(ctx, s.configRepo)
	if err != nil {
		return MailDeliveryTestResult{}, err
	}
	recipient := strings.TrimSpace(to)
	if recipient == "" {
		recipient = settings.FromAddress
	}
	if err := s.mailTester.SendTestMail(ctx, recipient); err != nil {
		diagnostic := DiagnoseMailDeliveryError(err)
		_, _ = s.auditRepo.Create(ctx, actorID, "admin.mail_delivery.test_failed", "config", ConfigKeyMailDelivery, map[string]any{
			"recipient": recipient,
			"message":   err.Error(),
			"stage":     diagnostic.Stage,
			"code":      diagnostic.Code,
			"hint":      diagnostic.Hint,
			"retryable": diagnostic.Retryable,
		})
		return MailDeliveryTestResult{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.mail_delivery.test", "config", ConfigKeyMailDelivery, map[string]any{
		"recipient": recipient,
	})
	return MailDeliveryTestResult{
		Status:    "ok",
		Recipient: recipient,
	}, nil
}

func (s *Service) ListJobs(ctx context.Context) ([]JobRecord, error) {
	items, err := s.jobRepo.List(ctx)
	if err != nil {
		return nil, err
	}
	return decorateJobDiagnostics(items), nil
}

func (s *Service) ListInboundSpool(ctx context.Context, options InboundSpoolListOptions) (InboundSpoolListResult, error) {
	if s.spoolList == nil {
		return InboundSpoolListResult{
			Items:          []InboundSpoolRecord{},
			Total:          0,
			Page:           normalizeInboundSpoolPage(options.Page),
			PageSize:       normalizeInboundSpoolPageSize(options.PageSize),
			Summary:        InboundSpoolSummary{},
			FailureReasons: []InboundSpoolFailureReason{},
		}, nil
	}
	items, err := s.spoolList(ctx)
	if err != nil {
		return InboundSpoolListResult{}, err
	}

	items = decorateInboundSpoolDiagnostics(items)
	summary := summarizeInboundSpool(items)
	filtered := filterInboundSpool(items, options.Status, options.FailureMode)
	failureReasons := summarizeInboundSpoolFailures(filtered)
	page := normalizeInboundSpoolPage(options.Page)
	pageSize := normalizeInboundSpoolPageSize(options.PageSize)
	start := (page - 1) * pageSize
	if start > len(filtered) {
		start = len(filtered)
	}
	end := start + pageSize
	if end > len(filtered) {
		end = len(filtered)
	}

	return InboundSpoolListResult{
		Items:          append([]InboundSpoolRecord{}, filtered[start:end]...),
		Total:          len(filtered),
		Page:           page,
		PageSize:       pageSize,
		Summary:        summary,
		FailureReasons: failureReasons,
	}, nil
}

func (s *Service) RetryInboundSpool(ctx context.Context, actorID uint64, id uint64) (InboundSpoolRecord, error) {
	if s.spoolRetry == nil {
		return InboundSpoolRecord{}, ErrInboundSpoolUnavailable
	}
	item, err := s.spoolRetry(ctx, id)
	if err != nil {
		return InboundSpoolRecord{}, err
	}
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.inbound_spool.retry", "inbound_spool", fmt.Sprintf("%d", id), map[string]any{
		"status": item.Status,
	})
	return item, nil
}

func (s *Service) SMTPMetrics(ctx context.Context) (SMTPMetricsSnapshot, error) {
	if s.smtpMetrics == nil {
		return SMTPMetricsSnapshot{
			Accepted:        map[string]int64{},
			Rejected:        map[string]int64{},
			RejectedDetails: []SMTPMetricReason{},
			SpoolProcessed:  map[string]int64{},
		}, nil
	}
	item, err := s.smtpMetrics(ctx)
	if err != nil {
		return SMTPMetricsSnapshot{}, err
	}
	item.RejectedDetails = buildSMTPRejectedDetails(item.Rejected)
	return item, nil
}

func (s *Service) SystemMonitoring(ctx context.Context) (SystemMonitoringSnapshot, error) {
	if s.systemMonitoring == nil {
		return SystemMonitoringSnapshot{}, nil
	}
	return s.systemMonitoring(ctx)
}

func (s *Service) ListAudit(ctx context.Context) ([]AuditLog, error) {
	return s.auditRepo.List(ctx)
}

func (s *Service) ListAuditPaginated(ctx context.Context, opts AuditListOptions) (AuditListResult, error) {
	return s.auditRepo.ListPaginated(ctx, opts)
}

func mergeConfigEntries(items []ConfigEntry) []ConfigEntry {
	index := make(map[string]ConfigEntry, len(items))
	for _, item := range defaultConfigEntries() {
		index[item.Key] = normalizeConfigEntry(item)
	}
	for _, item := range items {
		index[item.Key] = normalizeConfigEntry(item)
	}

	keys := make([]string, 0, len(index))
	for key := range index {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	output := make([]ConfigEntry, 0, len(keys))
	for _, key := range keys {
		output = append(output, index[key])
	}
	return output
}

func filterInboundSpool(items []InboundSpoolRecord, status string, failureMode string) []InboundSpoolRecord {
	normalizedStatus := strings.TrimSpace(strings.ToLower(status))
	normalizedFailureMode := strings.TrimSpace(strings.ToLower(failureMode))
	if normalizedStatus == "" {
		normalizedStatus = "all"
	}

	filtered := make([]InboundSpoolRecord, 0, len(items))
	for _, item := range items {
		if normalizedStatus != "all" && !strings.EqualFold(item.Status, normalizedStatus) {
			continue
		}
		if !matchesInboundSpoolFailureMode(item, normalizedFailureMode) {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

func summarizeInboundSpool(items []InboundSpoolRecord) InboundSpoolSummary {
	summary := InboundSpoolSummary{Total: len(items)}
	for _, item := range items {
		switch strings.ToLower(strings.TrimSpace(item.Status)) {
		case "pending":
			summary.Pending++
		case "processing":
			summary.Processing++
		case "completed":
			summary.Completed++
		case "failed":
			summary.Failed++
		}
	}
	return summary
}

func summarizeInboundSpoolFailures(items []InboundSpoolRecord) []InboundSpoolFailureReason {
	counts := make(map[string]int)
	diagnostics := make(map[string]*SMTPStatusDiagnostic)
	for _, item := range items {
		message := strings.TrimSpace(item.ErrorMessage)
		if strings.ToLower(strings.TrimSpace(item.Status)) != "failed" || message == "" {
			continue
		}
		counts[message]++
		if item.Diagnostic != nil {
			diagnostic := *item.Diagnostic
			diagnostics[message] = &diagnostic
		}
	}

	if len(counts) == 0 {
		return []InboundSpoolFailureReason{}
	}

	reasons := make([]InboundSpoolFailureReason, 0, len(counts))
	for message, count := range counts {
		reasons = append(reasons, InboundSpoolFailureReason{
			Message:    message,
			Count:      count,
			Diagnostic: diagnostics[message],
		})
	}
	sort.Slice(reasons, func(i, j int) bool {
		if reasons[i].Count == reasons[j].Count {
			return reasons[i].Message < reasons[j].Message
		}
		return reasons[i].Count > reasons[j].Count
	})
	if len(reasons) > 5 {
		reasons = reasons[:5]
	}
	return reasons
}

func decorateInboundSpoolDiagnostics(items []InboundSpoolRecord) []InboundSpoolRecord {
	decorated := make([]InboundSpoolRecord, 0, len(items))
	for _, item := range items {
		next := item
		if strings.EqualFold(strings.TrimSpace(item.Status), "failed") {
			diagnostic := DiagnoseInboundSpoolFailure(item.ErrorMessage)
			next.Diagnostic = &diagnostic
		}
		decorated = append(decorated, next)
	}
	return decorated
}

func matchesInboundSpoolFailureMode(item InboundSpoolRecord, failureMode string) bool {
	switch failureMode {
	case "", "all":
		return true
	case "retryable":
		return item.Diagnostic != nil && item.Diagnostic.Retryable
	case "non_retryable":
		return item.Diagnostic != nil && !item.Diagnostic.Retryable
	default:
		return true
	}
}

func nowUTC() time.Time {
	return time.Now().UTC()
}

func buildSMTPRejectedDetails(rejected map[string]int64) []SMTPMetricReason {
	if len(rejected) == 0 {
		return []SMTPMetricReason{}
	}

	reasons := make([]SMTPMetricReason, 0, len(rejected))
	for key, count := range rejected {
		reasons = append(reasons, SMTPMetricReason{
			Key:        key,
			Count:      count,
			Diagnostic: DiagnoseSMTPRejectedReason(key),
		})
	}
	sort.Slice(reasons, func(i, j int) bool {
		if reasons[i].Count == reasons[j].Count {
			return reasons[i].Key < reasons[j].Key
		}
		return reasons[i].Count > reasons[j].Count
	})
	return reasons
}

func decorateJobDiagnostics(items []JobRecord) []JobRecord {
	decorated := make([]JobRecord, 0, len(items))
	for _, item := range items {
		next := item
		if strings.EqualFold(strings.TrimSpace(item.Status), "failed") {
			next.Diagnostic = diagnoseJobFailure(item.JobType, item.ErrorMessage)
		}
		decorated = append(decorated, next)
	}
	return decorated
}

func diagnoseJobFailure(jobType string, errorMessage string) *SMTPStatusDiagnostic {
	normalizedJobType := strings.ToLower(strings.TrimSpace(jobType))
	normalizedMessage := strings.TrimSpace(errorMessage)
	if normalizedMessage == "" {
		return nil
	}
	if normalizedJobType == "inbound_spool" {
		diagnostic := DiagnoseInboundSpoolFailure(normalizedMessage)
		return &diagnostic
	}
	if strings.Contains(strings.ToLower(normalizedMessage), "starttls") ||
		strings.Contains(strings.ToLower(normalizedMessage), "auth") ||
		strings.Contains(strings.ToLower(normalizedMessage), "mailbox not found") {
		diagnostic := DiagnoseInboundSpoolFailure(normalizedMessage)
		return &diagnostic
	}
	return nil
}

func normalizeInboundSpoolPage(page int) int {
	if page <= 0 {
		return 1
	}
	return page
}

func normalizeInboundSpoolPageSize(pageSize int) int {
	switch {
	case pageSize <= 0:
		return 50
	case pageSize > 200:
		return 200
	default:
		return pageSize
	}
}
