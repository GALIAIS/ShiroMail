package mailbox

import (
	"context"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"
)

var (
	ErrMailboxNotFound = errors.New("mailbox not found")
	ErrAddressConflict = errors.New("mailbox address already exists")
)

type Repository interface {
	Create(ctx context.Context, mailbox Mailbox) (Mailbox, error)
	CountActive(ctx context.Context) int
	ListActive(ctx context.Context) ([]Mailbox, error)
	ListAll(ctx context.Context) ([]Mailbox, error)
	DeleteByID(ctx context.Context, mailboxID uint64) error
	DeleteByUserID(ctx context.Context, userID uint64) ([]uint64, error)
	DeleteInactiveByDomainID(ctx context.Context, domainID uint64) ([]uint64, error)
	ListExpiredIDs(ctx context.Context, now time.Time) ([]uint64, error)
	ListByUserID(ctx context.Context, userID uint64) ([]Mailbox, error)
	FindByID(ctx context.Context, mailboxID uint64) (Mailbox, error)
	FindByUserAndID(ctx context.Context, userID uint64, mailboxID uint64) (Mailbox, error)
	FindActiveByAddress(ctx context.Context, address string) (Mailbox, error)
	MarkExpired(ctx context.Context, mailboxIDs []uint64) error
	Update(ctx context.Context, mailbox Mailbox) (Mailbox, error)
}

type MemoryRepository struct {
	mu            sync.RWMutex
	nextMailboxID uint64
	mailboxes     map[uint64]Mailbox
	addressIndex  map[string]uint64
}

func NewMemoryRepository() *MemoryRepository {
	return &MemoryRepository{
		nextMailboxID: 1,
		mailboxes:     map[uint64]Mailbox{},
		addressIndex:  map[string]uint64{},
	}
}

func (r *MemoryRepository) Create(_ context.Context, item Mailbox) (Mailbox, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.addressIndex[item.Address]; exists {
		return Mailbox{}, ErrAddressConflict
	}

	item.ID = r.nextMailboxID
	r.nextMailboxID++
	r.mailboxes[item.ID] = item
	r.addressIndex[item.Address] = item.ID
	return item, nil
}

func (r *MemoryRepository) ListByUserID(_ context.Context, userID uint64) ([]Mailbox, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	items := make([]Mailbox, 0)
	for _, item := range r.mailboxes {
		if item.UserID == userID {
			items = append(items, item)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].ID < items[j].ID
	})
	return items, nil
}

func (r *MemoryRepository) DeleteByUserID(_ context.Context, userID uint64) ([]uint64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	ids := make([]uint64, 0)
	for id, item := range r.mailboxes {
		if item.UserID != userID {
			continue
		}
		ids = append(ids, id)
		delete(r.addressIndex, item.Address)
		delete(r.mailboxes, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		return ids[i] < ids[j]
	})
	return ids, nil
}

func (r *MemoryRepository) DeleteByID(_ context.Context, mailboxID uint64) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	item, ok := r.mailboxes[mailboxID]
	if !ok {
		return ErrMailboxNotFound
	}

	delete(r.mailboxes, mailboxID)
	delete(r.addressIndex, item.Address)
	return nil
}

func (r *MemoryRepository) CountActive(_ context.Context) int {
	r.mu.RLock()
	defer r.mu.RUnlock()

	now := time.Now()
	count := 0
	for _, item := range r.mailboxes {
		if IsMailboxActiveAt(item, now) {
			count++
		}
	}
	return count
}

func (r *MemoryRepository) ListActive(_ context.Context) ([]Mailbox, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	now := time.Now()
	items := make([]Mailbox, 0)
	for _, item := range r.mailboxes {
		if IsMailboxActiveAt(item, now) {
			items = append(items, item)
		}
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].ID < items[j].ID
	})
	return items, nil
}

func (r *MemoryRepository) ListAll(_ context.Context) ([]Mailbox, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	items := make([]Mailbox, 0, len(r.mailboxes))
	for _, item := range r.mailboxes {
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool {
		return items[i].ID < items[j].ID
	})
	return items, nil
}

func (r *MemoryRepository) DeleteInactiveByDomainID(_ context.Context, domainID uint64) ([]uint64, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	deletedIDs := make([]uint64, 0)
	for id, item := range r.mailboxes {
		if item.DomainID != domainID || item.Status == "active" {
			continue
		}
		deletedIDs = append(deletedIDs, id)
		delete(r.mailboxes, id)
		delete(r.addressIndex, item.Address)
	}
	sort.Slice(deletedIDs, func(i, j int) bool {
		return deletedIDs[i] < deletedIDs[j]
	})
	return deletedIDs, nil
}

func (r *MemoryRepository) FindByUserAndID(_ context.Context, userID uint64, mailboxID uint64) (Mailbox, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	item, ok := r.mailboxes[mailboxID]
	if !ok || item.UserID != userID {
		return Mailbox{}, ErrMailboxNotFound
	}
	return item, nil
}

func (r *MemoryRepository) FindByID(_ context.Context, mailboxID uint64) (Mailbox, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	item, ok := r.mailboxes[mailboxID]
	if !ok {
		return Mailbox{}, ErrMailboxNotFound
	}
	return item, nil
}

func (r *MemoryRepository) FindActiveByAddress(_ context.Context, address string) (Mailbox, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	now := time.Now()
	needle := strings.TrimSpace(address)
	for _, item := range r.mailboxes {
		if !strings.EqualFold(item.Address, needle) {
			continue
		}
		if !IsMailboxActiveAt(item, now) {
			break
		}
		return item, nil
	}
	return Mailbox{}, ErrMailboxNotFound
}

func (r *MemoryRepository) ListExpiredIDs(_ context.Context, now time.Time) ([]uint64, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	ids := make([]uint64, 0)
	for _, item := range r.mailboxes {
		if IsMailboxExpiredAt(item, now) {
			ids = append(ids, item.ID)
		}
	}
	sort.Slice(ids, func(i, j int) bool {
		return ids[i] < ids[j]
	})
	return ids, nil
}

func (r *MemoryRepository) MarkExpired(_ context.Context, mailboxIDs []uint64) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if len(mailboxIDs) == 0 {
		return nil
	}
	targets := make(map[uint64]struct{}, len(mailboxIDs))
	for _, id := range mailboxIDs {
		targets[id] = struct{}{}
	}

	now := time.Now()
	for id, item := range r.mailboxes {
		if _, ok := targets[id]; ok {
			item.Status = "expired"
			item.UpdatedAt = now
			r.mailboxes[id] = item
		}
	}
	return nil
}

func (r *MemoryRepository) Update(_ context.Context, item Mailbox) (Mailbox, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	existing, ok := r.mailboxes[item.ID]
	if !ok || existing.UserID != item.UserID {
		return Mailbox{}, ErrMailboxNotFound
	}
	r.mailboxes[item.ID] = item
	return item, nil
}
