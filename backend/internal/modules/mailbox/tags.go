package mailbox

import (
	"context"
	"time"

	"shiro-email/backend/internal/database"
	"gorm.io/gorm"
)

type Tag struct {
	ID        uint64 `json:"id"`
	UserID    uint64 `json:"userId"`
	Name      string `json:"name"`
	Color     string `json:"color"`
	CreatedAt string `json:"createdAt"`
}

type TagBinding struct {
	MailboxID uint64 `json:"mailboxId"`
	TagID     uint64 `json:"tagId"`
}

type TagRepository struct {
	db *gorm.DB
}

func NewTagRepository(db *gorm.DB) *TagRepository {
	return &TagRepository{db: db}
}

func (r *TagRepository) ListByUser(ctx context.Context, userID uint64) ([]Tag, error) {
	var rows []database.MailboxTagRow
	if err := r.db.WithContext(ctx).Where("user_id = ?", userID).Order("name ASC").Find(&rows).Error; err != nil {
		return nil, err
	}
	tags := make([]Tag, len(rows))
	for i, row := range rows {
		tags[i] = tagFromRow(row)
	}
	return tags, nil
}

func (r *TagRepository) Create(ctx context.Context, userID uint64, name, color string) (Tag, error) {
	row := database.MailboxTagRow{
		UserID:    userID,
		Name:      name,
		Color:     color,
		CreatedAt: time.Now(),
	}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return Tag{}, err
	}
	return tagFromRow(row), nil
}

func (r *TagRepository) Update(ctx context.Context, userID, tagID uint64, name, color string) (Tag, error) {
	var row database.MailboxTagRow
	if err := r.db.WithContext(ctx).Where("id = ? AND user_id = ?", tagID, userID).First(&row).Error; err != nil {
		return Tag{}, err
	}
	row.Name = name
	row.Color = color
	if err := r.db.WithContext(ctx).Save(&row).Error; err != nil {
		return Tag{}, err
	}
	return tagFromRow(row), nil
}

func (r *TagRepository) Delete(ctx context.Context, userID, tagID uint64) error {
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("tag_id = ?", tagID).Delete(&database.MailboxTagBindingRow{}).Error; err != nil {
			return err
		}
		return tx.Where("id = ? AND user_id = ?", tagID, userID).Delete(&database.MailboxTagRow{}).Error
	})
}

func (r *TagRepository) BindMailbox(ctx context.Context, mailboxID, tagID uint64) error {
	row := database.MailboxTagBindingRow{
		MailboxID: mailboxID,
		TagID:     tagID,
		CreatedAt: time.Now(),
	}
	return r.db.WithContext(ctx).
		Where("mailbox_id = ? AND tag_id = ?", mailboxID, tagID).
		FirstOrCreate(&row).Error
}

func (r *TagRepository) UnbindMailbox(ctx context.Context, mailboxID, tagID uint64) error {
	return r.db.WithContext(ctx).
		Where("mailbox_id = ? AND tag_id = ?", mailboxID, tagID).
		Delete(&database.MailboxTagBindingRow{}).Error
}

func (r *TagRepository) ListBindings(ctx context.Context, userID uint64) ([]TagBinding, error) {
	var rows []database.MailboxTagBindingRow
	if err := r.db.WithContext(ctx).
		Joins("JOIN mailbox_tags ON mailbox_tags.id = mailbox_tag_bindings.tag_id").
		Where("mailbox_tags.user_id = ?", userID).
		Find(&rows).Error; err != nil {
		return nil, err
	}
	bindings := make([]TagBinding, len(rows))
	for i, row := range rows {
		bindings[i] = TagBinding{MailboxID: row.MailboxID, TagID: row.TagID}
	}
	return bindings, nil
}

func tagFromRow(row database.MailboxTagRow) Tag {
	return Tag{
		ID:        row.ID,
		UserID:    row.UserID,
		Name:      row.Name,
		Color:     row.Color,
		CreatedAt: row.CreatedAt.Format(time.RFC3339),
	}
}
