package system

import (
	"context"
	"encoding/json"

	"gorm.io/gorm"

	"shiro-email/backend/internal/database"
)

type MySQLAuditRepository struct {
	db *gorm.DB
}

func NewMySQLAuditRepository(db *gorm.DB) *MySQLAuditRepository {
	return &MySQLAuditRepository{db: db}
}

func (r *MySQLAuditRepository) List(ctx context.Context) ([]AuditLog, error) {
	var rows []database.AuditLogRow
	if err := r.db.WithContext(ctx).Order("id DESC").Find(&rows).Error; err != nil {
		return nil, err
	}

	items := make([]AuditLog, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapAuditRow(row))
	}
	return items, nil
}

func (r *MySQLAuditRepository) ListPaginated(ctx context.Context, opts AuditListOptions) (AuditListResult, error) {
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

	query := r.db.WithContext(ctx).Model(&database.AuditLogRow{})
	if opts.Action != "" {
		query = query.Where("action = ?", opts.Action)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return AuditListResult{}, err
	}

	var rows []database.AuditLogRow
	offset := (page - 1) * size
	if err := query.Order("id DESC").Offset(offset).Limit(size).Find(&rows).Error; err != nil {
		return AuditListResult{}, err
	}

	items := make([]AuditLog, 0, len(rows))
	for _, row := range rows {
		items = append(items, mapAuditRow(row))
	}

	return AuditListResult{
		Items: items,
		Total: total,
		Page:  page,
		Size:  size,
	}, nil
}

func (r *MySQLAuditRepository) Create(ctx context.Context, actorID uint64, action string, resourceType string, resourceID string, detail map[string]any) (AuditLog, error) {
	body, err := json.Marshal(cloneMap(detail))
	if err != nil {
		return AuditLog{}, err
	}

	row := database.AuditLogRow{
		ActorUserID:  actorID,
		Action:       action,
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Detail:       body,
	}
	if err := r.db.WithContext(ctx).Create(&row).Error; err != nil {
		return AuditLog{}, err
	}
	return mapAuditRow(row), nil
}

func mapAuditRow(row database.AuditLogRow) AuditLog {
	detail := map[string]any{}
	_ = json.Unmarshal(row.Detail, &detail)
	return AuditLog{
		ID:           row.ID,
		ActorUserID:  row.ActorUserID,
		Action:       row.Action,
		ResourceType: row.ResourceType,
		ResourceID:   row.ResourceID,
		Detail:       detail,
		CreatedAt:    row.CreatedAt,
	}
}
