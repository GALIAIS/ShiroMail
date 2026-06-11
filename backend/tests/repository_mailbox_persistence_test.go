package tests

import (
	"context"
	"testing"
	"time"

	"shiro-email/backend/internal/modules/domain"
	"shiro-email/backend/internal/modules/mailbox"
)

func TestMySQLDomainRepositoryUpsertAndListActive(t *testing.T) {
	db := mustOpenTestMySQL(t)
	ctx := context.Background()

	mustResetPersistenceTables(t, db)
	mustEnsureSchema(t, db)

	repo := domain.NewMySQLRepository(db)

	if _, err := repo.Upsert(ctx, domain.Domain{
		Domain:    "mail.persist.test",
		Status:    "active",
		IsDefault: false,
		Weight:    80,
	}); err != nil {
		t.Fatalf("expected upsert success, got %v", err)
	}

	items, err := repo.ListActive(ctx)
	if err != nil {
		t.Fatalf("expected list success, got %v", err)
	}
	if len(items) != 1 || items[0].Domain != "mail.persist.test" {
		t.Fatalf("unexpected domains: %+v", items)
	}
}

func TestMySQLDomainRepositoryReturnsVisibilityAndPublicationStatus(t *testing.T) {
	db := mustOpenTestMySQL(t)
	ctx := context.Background()

	mustResetPersistenceTables(t, db)
	mustEnsureSchema(t, db)

	repo := domain.NewMySQLRepository(db)

	created, err := repo.Upsert(ctx, domain.Domain{
		Domain:            "pool.example.com",
		Status:            "active",
		Visibility:        "public_pool",
		PublicationStatus: "approved",
		VerificationScore: 88,
		HealthStatus:      "healthy",
		Weight:            90,
	})
	if err != nil {
		t.Fatalf("expected upsert success, got %v", err)
	}
	if created.Visibility != "public_pool" || created.PublicationStatus != "approved" {
		t.Fatalf("unexpected created domain: %+v", created)
	}

	found, err := repo.FindByDomain(ctx, "pool.example.com")
	if err != nil {
		t.Fatalf("expected find success, got %v", err)
	}
	if found.Visibility != "public_pool" || found.PublicationStatus != "approved" {
		t.Fatalf("unexpected found domain: %+v", found)
	}
}

func TestMySQLMailboxRepositoryCreateAndExpire(t *testing.T) {
	db := mustOpenTestMySQL(t)
	ctx := context.Background()

	mustResetPersistenceTables(t, db)
	mustEnsureSchema(t, db)
	userID := mustSeedUser(t, db, "mailbox-owner", "mailbox-owner@example.com", []string{"user"})
	domainID := mustSeedDomain(t, db, "mail.persist.test")

	repo := mailbox.NewMySQLRepository(db)
	created, err := repo.Create(ctx, mailbox.Mailbox{
		UserID:    userID,
		DomainID:  domainID,
		Domain:    "mail.persist.test",
		LocalPart: "alpha",
		Address:   "alpha@mail.persist.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(-1 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected create success, got %v", err)
	}

	expiredIDs, err := repo.ListExpiredIDs(ctx, time.Now())
	if err != nil {
		t.Fatalf("expected expired ids success, got %v", err)
	}
	if len(expiredIDs) != 1 || expiredIDs[0] != created.ID {
		t.Fatalf("unexpected expired ids: %v", expiredIDs)
	}
}

func TestMySQLMailboxRepositoryFindActiveByAddress(t *testing.T) {
	db := mustOpenTestMySQL(t)
	ctx := context.Background()

	mustResetPersistenceTables(t, db)
	mustEnsureSchema(t, db)
	userID := mustSeedUser(t, db, "lookup-owner", "lookup-owner@example.com", []string{"user"})
	domainID := mustSeedDomain(t, db, "lookup.persist.test")

	repo := mailbox.NewMySQLRepository(db)
	created, err := repo.Create(ctx, mailbox.Mailbox{
		UserID:    userID,
		DomainID:  domainID,
		Domain:    "lookup.persist.test",
		LocalPart: "alpha",
		Address:   "alpha@lookup.persist.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(6 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected create success, got %v", err)
	}

	found, err := repo.FindActiveByAddress(ctx, "alpha@lookup.persist.test")
	if err != nil {
		t.Fatalf("expected active mailbox lookup success, got %v", err)
	}
	if found.ID != created.ID {
		t.Fatalf("expected mailbox %d, got %d", created.ID, found.ID)
	}
}

func TestMySQLMailboxRepositoryPermanentMailboxIsActiveWithPastExpiresAt(t *testing.T) {
	db := mustOpenTestMySQL(t)
	ctx := context.Background()

	mustResetPersistenceTables(t, db)
	mustEnsureSchema(t, db)
	userID := mustSeedUser(t, db, "permanent-lookup-owner", "permanent-lookup-owner@example.com", []string{"user"})
	domainID := mustSeedDomain(t, db, "permanent-lookup.persist.test")

	repo := mailbox.NewMySQLRepository(db)
	created, err := repo.Create(ctx, mailbox.Mailbox{
		UserID:    userID,
		DomainID:  domainID,
		Domain:    "permanent-lookup.persist.test",
		LocalPart: "alpha",
		Address:   "alpha@permanent-lookup.persist.test",
		Status:    "active",
		Permanent: true,
		ExpiresAt: time.Now().Add(-6 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected create success, got %v", err)
	}

	found, err := repo.FindActiveByAddress(ctx, created.Address)
	if err != nil {
		t.Fatalf("expected permanent mailbox lookup success, got %v", err)
	}
	if found.ID != created.ID {
		t.Fatalf("expected mailbox %d, got %d", created.ID, found.ID)
	}

	expiredIDs, err := repo.ListExpiredIDs(ctx, time.Now())
	if err != nil {
		t.Fatalf("expected expired ids success, got %v", err)
	}
	if len(expiredIDs) != 0 {
		t.Fatalf("expected permanent mailbox to be excluded from expired ids, got %v", expiredIDs)
	}
}

func TestMySQLMailboxRepositoryFindActiveByAddressAcrossMultipleMailboxes(t *testing.T) {
	db := mustOpenTestMySQL(t)
	ctx := context.Background()

	mustResetPersistenceTables(t, db)
	mustEnsureSchema(t, db)
	userID := mustSeedUser(t, db, "multi-lookup-owner", "multi-lookup-owner@example.com", []string{"user"})
	domainID := mustSeedDomain(t, db, "multi-lookup.persist.test")

	repo := mailbox.NewMySQLRepository(db)
	first, err := repo.Create(ctx, mailbox.Mailbox{
		UserID:    userID,
		DomainID:  domainID,
		Domain:    "multi-lookup.persist.test",
		LocalPart: "alpha",
		Address:   "alpha@multi-lookup.persist.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(6 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected first mailbox create success, got %v", err)
	}
	second, err := repo.Create(ctx, mailbox.Mailbox{
		UserID:    userID,
		DomainID:  domainID,
		Domain:    "multi-lookup.persist.test",
		LocalPart: "beta",
		Address:   "beta@multi-lookup.persist.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(6 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected second mailbox create success, got %v", err)
	}

	firstFound, err := repo.FindActiveByAddress(ctx, first.Address)
	if err != nil {
		t.Fatalf("expected first mailbox lookup success, got %v", err)
	}
	if firstFound.ID != first.ID {
		t.Fatalf("expected first mailbox %d, got %d", first.ID, firstFound.ID)
	}

	secondFound, err := repo.FindActiveByAddress(ctx, second.Address)
	if err != nil {
		t.Fatalf("expected second mailbox lookup success, got %v", err)
	}
	if secondFound.ID != second.ID {
		t.Fatalf("expected second mailbox %d, got %d", second.ID, secondFound.ID)
	}
}
