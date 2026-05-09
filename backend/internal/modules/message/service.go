package message

import (
	"context"
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"
	"time"

	"shiro-email/backend/internal/modules/domain"
	"shiro-email/backend/internal/modules/ingest"
	"shiro-email/backend/internal/modules/mailbox"
	"shiro-email/backend/internal/modules/portal"
	sharedcache "shiro-email/backend/internal/shared/cache"
)

var ErrMessageDeleted = errors.New("message deleted")
var ErrMessageContentUnavailable = errors.New("message content unavailable")
var ErrAttachmentNotFound = errors.New("attachment not found")

type FileReader interface {
	ReadFile(ctx context.Context, key string) ([]byte, error)
}

type Download struct {
	FileName    string
	ContentType string
	Content     []byte
}

type Service struct {
	repo        Repository
	mailboxRepo mailbox.Repository
	domainRepo  domain.Repository
	storage     FileReader
	cache       *sharedcache.JSONCache
}

func NewService(repo Repository, mailboxRepo mailbox.Repository, domainRepo domain.Repository, storage FileReader, cache ...*sharedcache.JSONCache) *Service {
	return &Service{
		repo:        repo,
		mailboxRepo: mailboxRepo,
		domainRepo:  domainRepo,
		storage:     storage,
		cache:       optionalJSONCache(cache),
	}
}

func (s *Service) ListByMailbox(ctx context.Context, userID uint64, mailboxID uint64, apiKeys ...portal.APIKey) ([]Summary, error) {
	if _, err := s.authorizeMailbox(ctx, userID, mailboxID, apiKeys...); err != nil {
		return nil, err
	}
	return s.listSummaries(ctx, mailboxID, "")
}

func (s *Service) SearchByMailbox(ctx context.Context, userID uint64, mailboxID uint64, query string, apiKeys ...portal.APIKey) ([]Summary, error) {
	if _, err := s.authorizeMailbox(ctx, userID, mailboxID, apiKeys...); err != nil {
		return nil, err
	}
	return s.listSummaries(ctx, mailboxID, query)
}

func (s *Service) GetByMailboxAndID(ctx context.Context, userID uint64, mailboxID uint64, messageID uint64, apiKeys ...portal.APIKey) (Message, error) {
	if _, err := s.authorizeMailbox(ctx, userID, mailboxID, apiKeys...); err != nil {
		return Message{}, err
	}

	item, err := s.repo.GetByMailboxAndID(ctx, mailboxID, messageID)
	if err != nil {
		return Message{}, err
	}
	if item.IsDeleted {
		return Message{}, ErrMessageDeleted
	}
	return item, nil
}

func (s *Service) DownloadRawByMailboxAndID(ctx context.Context, userID uint64, mailboxID uint64, messageID uint64, apiKeys ...portal.APIKey) (Download, error) {
	item, err := s.GetByMailboxAndID(ctx, userID, mailboxID, messageID, apiKeys...)
	if err != nil {
		return Download{}, err
	}
	if s.storage == nil || strings.TrimSpace(item.RawStorageKey) == "" {
		return Download{}, ErrMessageContentUnavailable
	}

	content, err := s.storage.ReadFile(ctx, item.RawStorageKey)
	if err != nil {
		return Download{}, err
	}

	fileName := item.SourceMessageID
	if strings.TrimSpace(fileName) == "" {
		fileName = "message-" + strconv.FormatUint(item.ID, 10)
	}

	return Download{
		FileName:    sanitizeDownloadName(fileName) + ".eml",
		ContentType: "message/rfc822",
		Content:     content,
	}, nil
}

func (s *Service) ParseRawByMailboxAndID(ctx context.Context, userID uint64, mailboxID uint64, messageID uint64, apiKeys ...portal.APIKey) (ParsedRawMessage, error) {
	item, err := s.GetByMailboxAndID(ctx, userID, mailboxID, messageID, apiKeys...)
	if err != nil {
		return ParsedRawMessage{}, err
	}
	if s.storage == nil || strings.TrimSpace(item.RawStorageKey) == "" {
		return ParsedRawMessage{}, ErrMessageContentUnavailable
	}

	content, err := s.storage.ReadFile(ctx, item.RawStorageKey)
	if err != nil {
		return ParsedRawMessage{}, err
	}

	parsed, err := ingest.ParseInboundMessage(ingest.InboundEnvelope{
		MailFrom:   item.FromAddr,
		Recipients: splitRecipients(item.ToAddr),
	}, strings.NewReader(string(content)))
	if err != nil {
		return ParsedRawMessage{}, err
	}

	return mapParsedRawMessage(item, parsed), nil
}

func (s *Service) DownloadAttachmentByMailboxAndID(ctx context.Context, userID uint64, mailboxID uint64, messageID uint64, attachmentIndex int, apiKeys ...portal.APIKey) (Download, error) {
	item, err := s.GetByMailboxAndID(ctx, userID, mailboxID, messageID, apiKeys...)
	if err != nil {
		return Download{}, err
	}
	if attachmentIndex < 0 || attachmentIndex >= len(item.Attachments) {
		return Download{}, ErrAttachmentNotFound
	}
	if s.storage == nil {
		return Download{}, ErrMessageContentUnavailable
	}

	attachment := item.Attachments[attachmentIndex]
	content, err := s.storage.ReadFile(ctx, attachment.StorageKey)
	if err != nil {
		return Download{}, err
	}

	contentType := strings.TrimSpace(attachment.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	fileName := strings.TrimSpace(attachment.FileName)
	if fileName == "" {
		fileName = fmt.Sprintf("attachment-%d.bin", attachmentIndex+1)
	}

	return Download{
		FileName:    sanitizeDownloadName(fileName),
		ContentType: contentType,
		Content:     content,
	}, nil
}

func (s *Service) ListByMailboxForAdmin(ctx context.Context, mailboxID uint64) ([]Summary, error) {
	if _, err := s.mailboxRepo.FindByID(ctx, mailboxID); err != nil {
		return nil, err
	}
	return s.listSummaries(ctx, mailboxID, "")
}

func (s *Service) BatchDeleteMessages(ctx context.Context, userID uint64, messageIDs []uint64) error {
	if len(messageIDs) == 0 {
		return nil
	}
	if err := s.verifyMessageOwnership(ctx, userID, messageIDs); err != nil {
		return err
	}
	return s.repo.SoftDeleteByIDs(ctx, messageIDs)
}

func (s *Service) BatchSetReadMessages(ctx context.Context, userID uint64, messageIDs []uint64, read bool) error {
	if len(messageIDs) == 0 {
		return nil
	}
	if err := s.verifyMessageOwnership(ctx, userID, messageIDs); err != nil {
		return err
	}
	return s.repo.SetReadByIDs(ctx, messageIDs, read)
}

func (s *Service) verifyMessageOwnership(ctx context.Context, userID uint64, messageIDs []uint64) error {
	userMailboxes, err := s.mailboxRepo.ListByUserID(ctx, userID)
	if err != nil {
		return err
	}
	allowedMailboxIDs := make(map[uint64]bool, len(userMailboxes))
	for _, item := range userMailboxes {
		allowedMailboxIDs[item.ID] = true
	}

	uniqueIDs := make(map[uint64]struct{}, len(messageIDs))
	for _, id := range messageIDs {
		uniqueIDs[id] = struct{}{}
	}

	mailboxIDsForMessages, err := s.repo.MailboxIDsByMessageIDs(ctx, messageIDs)
	if err != nil {
		return err
	}
	if len(mailboxIDsForMessages) != len(uniqueIDs) {
		return errors.New("one or more messages not found")
	}
	for _, mailboxID := range mailboxIDsForMessages {
		if !allowedMailboxIDs[mailboxID] {
			return errors.New("message does not belong to user")
		}
	}
	return nil
}

func (s *Service) GetByMailboxAndIDForAdmin(ctx context.Context, mailboxID uint64, messageID uint64) (Message, error) {
	if _, err := s.mailboxRepo.FindByID(ctx, mailboxID); err != nil {
		return Message{}, err
	}

	item, err := s.repo.GetByMailboxAndID(ctx, mailboxID, messageID)
	if err != nil {
		return Message{}, err
	}
	if item.IsDeleted {
		return Message{}, ErrMessageDeleted
	}
	return item, nil
}

func (s *Service) InvalidateMailboxListCache(ctx context.Context, mailboxID uint64) {
	if s.cache == nil {
		return
	}
	_ = s.cache.DeleteByPattern(ctx, mailboxMessageListCachePattern(mailboxID))
}

func (s *Service) MessageTrend(ctx context.Context, userID uint64, days int) ([]DailyCount, error) {
	if days <= 0 || days > 90 {
		days = 7
	}
	return s.repo.CountDailyRangeByUser(ctx, userID, days)
}

func (s *Service) RecentActivity(ctx context.Context, userID uint64, limit int) ([]Summary, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	return s.repo.RecentByUser(ctx, userID, limit)
}

func (s *Service) GlobalSearch(ctx context.Context, userID uint64, query string, limit int) ([]Summary, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	return s.repo.SearchByUser(ctx, userID, query, limit)
}

func (s *Service) listSummaries(ctx context.Context, mailboxID uint64, query string) ([]Summary, error) {
	cacheKey := mailboxMessageListCacheKey(mailboxID, query)
	if query == "" && s.cache != nil {
		var cached []Summary
		ok, err := s.cache.Get(ctx, cacheKey, &cached)
		if err == nil && ok {
			return cached, nil
		}
	}

	var (
		items []Summary
		err   error
	)
	if query == "" {
		items, err = s.repo.ListSummaryByMailboxID(ctx, mailboxID)
	} else {
		items, err = s.repo.SearchSummaryByMailboxID(ctx, mailboxID, query)
	}
	if err != nil {
		return nil, err
	}

	if query == "" && s.cache != nil {
		_ = s.cache.Set(ctx, cacheKey, 15*time.Second, items)
	}
	return items, nil
}

func (s *Service) DownloadRawByMailboxAndIDForAdmin(ctx context.Context, mailboxID uint64, messageID uint64) (Download, error) {
	item, err := s.GetByMailboxAndIDForAdmin(ctx, mailboxID, messageID)
	if err != nil {
		return Download{}, err
	}
	if s.storage == nil || strings.TrimSpace(item.RawStorageKey) == "" {
		return Download{}, ErrMessageContentUnavailable
	}

	content, err := s.storage.ReadFile(ctx, item.RawStorageKey)
	if err != nil {
		return Download{}, err
	}

	fileName := item.SourceMessageID
	if strings.TrimSpace(fileName) == "" {
		fileName = "message-" + strconv.FormatUint(item.ID, 10)
	}

	return Download{
		FileName:    sanitizeDownloadName(fileName) + ".eml",
		ContentType: "message/rfc822",
		Content:     content,
	}, nil
}

func (s *Service) ParseRawByMailboxAndIDForAdmin(ctx context.Context, mailboxID uint64, messageID uint64) (ParsedRawMessage, error) {
	item, err := s.GetByMailboxAndIDForAdmin(ctx, mailboxID, messageID)
	if err != nil {
		return ParsedRawMessage{}, err
	}
	if s.storage == nil || strings.TrimSpace(item.RawStorageKey) == "" {
		return ParsedRawMessage{}, ErrMessageContentUnavailable
	}

	content, err := s.storage.ReadFile(ctx, item.RawStorageKey)
	if err != nil {
		return ParsedRawMessage{}, err
	}

	parsed, err := ingest.ParseInboundMessage(ingest.InboundEnvelope{
		MailFrom:   item.FromAddr,
		Recipients: splitRecipients(item.ToAddr),
	}, strings.NewReader(string(content)))
	if err != nil {
		return ParsedRawMessage{}, err
	}

	return mapParsedRawMessage(item, parsed), nil
}

func (s *Service) DownloadAttachmentByMailboxAndIDForAdmin(ctx context.Context, mailboxID uint64, messageID uint64, attachmentIndex int) (Download, error) {
	item, err := s.GetByMailboxAndIDForAdmin(ctx, mailboxID, messageID)
	if err != nil {
		return Download{}, err
	}
	if attachmentIndex < 0 || attachmentIndex >= len(item.Attachments) {
		return Download{}, ErrAttachmentNotFound
	}
	if s.storage == nil {
		return Download{}, ErrMessageContentUnavailable
	}

	attachment := item.Attachments[attachmentIndex]
	content, err := s.storage.ReadFile(ctx, attachment.StorageKey)
	if err != nil {
		return Download{}, err
	}

	contentType := strings.TrimSpace(attachment.ContentType)
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	fileName := strings.TrimSpace(attachment.FileName)
	if fileName == "" {
		fileName = fmt.Sprintf("attachment-%d.bin", attachmentIndex+1)
	}

	return Download{
		FileName:    sanitizeDownloadName(fileName),
		ContentType: contentType,
		Content:     content,
	}, nil
}

func (s *Service) ReceiveRawMessage(ctx context.Context, userID uint64, mailboxID uint64, mailFrom string, raw []byte, receiver InboundReceiver, apiKeys ...portal.APIKey) (Message, error) {
	if receiver == nil {
		return Message{}, ErrMessageContentUnavailable
	}
	if len(raw) == 0 {
		return Message{}, errors.New("raw message required")
	}

	targetMailbox, err := s.authorizeMailboxWithAccess(ctx, userID, mailboxID, "write", apiKeys...)
	if err != nil {
		return Message{}, err
	}

	stored, err := receiver.Deliver(ctx, ingest.InboundEnvelope{
		MailFrom:   strings.TrimSpace(mailFrom),
		Recipients: []string{targetMailbox.Address},
	}, strings.NewReader(string(raw)))
	if err != nil {
		return Message{}, err
	}
	if stored.SourceKind == "smtp-spool" {
		now := time.Now().UTC()
		return Message{
			MailboxID:        mailboxID,
			SourceKind:       stored.SourceKind,
			SourceMessageID:  stored.SourceMessageID,
			MailboxAddress:   targetMailbox.Address,
			FromAddr:         strings.TrimSpace(mailFrom),
			ToAddr:           targetMailbox.Address,
			IsRead:           false,
			IsDeleted:        false,
			ReceivedAt:       now,
			LegacyMailboxKey: targetMailbox.Address,
			LegacyMessageKey: stored.SourceMessageID,
		}, nil
	}

	items, err := s.repo.ListByMailboxID(ctx, mailboxID)
	if err != nil {
		return Message{}, err
	}
	for _, item := range items {
		if item.SourceKind == stored.SourceKind && item.SourceMessageID == stored.SourceMessageID {
			return item, nil
		}
	}
	return Message{}, ingest.ErrMessageNotFound
}

func (s *Service) authorizeMailbox(ctx context.Context, userID uint64, mailboxID uint64, apiKeys ...portal.APIKey) (mailbox.Mailbox, error) {
	return s.authorizeMailboxWithAccess(ctx, userID, mailboxID, "read", apiKeys...)
}

func (s *Service) authorizeMailboxWithAccess(ctx context.Context, userID uint64, mailboxID uint64, requiredAccess string, apiKeys ...portal.APIKey) (mailbox.Mailbox, error) {
	item, err := s.mailboxRepo.FindByUserAndID(ctx, userID, mailboxID)
	if err != nil {
		return mailbox.Mailbox{}, err
	}

	apiKey := optionalAPIKey(apiKeys...)
	if apiKey == nil {
		return item, nil
	}
	if !portal.APIKeyHasDomainBindings(*apiKey) {
		return item, nil
	}

	selectedDomain, err := s.domainRepo.GetActiveByID(ctx, item.DomainID)
	if err != nil {
		return mailbox.Mailbox{}, err
	}
	if !apiKeyAllowsDomainAccess(*apiKey, userID, selectedDomain, requiredAccess) {
		return mailbox.Mailbox{}, portal.ErrAPIKeyForbidden
	}

	return item, nil
}

func IsNotFound(err error) bool {
	return errors.Is(err, mailbox.ErrMailboxNotFound) || errors.Is(err, ingest.ErrMessageNotFound)
}

func sanitizeDownloadName(value string) string {
	replacer := strings.NewReplacer(
		"\\", "_",
		"/", "_",
		":", "_",
		"*", "_",
		"?", "_",
		"\"", "_",
		"<", "_",
		">", "_",
		"|", "_",
	)
	cleaned := strings.TrimSpace(replacer.Replace(value))
	if cleaned == "" {
		return "message"
	}
	return cleaned
}

func optionalAPIKey(items ...portal.APIKey) *portal.APIKey {
	if len(items) == 0 {
		return nil
	}
	return &items[0]
}

func optionalJSONCache(items []*sharedcache.JSONCache) *sharedcache.JSONCache {
	if len(items) == 0 {
		return nil
	}
	return items[0]
}

func mailboxMessageListCacheKey(mailboxID uint64, query string) string {
	trimmed := strings.TrimSpace(query)
	if trimmed == "" {
		return fmt.Sprintf("cache:mailbox:%d:messages:list", mailboxID)
	}
	return fmt.Sprintf("cache:mailbox:%d:messages:search:%s", mailboxID, trimmed)
}

func mailboxMessageListCachePattern(mailboxID uint64) string {
	return fmt.Sprintf("cache:mailbox:%d:messages:*", mailboxID)
}

func summarizeMessages(items []Message) []Summary {
	summaries := make([]Summary, 0, len(items))
	for _, item := range items {
		summaries = append(summaries, Summary{
			ID:               item.ID,
			MailboxID:        item.MailboxID,
			LegacyMailboxKey: item.LegacyMailboxKey,
			LegacyMessageKey: item.LegacyMessageKey,
			SourceKind:       item.SourceKind,
			SourceMessageID:  item.SourceMessageID,
			MailboxAddress:   item.MailboxAddress,
			FromAddr:         item.FromAddr,
			ToAddr:           item.ToAddr,
			Subject:          item.Subject,
			TextPreview:      item.TextPreview,
			HTMLPreview:      item.HTMLPreview,
			HasAttachments:   item.HasAttachments,
			AttachmentCount:  len(item.Attachments),
			SizeBytes:        item.SizeBytes,
			IsRead:           item.IsRead,
			IsDeleted:        item.IsDeleted,
			ReceivedAt:       item.ReceivedAt,
		})
	}
	return summaries
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

func splitRecipients(toAddr string) []string {
	trimmed := strings.TrimSpace(toAddr)
	if trimmed == "" {
		return nil
	}

	parts := strings.Split(trimmed, ",")
	output := make([]string, 0, len(parts))
	for _, item := range parts {
		value := strings.TrimSpace(item)
		if value == "" {
			continue
		}
		output = append(output, value)
	}
	return output
}

func mapParsedRawMessage(item Message, parsed ingest.InboundMessage) ParsedRawMessage {
	attachments := make([]ParsedRawAttachment, 0, len(parsed.Attachments))
	for _, attachment := range parsed.Attachments {
		attachments = append(attachments, ParsedRawAttachment{
			FileName:    attachment.FileName,
			ContentType: attachment.ContentType,
			ContentID:   attachment.ContentID,
			SizeBytes:   attachment.SizeBytes,
		})
	}

	return ParsedRawMessage{
		MessageID:       item.ID,
		MailboxID:       item.MailboxID,
		Subject:         parsed.Subject,
		FromAddr:        parsed.FromAddr,
		ToAddr:          parsed.ToAddr,
		ReceivedAt:      parsed.ReceivedAt,
		TextBody:        parsed.TextBody,
		HTMLBody:        parsed.HTMLBody,
		Headers:         parsed.Headers,
		AttachmentCount: len(attachments),
		Attachments:     attachments,
		RawSizeBytes:    int64(len(parsed.RawBytes)),
	}
}

type InboundReceiver interface {
	Deliver(ctx context.Context, env ingest.InboundEnvelope, source io.Reader) (ingest.StoredInboundMessage, error)
}
