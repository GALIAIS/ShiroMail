package message

import (
	"context"

	"shiro-email/backend/internal/modules/ingest"
)

type Repository interface {
	UpsertFromLegacySync(ctx context.Context, mailboxID uint64, mailboxName string, parsed ingest.ParsedMessage) error
	StoreInbound(ctx context.Context, mailboxID uint64, item ingest.StoredInboundMessage) error
	ListSummaryByMailboxID(ctx context.Context, mailboxID uint64) ([]Summary, error)
	SearchSummaryByMailboxID(ctx context.Context, mailboxID uint64, query string) ([]Summary, error)
	ListByMailboxID(ctx context.Context, mailboxID uint64) ([]Message, error)
	SearchByMailboxID(ctx context.Context, mailboxID uint64, query string) ([]Message, error)
	GetByMailboxAndID(ctx context.Context, mailboxID uint64, messageID uint64) (Message, error)
	SoftDeleteByMailboxIDs(ctx context.Context, mailboxIDs []uint64) error
	CountToday(ctx context.Context) int
	CountDailyRange(ctx context.Context, days int) ([]DailyCount, error)
	CountDailyRangeByUser(ctx context.Context, userID uint64, days int) ([]DailyCount, error)
	CountUnreadByMailboxIDs(ctx context.Context, mailboxIDs []uint64) (map[uint64]int, error)
	RecentByUser(ctx context.Context, userID uint64, limit int) ([]Summary, error)
	SearchByUser(ctx context.Context, userID uint64, query string, limit int) ([]Summary, error)
}

type DailyCount struct {
	Date  string `json:"date"`
	Count int    `json:"count"`
}

type MemoryRepository struct {
	*ingest.MemoryMessageRepository
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{MemoryMessageRepository: ingest.NewMemoryMessageRepository()}
}

func (r *MemoryRepository) ListSummaryByMailboxID(ctx context.Context, mailboxID uint64) ([]Summary, error) {
	items, err := r.ListByMailboxID(ctx, mailboxID)
	if err != nil {
		return nil, err
	}
	return summarizeMessages(items), nil
}

func (r *MemoryRepository) SearchSummaryByMailboxID(ctx context.Context, mailboxID uint64, query string) ([]Summary, error) {
	items, err := r.SearchByMailboxID(ctx, mailboxID, query)
	if err != nil {
		return nil, err
	}
	return summarizeMessages(items), nil
}

func (r *MemoryRepository) CountDailyRange(_ context.Context, days int) ([]DailyCount, error) {
	result := make([]DailyCount, days)
	for i := range result {
		result[i] = DailyCount{Date: "2006-01-01", Count: 0}
	}
	return result, nil
}

func (r *MemoryRepository) CountDailyRangeByUser(_ context.Context, _ uint64, days int) ([]DailyCount, error) {
	return r.CountDailyRange(nil, days)
}

func (r *MemoryRepository) CountUnreadByMailboxIDs(_ context.Context, _ []uint64) (map[uint64]int, error) {
	return map[uint64]int{}, nil
}

func (r *MemoryRepository) RecentByUser(_ context.Context, _ uint64, _ int) ([]Summary, error) {
	return nil, nil
}

func (r *MemoryRepository) SearchByUser(_ context.Context, _ uint64, _ string, _ int) ([]Summary, error) {
	return nil, nil
}
