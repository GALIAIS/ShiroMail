package mailbox

import (
	"context"
	"errors"
	"strings"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
	"gorm.io/gorm"

	"shiro-email/backend/internal/database"
)

type MySQLRepository struct {
	db *gorm.DB
}

type mailboxRecord struct {
	ID            uint64    `gorm:"column:id"`
	UserID        uint64    `gorm:"column:user_id"`
	DomainID      uint64    `gorm:"column:domain_id"`
	Domain        string    `gorm:"column:domain"`
	LocalPart     string    `gorm:"column:local_part"`
	Address       string    `gorm:"column:address"`
	Status        string    `gorm:"column:status"`
	ExpiresAt     time.Time `gorm:"column:expires_at"`
	RetentionDays int       `gorm:"column:retention_days"`
	CreatedAt     time.Time `gorm:"column:created_at"`
	UpdatedAt     time.Time `gorm:"column:updated_at"`
}

func NewMySQLRepository(db *gorm.DB) *MySQLRepository {
	return &MySQLRepository{db: db}
}

func (r *MySQLRepository) Create(ctx context.Context, item Mailbox) (Mailbox, error) {
	row := database.MailboxRow{
		UserID:        item.UserID,
		DomainID:      item.DomainID,
		LocalPart:     item.LocalPart,
		Address:       item.Address,
		Status:        item.Status,
		ExpiresAt:     item.ExpiresAt,
		RetentionDays: item.RetentionDays,
		CreatedAt:     item.CreatedAt,
		UpdatedAt:     item.UpdatedAt,
	}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return Mailbox{}, mapMailboxWriteError(err)
	}
	return r.getByID(ctx, row.ID)
}

func (r *MySQLRepository) CountActive(ctx context.Context) int {
	var count int64
	if err := r.db.WithContext(ctx).
		Model(&database.MailboxRow{}).
		Where("status = ? AND expires_at > ?", "active", time.Now()).
		Count(&count).Error; err != nil {
		return 0
	}
	return int(count)
}

func (r *MySQLRepository) ListActive(ctx context.Context) ([]Mailbox, error) {
	return r.list(ctx,
		"mailboxes.status = ? AND mailboxes.expires_at > ?",
		"mailboxes.id ASC",
		"active",
		time.Now(),
	)
}

func (r *MySQLRepository) ListAll(ctx context.Context) ([]Mailbox, error) {
	return r.list(ctx, "1 = 1", "mailboxes.id ASC")
}

func (r *MySQLRepository) DeleteByID(ctx context.Context, mailboxID uint64) error {
	result := r.db.WithContext(ctx).
		Where("id = ?", mailboxID).
		Delete(&database.MailboxRow{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return ErrMailboxNotFound
	}
	return nil
}

func (r *MySQLRepository) DeleteByUserID(ctx context.Context, userID uint64) ([]uint64, error) {
	var ids []uint64
	if err := r.db.WithContext(ctx).
		Model(&database.MailboxRow{}).
		Where("user_id = ?", userID).
		Order("id ASC").
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}

	if err := r.db.WithContext(ctx).
		Where("id IN ?", ids).
		Delete(&database.MailboxRow{}).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (r *MySQLRepository) DeleteInactiveByDomainID(ctx context.Context, domainID uint64) ([]uint64, error) {
	var ids []uint64
	if err := r.db.WithContext(ctx).
		Model(&database.MailboxRow{}).
		Where("domain_id = ? AND status <> ?", domainID, "active").
		Order("id ASC").
		Pluck("id", &ids).Error; err != nil {
		return nil, err
	}
	if len(ids) == 0 {
		return nil, nil
	}

	if err := r.db.WithContext(ctx).
		Where("id IN ?", ids).
		Delete(&database.MailboxRow{}).Error; err != nil {
		return nil, err
	}
	return ids, nil
}

func (r *MySQLRepository) ListExpiredIDs(ctx context.Context, now time.Time) ([]uint64, error) {
	var ids []uint64
	err := r.db.WithContext(ctx).
		Model(&database.MailboxRow{}).
		Where("status = ? AND expires_at <= ?", "active", now).
		Order("id ASC").
		Pluck("id", &ids).Error
	return ids, err
}

func (r *MySQLRepository) ListByUserID(ctx context.Context, userID uint64) ([]Mailbox, error) {
	return r.list(ctx, "mailboxes.user_id = ?", "mailboxes.id ASC", userID)
}

func (r *MySQLRepository) FindByUserAndID(ctx context.Context, userID uint64, mailboxID uint64) (Mailbox, error) {
	items, err := r.list(ctx, "mailboxes.user_id = ? AND mailboxes.id = ?", "mailboxes.id ASC", userID, mailboxID)
	if err != nil {
		return Mailbox{}, err
	}
	if len(items) == 0 {
		return Mailbox{}, ErrMailboxNotFound
	}
	return items[0], nil
}

func (r *MySQLRepository) FindByID(ctx context.Context, mailboxID uint64) (Mailbox, error) {
	return r.getByID(ctx, mailboxID)
}

func (r *MySQLRepository) FindActiveByAddress(ctx context.Context, address string) (Mailbox, error) {
	items, err := r.list(
		ctx,
		"LOWER(mailboxes.address) = ? AND mailboxes.status = ? AND mailboxes.expires_at > ?",
		"mailboxes.id ASC",
		strings.ToLower(strings.TrimSpace(address)),
		"active",
		time.Now(),
	)
	if err != nil {
		return Mailbox{}, err
	}
	if len(items) == 0 {
		return Mailbox{}, ErrMailboxNotFound
	}
	return items[0], nil
}

func (r *MySQLRepository) MarkExpired(ctx context.Context, mailboxIDs []uint64) error {
	if len(mailboxIDs) == 0 {
		return nil
	}

	result := r.db.WithContext(ctx).
		Model(&database.MailboxRow{}).
		Where("id IN ?", mailboxIDs).
		Updates(map[string]any{
			"status":     "expired",
			"updated_at": time.Now(),
		})
	return result.Error
}

func (r *MySQLRepository) Update(ctx context.Context, item Mailbox) (Mailbox, error) {
	result := r.db.WithContext(ctx).
		Model(&database.MailboxRow{}).
		Where("id = ? AND user_id = ?", item.ID, item.UserID).
		Updates(map[string]any{
			"domain_id":      item.DomainID,
			"local_part":     item.LocalPart,
			"address":        item.Address,
			"status":         item.Status,
			"expires_at":     item.ExpiresAt,
			"retention_days": item.RetentionDays,
			"updated_at":     item.UpdatedAt,
			"created_at":     item.CreatedAt,
			"is_favorite":    false,
			"source":         "manual",
		})
	if result.Error != nil {
		return Mailbox{}, result.Error
	}
	if result.RowsAffected == 0 {
		return Mailbox{}, ErrMailboxNotFound
	}
	return r.getByID(ctx, item.ID)
}

func (r *MySQLRepository) getByID(ctx context.Context, mailboxID uint64) (Mailbox, error) {
	items, err := r.list(ctx, "mailboxes.id = ?", "mailboxes.id ASC", mailboxID)
	if err != nil {
		return Mailbox{}, err
	}
	if len(items) == 0 {
		return Mailbox{}, ErrMailboxNotFound
	}
	return items[0], nil
}

func (r *MySQLRepository) list(ctx context.Context, where string, order string, args ...any) ([]Mailbox, error) {
	var rows []mailboxRecord
	query := r.db.WithContext(ctx).
		Table("mailboxes").
		Select(
			"mailboxes.id, mailboxes.user_id, mailboxes.domain_id, COALESCE(domains.domain, SUBSTRING_INDEX(mailboxes.address, '@', -1)) AS domain, mailboxes.local_part, mailboxes.address, mailboxes.status, mailboxes.expires_at, mailboxes.retention_days, mailboxes.created_at, mailboxes.updated_at",
		).
		Joins("LEFT JOIN domains ON domains.id = mailboxes.domain_id").
		Where(where, args...).
		Order(order)

	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}

	items := make([]Mailbox, 0, len(rows))
	for _, row := range rows {
		items = append(items, Mailbox{
			ID:            row.ID,
			UserID:        row.UserID,
			DomainID:      row.DomainID,
			Domain:        row.Domain,
			LocalPart:     row.LocalPart,
			Address:       row.Address,
			Status:        row.Status,
			ExpiresAt:     row.ExpiresAt,
			RetentionDays: row.RetentionDays,
			CreatedAt:     row.CreatedAt,
			UpdatedAt:     row.UpdatedAt,
		})
	}
	return items, nil
}

func mapMailboxWriteError(err error) error {
	var mysqlErr *mysqlDriver.MySQLError
	if !errors.As(err, &mysqlErr) || mysqlErr.Number != 1062 {
		return err
	}

	if strings.Contains(strings.ToLower(mysqlErr.Message), "address") {
		return ErrAddressConflict
	}
	return ErrAddressConflict
}
