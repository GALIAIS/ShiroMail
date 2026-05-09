package message

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"

	"shiro-email/backend/internal/database"
	"shiro-email/backend/internal/modules/ingest"
	"shiro-email/backend/internal/shared/mimeheader"
)

type MySQLRepository struct {
	db *gorm.DB
}

func NewMySQLRepository(db *gorm.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (r *MySQLRepository) UpsertFromLegacySync(ctx context.Context, mailboxID uint64, mailboxName string, parsed ingest.ParsedMessage) error {
	headersJSON, err := json.Marshal(parsed.Header)
	if err != nil {
		return err
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row database.MessageRow
		result := tx.Where("legacy_mailbox_key = ? AND legacy_message_key = ?", mailboxName, parsed.LegacyMessageKey).
			Limit(1).
			Find(&row)
		switch {
		case result.RowsAffected == 0:
			row = database.MessageRow{
				MailboxID:        mailboxID,
				LegacyMailboxKey: mailboxName,
				LegacyMessageKey: parsed.LegacyMessageKey,
				SourceKind:       ingest.LegacySourceKind,
				SourceMessageID:  parsed.LegacyMessageKey,
				MailboxAddress:   parsed.ToAddr,
				FromAddr:         parsed.FromAddr,
				ToAddr:           parsed.ToAddr,
				Subject:          parsed.Subject,
				TextPreview:      parsed.TextPreview,
				HTMLPreview:      parsed.HTMLPreview,
				TextBody:         parsed.TextPreview,
				HTMLBody:         parsed.HTMLPreview,
				HeadersJSON:      headersJSON,
				HasAttachments:   len(parsed.Attachments) > 0,
				SizeBytes:        parsed.SizeBytes,
				IsRead:           parsed.IsRead,
				IsDeleted:        false,
				ReceivedAt:       parsed.ReceivedAt,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		case result.Error != nil:
			return result.Error
		default:
			if err := tx.Model(&row).Updates(map[string]any{
				"mailbox_id":         mailboxID,
				"legacy_mailbox_key": mailboxName,
				"legacy_message_key": parsed.LegacyMessageKey,
				"source_kind":        ingest.LegacySourceKind,
				"source_message_id":  parsed.LegacyMessageKey,
				"mailbox_address":    parsed.ToAddr,
				"from_addr":          parsed.FromAddr,
				"to_addr":            parsed.ToAddr,
				"subject":            parsed.Subject,
				"text_preview":       parsed.TextPreview,
				"html_preview":       parsed.HTMLPreview,
				"text_body":          parsed.TextPreview,
				"html_body":          parsed.HTMLPreview,
				"headers_json":       headersJSON,
				"raw_storage_key":    "",
				"has_attachments":    len(parsed.Attachments) > 0,
				"size_bytes":         parsed.SizeBytes,
				"is_read":            parsed.IsRead,
				"is_deleted":         false,
				"received_at":        parsed.ReceivedAt,
			}).Error; err != nil {
				return err
			}
		}

		if err := tx.Where("message_id = ?", row.ID).Delete(&database.MessageAttachmentRow{}).Error; err != nil {
			return err
		}
		for _, item := range parsed.Attachments {
			if err := tx.Create(&database.MessageAttachmentRow{
				MessageID:   row.ID,
				FileName:    item.FileName,
				ContentType: item.ContentType,
				SizeBytes:   item.SizeBytes,
				StorageKey:  item.StorageKey,
			}).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

func (r *MySQLRepository) StoreInbound(ctx context.Context, mailboxID uint64, item ingest.StoredInboundMessage) error {
	headersJSON, err := json.Marshal(item.Headers)
	if err != nil {
		return err
	}

	receivedAt := item.ReceivedAt
	if receivedAt.IsZero() {
		receivedAt = time.Now().UTC()
	}

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		sourceMailbox := item.MailboxAddress
		if sourceMailbox == "" {
			sourceMailbox = item.ToAddr
		}
		sourceMessageID := item.SourceMessageID

		var row database.MessageRow
		result := tx.Where("legacy_mailbox_key = ? AND legacy_message_key = ?", sourceMailbox, sourceMessageID).
			Limit(1).
			Find(&row)
		switch {
		case result.Error != nil:
			return result.Error
		case result.RowsAffected == 0:
			row = database.MessageRow{
				MailboxID:        mailboxID,
				LegacyMailboxKey: sourceMailbox,
				LegacyMessageKey: sourceMessageID,
				SourceKind:       item.SourceKind,
				SourceMessageID:  item.SourceMessageID,
				MailboxAddress:   item.MailboxAddress,
				FromAddr:         item.FromAddr,
				ToAddr:           item.ToAddr,
				Subject:          item.Subject,
				TextPreview:      item.TextPreview,
				HTMLPreview:      item.HTMLPreview,
				TextBody:         item.TextBody,
				HTMLBody:         item.HTMLBody,
				HeadersJSON:      headersJSON,
				RawStorageKey:    item.RawStorageKey,
				HasAttachments:   item.HasAttachments,
				SizeBytes:        item.SizeBytes,
				IsRead:           false,
				IsDeleted:        false,
				ReceivedAt:       receivedAt,
			}
			if err := tx.Create(&row).Error; err != nil {
				return err
			}
		default:
			if err := tx.Model(&row).Updates(map[string]any{
				"mailbox_id":         mailboxID,
				"legacy_mailbox_key": sourceMailbox,
				"legacy_message_key": sourceMessageID,
				"source_kind":        item.SourceKind,
				"source_message_id":  item.SourceMessageID,
				"mailbox_address":    item.MailboxAddress,
				"from_addr":          item.FromAddr,
				"to_addr":            item.ToAddr,
				"subject":            item.Subject,
				"text_preview":       item.TextPreview,
				"html_preview":       item.HTMLPreview,
				"text_body":          item.TextBody,
				"html_body":          item.HTMLBody,
				"headers_json":       headersJSON,
				"raw_storage_key":    item.RawStorageKey,
				"has_attachments":    item.HasAttachments,
				"size_bytes":         item.SizeBytes,
				"is_read":            false,
				"is_deleted":         false,
				"received_at":        receivedAt,
			}).Error; err != nil {
				return err
			}
		}

		if err := tx.Where("message_id = ?", row.ID).Delete(&database.MessageAttachmentRow{}).Error; err != nil {
			return err
		}

		for _, attachment := range item.Attachments {
			if err := tx.Create(&database.MessageAttachmentRow{
				MessageID:   row.ID,
				FileName:    attachment.FileName,
				ContentType: attachment.ContentType,
				SizeBytes:   attachment.SizeBytes,
				StorageKey:  attachment.StorageKey,
			}).Error; err != nil {
				return err
			}
		}

		return nil
	})
}

func (r *MySQLRepository) ListByMailboxID(ctx context.Context, mailboxID uint64) ([]Message, error) {
	var rows []database.MessageRow
	if err := r.db.WithContext(ctx).
		Where("mailbox_id = ? AND is_deleted = ?", mailboxID, false).
		Order("received_at DESC, id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	attachments, err := r.loadAttachments(ctx, messageIDs(rows))
	if err != nil {
		return nil, err
	}
	return mapMessageRows(rows, attachments), nil
}

func (r *MySQLRepository) ListSummaryByMailboxID(ctx context.Context, mailboxID uint64) ([]Summary, error) {
	rows, err := r.loadMessageSummaryRows(ctx, mailboxID, "")
	if err != nil {
		return nil, err
	}
	counts, err := r.loadAttachmentCounts(ctx, messageIDs(rows))
	if err != nil {
		return nil, err
	}
	return mapMessageSummaries(rows, counts), nil
}

func (r *MySQLRepository) SearchByMailboxID(ctx context.Context, mailboxID uint64, query string) ([]Message, error) {
	var rows []database.MessageRow
	if err := r.db.WithContext(ctx).
		Where("mailbox_id = ? AND is_deleted = ? AND MATCH(from_addr, subject, text_preview) AGAINST(? IN BOOLEAN MODE)", mailboxID, false, query).
		Order("received_at DESC, id ASC").
		Limit(50).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	attachments, err := r.loadAttachments(ctx, messageIDs(rows))
	if err != nil {
		return nil, err
	}
	return mapMessageRows(rows, attachments), nil
}

func (r *MySQLRepository) SearchSummaryByMailboxID(ctx context.Context, mailboxID uint64, query string) ([]Summary, error) {
	rows, err := r.loadMessageSummaryRows(ctx, mailboxID, query)
	if err != nil {
		return nil, err
	}
	counts, err := r.loadAttachmentCounts(ctx, messageIDs(rows))
	if err != nil {
		return nil, err
	}
	return mapMessageSummaries(rows, counts), nil
}

func (r *MySQLRepository) GetByMailboxAndID(ctx context.Context, mailboxID uint64, messageID uint64) (Message, error) {
	var row database.MessageRow
	if err := r.db.WithContext(ctx).
		Where("mailbox_id = ? AND id = ?", mailboxID, messageID).
		First(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return Message{}, ingest.ErrMessageNotFound
		}
		return Message{}, err
	}

	attachments, err := r.loadAttachments(ctx, []uint64{row.ID})
	if err != nil {
		return Message{}, err
	}
	return mapMessageRow(row, attachments[row.ID]), nil
}

func (r *MySQLRepository) SoftDeleteByMailboxIDs(ctx context.Context, mailboxIDs []uint64) error {
	if len(mailboxIDs) == 0 {
		return nil
	}

	return r.db.WithContext(ctx).
		Model(&database.MessageRow{}).
		Where("mailbox_id IN ?", mailboxIDs).
		Update("is_deleted", true).Error
}

func (r *MySQLRepository) CountToday(ctx context.Context) int {
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	end := start.Add(24 * time.Hour)

	var count int64
	if err := r.db.WithContext(ctx).
		Model(&database.MessageRow{}).
		Where("is_deleted = ? AND received_at >= ? AND received_at < ?", false, start, end).
		Count(&count).Error; err != nil {
		return 0
	}
	return int(count)
}

func (r *MySQLRepository) CountDailyRange(ctx context.Context, days int) ([]DailyCount, error) {
	if days <= 0 {
		days = 7
	}
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -(days-1))

	type row struct {
		Day   string
		Total int64
	}
	var rows []row
	err := r.db.WithContext(ctx).
		Model(&database.MessageRow{}).
		Select("DATE(received_at) AS day, COUNT(*) AS total").
		Where("is_deleted = ? AND received_at >= ?", false, start).
		Group("day").
		Order("day ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	dateMap := make(map[string]int, len(rows))
	for _, r := range rows {
		dateMap[r.Day] = int(r.Total)
	}

	result := make([]DailyCount, 0, days)
	for i := 0; i < days; i++ {
		d := start.AddDate(0, 0, i).Format("2006-01-02")
		result = append(result, DailyCount{Date: d, Count: dateMap[d]})
	}
	return result, nil
}

func (r *MySQLRepository) CountDailyRangeByUser(ctx context.Context, userID uint64, days int) ([]DailyCount, error) {
	if days <= 0 {
		days = 7
	}
	now := time.Now()
	start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).AddDate(0, 0, -(days-1))

	type row struct {
		Day   string
		Total int64
	}
	var rows []row
	err := r.db.WithContext(ctx).
		Table("messages").
		Select("DATE(messages.received_at) AS day, COUNT(*) AS total").
		Joins("JOIN mailboxes ON mailboxes.id = messages.mailbox_id").
		Where("messages.is_deleted = ? AND messages.received_at >= ? AND mailboxes.user_id = ?", false, start, userID).
		Group("day").
		Order("day ASC").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}

	dateMap := make(map[string]int, len(rows))
	for _, r := range rows {
		dateMap[r.Day] = int(r.Total)
	}

	result := make([]DailyCount, 0, days)
	for i := 0; i < days; i++ {
		d := start.AddDate(0, 0, i).Format("2006-01-02")
		result = append(result, DailyCount{Date: d, Count: dateMap[d]})
	}
	return result, nil
}

func (r *MySQLRepository) loadMessageSummaryRows(ctx context.Context, mailboxID uint64, query string) ([]database.MessageRow, error) {
	db := r.db.WithContext(ctx).
		Select([]string{
			"id",
			"mailbox_id",
			"legacy_mailbox_key",
			"legacy_message_key",
			"source_kind",
			"source_message_id",
			"mailbox_address",
			"from_addr",
			"to_addr",
			"subject",
			"text_preview",
			"html_preview",
			"has_attachments",
			"size_bytes",
			"is_read",
			"is_deleted",
			"received_at",
		}).
		Where("mailbox_id = ? AND is_deleted = ?", mailboxID, false).
		Order("received_at DESC, id ASC")

	if query != "" {
		db = db.Where("MATCH(from_addr, subject, text_preview) AGAINST(? IN BOOLEAN MODE)", query).Limit(50)
	}

	var rows []database.MessageRow
	if err := db.Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (r *MySQLRepository) loadAttachments(ctx context.Context, messageIDs []uint64) (map[uint64][]Attachment, error) {
	grouped := make(map[uint64][]Attachment, len(messageIDs))
	if len(messageIDs) == 0 {
		return grouped, nil
	}

	var rows []database.MessageAttachmentRow
	if err := r.db.WithContext(ctx).
		Where("message_id IN ?", messageIDs).
		Order("id ASC").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		grouped[row.MessageID] = append(grouped[row.MessageID], Attachment{
			FileName:    row.FileName,
			ContentType: row.ContentType,
			StorageKey:  row.StorageKey,
			SizeBytes:   row.SizeBytes,
		})
	}

	return grouped, nil
}

func (r *MySQLRepository) loadAttachmentCounts(ctx context.Context, messageIDs []uint64) (map[uint64]int, error) {
	counts := make(map[uint64]int, len(messageIDs))
	if len(messageIDs) == 0 {
		return counts, nil
	}

	type countRow struct {
		MessageID uint64
		Count     int
	}

	var rows []countRow
	if err := r.db.WithContext(ctx).
		Model(&database.MessageAttachmentRow{}).
		Select("message_id, COUNT(*) AS count").
		Where("message_id IN ?", messageIDs).
		Group("message_id").
		Find(&rows).Error; err != nil {
		return nil, err
	}

	for _, row := range rows {
		counts[row.MessageID] = row.Count
	}

	return counts, nil
}

func messageIDs(rows []database.MessageRow) []uint64 {
	ids := make([]uint64, 0, len(rows))
	for _, row := range rows {
		ids = append(ids, row.ID)
	}
	return ids
}

func mapMessageRows(rows []database.MessageRow, attachments map[uint64][]Attachment) []Message {
	items := make([]Message, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapMessageRow(row, attachments[row.ID]))
	}
	return items
}

func mapMessageSummaries(rows []database.MessageRow, attachmentCounts map[uint64]int) []Summary {
	items := make([]Summary, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapMessageSummary(row, attachmentCounts[row.ID]))
	}
	return items
}

func mapMessageRow(row database.MessageRow, attachments []Attachment) Message {
	return Message{
		ID:               row.ID,
		MailboxID:        row.MailboxID,
		LegacyMailboxKey: row.LegacyMailboxKey,
		LegacyMessageKey: row.LegacyMessageKey,
		SourceKind:       row.SourceKind,
		SourceMessageID:  row.SourceMessageID,
		MailboxAddress:   row.MailboxAddress,
		FromAddr:         mimeheader.Decode(row.FromAddr),
		ToAddr:           mimeheader.Decode(row.ToAddr),
		Subject:          mimeheader.Decode(row.Subject),
		TextPreview:      row.TextPreview,
		HTMLPreview:      row.HTMLPreview,
		TextBody:         row.TextBody,
		HTMLBody:         row.HTMLBody,
		Headers:          decodeHeadersJSON(row.HeadersJSON),
		RawStorageKey:    row.RawStorageKey,
		HasAttachments:   row.HasAttachments,
		SizeBytes:        row.SizeBytes,
		IsRead:           row.IsRead,
		IsDeleted:        row.IsDeleted,
		ReceivedAt:       row.ReceivedAt,
		Attachments:      attachments,
	}
}

func mapMessageSummary(row database.MessageRow, attachmentCount int) Summary {
	return Summary{
		ID:               row.ID,
		MailboxID:        row.MailboxID,
		LegacyMailboxKey: row.LegacyMailboxKey,
		LegacyMessageKey: row.LegacyMessageKey,
		SourceKind:       row.SourceKind,
		SourceMessageID:  row.SourceMessageID,
		MailboxAddress:   row.MailboxAddress,
		FromAddr:         mimeheader.Decode(row.FromAddr),
		ToAddr:           mimeheader.Decode(row.ToAddr),
		Subject:          mimeheader.Decode(row.Subject),
		TextPreview:      row.TextPreview,
		HTMLPreview:      row.HTMLPreview,
		HasAttachments:   row.HasAttachments,
		AttachmentCount:  attachmentCount,
		SizeBytes:        row.SizeBytes,
		IsRead:           row.IsRead,
		IsDeleted:        row.IsDeleted,
		ReceivedAt:       row.ReceivedAt,
	}
}

func decodeHeadersJSON(payload []byte) map[string][]string {
	if len(payload) == 0 {
		return map[string][]string{}
	}

	headers := map[string][]string{}
	if err := json.Unmarshal(payload, &headers); err != nil {
		return map[string][]string{}
	}
	return mimeheader.DecodeMap(headers)
}
