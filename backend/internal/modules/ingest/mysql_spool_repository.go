package ingest

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"

	"shiro-email/backend/internal/database"
)

type MySQLSpoolRepository struct {
	db *gorm.DB
}

func NewMySQLSpoolRepository(db *gorm.DB) *MySQLSpoolRepository {
	return &MySQLSpoolRepository{db: db}
}

func (r *MySQLSpoolRepository) Enqueue(ctx context.Context, item SpoolItem) (SpoolItem, error) {
	recipientsJSON, err := json.Marshal(item.Recipients)
	if err != nil {
		return SpoolItem{}, err
	}
	targetIDsJSON, err := marshalUint64s(item.TargetMailboxIDs)
	if err != nil {
		return SpoolItem{}, err
	}

	now := time.Now().UTC()
	row := database.InboundMessageSpoolRow{
		MailFrom:         item.MailFrom,
		RecipientsJSON:   recipientsJSON,
		TargetMailboxIDs: targetIDsJSON,
		RawMessage:       cloneBytes(item.RawMessage),
		Status:           SpoolStatusPending,
		AttemptCount:     0,
		MaxAttempts:      DefaultSpoolMaxTries,
		CreatedAt:        now,
		UpdatedAt:        now,
		NextAttemptAt:    now,
	}
	if item.MaxAttempts > 0 {
		row.MaxAttempts = item.MaxAttempts
	}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return SpoolItem{}, err
	}
	return mapInboundMessageSpoolRow(row)
}

func (r *MySQLSpoolRepository) ClaimNext(ctx context.Context) (SpoolItem, error) {
	var claimed database.InboundMessageSpoolRow
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row database.InboundMessageSpoolRow
		if err := tx.Session(&gorm.Session{Logger: tx.Logger.LogMode(logger.Silent)}).
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("status = ? AND next_attempt_at <= ?", SpoolStatusPending, time.Now().UTC()).
			Order("id ASC").
			Limit(1).
			First(&row).Error; err != nil {
			return err
		}

		now := time.Now().UTC()
		if err := tx.Model(&row).Updates(map[string]any{
			"status":        SpoolStatusProcessing,
			"attempt_count": row.AttemptCount + 1,
			"updated_at":    now,
		}).Error; err != nil {
			return err
		}
		row.Status = SpoolStatusProcessing
		row.AttemptCount++
		row.UpdatedAt = now
		claimed = row
		return nil
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return SpoolItem{}, ErrSpoolItemNotFound
		}
		return SpoolItem{}, err
	}
	return mapInboundMessageSpoolRow(claimed)
}

func (r *MySQLSpoolRepository) MarkCompleted(ctx context.Context, id uint64) error {
	now := time.Now().UTC()
	result := r.db.WithContext(ctx).Model(&database.InboundMessageSpoolRow{}).
		Where("id = ?", id).
		Updates(map[string]any{
			"status":          SpoolStatusCompleted,
			"updated_at":      now,
			"next_attempt_at": now,
			"processed_at":    now,
			"error_message":   "",
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrSpoolItemNotFound
	}
	return nil
}

func (r *MySQLSpoolRepository) MarkFailed(ctx context.Context, id uint64, errorMessage string) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var row database.InboundMessageSpoolRow
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&row).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrSpoolItemNotFound
			}
			return err
		}

		now := time.Now().UTC()
		updates := map[string]any{
			"updated_at":    now,
			"error_message": errorMessage,
		}
		if row.AttemptCount < row.MaxAttempts {
			updates["status"] = SpoolStatusPending
			updates["next_attempt_at"] = now.Add(5 * time.Second)
		} else {
			updates["status"] = SpoolStatusFailed
			updates["next_attempt_at"] = now
			updates["processed_at"] = now
		}
		return tx.Model(&row).Updates(updates).Error
	})
}

func (r *MySQLSpoolRepository) List(ctx context.Context) ([]SpoolItem, error) {
	var rows []database.InboundMessageSpoolRow
	if err := r.db.WithContext(ctx).Order("id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}
	items := make([]SpoolItem, 0, len(rows))
	for _, row := range rows {
		item, err := mapInboundMessageSpoolRow(row)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, nil
}

func (r *MySQLSpoolRepository) Retry(ctx context.Context, id uint64) (SpoolItem, error) {
	var row database.InboundMessageSpoolRow
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).Where("id = ?", id).First(&row).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrSpoolItemNotFound
			}
			return err
		}

		now := time.Now().UTC()
		updates := map[string]any{
			"status":          SpoolStatusPending,
			"error_message":   "",
			"attempt_count":   0,
			"next_attempt_at": now,
			"processed_at":    nil,
			"updated_at":      now,
		}
		if err := tx.Model(&row).Updates(updates).Error; err != nil {
			return err
		}

		row.Status = SpoolStatusPending
		row.ErrorMessage = ""
		row.AttemptCount = 0
		row.NextAttemptAt = now
		row.ProcessedAt = nil
		row.UpdatedAt = now
		return nil
	})
	if err != nil {
		return SpoolItem{}, err
	}
	return mapInboundMessageSpoolRow(row)
}

func mapInboundMessageSpoolRow(row database.InboundMessageSpoolRow) (SpoolItem, error) {
	var recipients []string
	if len(row.RecipientsJSON) > 0 {
		if err := json.Unmarshal(row.RecipientsJSON, &recipients); err != nil {
			return SpoolItem{}, err
		}
	}
	targetMailboxIDs, err := unmarshalUint64s(row.TargetMailboxIDs)
	if err != nil {
		return SpoolItem{}, err
	}
	return SpoolItem{
		ID:               row.ID,
		MailFrom:         row.MailFrom,
		Recipients:       recipients,
		TargetMailboxIDs: targetMailboxIDs,
		RawMessage:       cloneBytes(row.RawMessage),
		Status:           row.Status,
		ErrorMessage:     row.ErrorMessage,
		AttemptCount:     row.AttemptCount,
		MaxAttempts:      row.MaxAttempts,
		CreatedAt:        row.CreatedAt,
		UpdatedAt:        row.UpdatedAt,
		NextAttemptAt:    row.NextAttemptAt,
		ProcessedAt:      row.ProcessedAt,
	}, nil
}
