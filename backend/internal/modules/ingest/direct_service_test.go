package ingest

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"shiro-email/backend/internal/modules/mailbox"
)

func TestDirectServiceDeliversInboundMailToMatchedMailbox(t *testing.T) {
	ctx := context.Background()
	mailboxes := mailbox.NewMemoryRepository()
	target, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "alpha",
		Address:   "alpha@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}

	messageStore := NewMemoryMessageRepository()
	storage, err := NewLocalFileStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create local file storage: %v", err)
	}

	service := NewDirectService(mailboxes, messageStore, storage)
	result, err := service.Deliver(ctx, InboundEnvelope{
		MailFrom:   "sender@example.com",
		Recipients: []string{"alpha@example.test"},
	}, strings.NewReader("From: sender@example.com\r\nTo: alpha@example.test\r\nSubject: Welcome\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=abc\r\n\r\n--abc\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nhello direct smtp\r\n--abc\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=\"note.txt\"\r\n\r\nattachment body\r\n--abc--\r\n"))
	if err != nil {
		t.Fatalf("deliver inbound message: %v", err)
	}
	if result.MailboxAddress != "alpha@example.test" {
		t.Fatalf("expected alpha@example.test, got %s", result.MailboxAddress)
	}
	if result.SourceKind != "smtp" {
		t.Fatalf("expected smtp source kind, got %s", result.SourceKind)
	}
	if result.RawStorageKey == "" {
		t.Fatal("expected raw storage key to be set")
	}
	if len(result.Attachments) != 1 {
		t.Fatalf("expected 1 stored attachment, got %d", len(result.Attachments))
	}

	items, err := messageStore.ListByMailboxID(ctx, target.ID)
	if err != nil {
		t.Fatalf("list stored messages: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 stored message, got %d", len(items))
	}
	if items[0].Subject != "Welcome" {
		t.Fatalf("expected Welcome subject, got %s", items[0].Subject)
	}
	if _, err := os.Stat(filepath.Join(storage.rootDir, filepath.FromSlash(result.RawStorageKey))); err != nil {
		t.Fatalf("expected raw message file to exist, got %v", err)
	}
	if _, err := os.Stat(filepath.Join(storage.rootDir, filepath.FromSlash(result.Attachments[0].StorageKey))); err != nil {
		t.Fatalf("expected attachment file to exist, got %v", err)
	}
}

func TestDirectServiceForwardingCallbackFailureDoesNotRollbackLocalDelivery(t *testing.T) {
	ctx := context.Background()
	mailboxes := mailbox.NewMemoryRepository()
	target, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "alpha",
		Address:   "alpha@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		ForwardTo: "forward@example.net",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}

	messageStore := NewMemoryMessageRepository()
	storage, err := NewLocalFileStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create local file storage: %v", err)
	}

	service := NewDirectService(mailboxes, messageStore, storage)
	forwardCalls := 0
	service.SetForwardingCallback(func(context.Context, string, string, string, []byte) error {
		forwardCalls++
		return errors.New("smtp unavailable")
	})

	_, err = service.Deliver(ctx, InboundEnvelope{
		MailFrom:   "sender@example.com",
		Recipients: []string{"alpha@example.test"},
	}, strings.NewReader("From: sender@example.com\r\nTo: alpha@example.test\r\nSubject: Forwarded\r\n\r\nbody"))
	if err != nil {
		t.Fatalf("deliver inbound message should not fail on forwarding error: %v", err)
	}
	if forwardCalls != 1 {
		t.Fatalf("expected forwarding callback once, got %d", forwardCalls)
	}

	items, err := messageStore.ListByMailboxID(ctx, target.ID)
	if err != nil {
		t.Fatalf("list stored messages: %v", err)
	}
	if len(items) != 1 || items[0].Subject != "Forwarded" {
		t.Fatalf("expected local delivery to remain stored, got %#v", items)
	}
}

func TestDirectServiceDeliversToMultipleMailboxesSequentially(t *testing.T) {
	ctx := context.Background()
	mailboxes := mailbox.NewMemoryRepository()
	first, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "alpha",
		Address:   "alpha@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create first mailbox: %v", err)
	}
	second, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "beta",
		Address:   "beta@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create second mailbox: %v", err)
	}

	messageStore := NewMemoryMessageRepository()
	storage, err := NewLocalFileStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create local file storage: %v", err)
	}

	service := NewDirectService(mailboxes, messageStore, storage)
	deliver := func(recipient string, subject string) {
		t.Helper()
		_, deliverErr := service.Deliver(ctx, InboundEnvelope{
			MailFrom:   "sender@example.com",
			Recipients: []string{recipient},
		}, strings.NewReader("From: sender@example.com\r\nTo: "+recipient+"\r\nSubject: "+subject+"\r\n\r\nbody"))
		if deliverErr != nil {
			t.Fatalf("deliver to %s: %v", recipient, deliverErr)
		}
	}

	deliver(first.Address, "first")
	deliver(second.Address, "second")

	firstItems, err := messageStore.ListByMailboxID(ctx, first.ID)
	if err != nil {
		t.Fatalf("list first mailbox messages: %v", err)
	}
	if len(firstItems) != 1 || firstItems[0].Subject != "first" {
		t.Fatalf("expected first mailbox to receive first message, got %#v", firstItems)
	}

	secondItems, err := messageStore.ListByMailboxID(ctx, second.ID)
	if err != nil {
		t.Fatalf("list second mailbox messages: %v", err)
	}
	if len(secondItems) != 1 || secondItems[0].Subject != "second" {
		t.Fatalf("expected second mailbox to receive second message, got %#v", secondItems)
	}
}

func TestDirectServiceDeliversSingleMessageToMultipleRecipients(t *testing.T) {
	ctx := context.Background()
	mailboxes := mailbox.NewMemoryRepository()
	first, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "alpha",
		Address:   "alpha@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create first mailbox: %v", err)
	}
	second, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    2,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "beta",
		Address:   "beta@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create second mailbox: %v", err)
	}

	messageStore := NewMemoryMessageRepository()
	storage, err := NewLocalFileStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create local file storage: %v", err)
	}

	service := NewDirectService(mailboxes, messageStore, storage)
	_, err = service.Deliver(ctx, InboundEnvelope{
		MailFrom:   "sender@example.com",
		Recipients: []string{first.Address, second.Address},
	}, strings.NewReader("From: sender@example.com\r\nTo: alpha@example.test, beta@example.test\r\nSubject: broadcast\r\n\r\nbody"))
	if err != nil {
		t.Fatalf("deliver to multiple recipients: %v", err)
	}

	firstItems, err := messageStore.ListByMailboxID(ctx, first.ID)
	if err != nil {
		t.Fatalf("list first mailbox messages: %v", err)
	}
	if len(firstItems) != 1 || firstItems[0].Subject != "broadcast" {
		t.Fatalf("expected first mailbox broadcast, got %#v", firstItems)
	}

	secondItems, err := messageStore.ListByMailboxID(ctx, second.ID)
	if err != nil {
		t.Fatalf("list second mailbox messages: %v", err)
	}
	if len(secondItems) != 1 || secondItems[0].Subject != "broadcast" {
		t.Fatalf("expected second mailbox broadcast, got %#v", secondItems)
	}
}

func TestBuildPreviewKeepsUTF8Boundary(t *testing.T) {
	body := strings.Repeat("测", 200)

	preview := buildPreview(body)

	if preview != strings.Repeat("测", 160) {
		t.Fatalf("expected 160 full runes, got %q", preview)
	}
	if !utf8.ValidString(preview) {
		t.Fatal("expected preview to remain valid utf-8")
	}
}

func TestDirectServiceRejectsAttachmentLargerThanInboundPolicy(t *testing.T) {
	ctx := context.Background()
	mailboxes := mailbox.NewMemoryRepository()
	target, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "alpha",
		Address:   "alpha@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}

	messageStore := NewMemoryMessageRepository()
	storage, err := NewLocalFileStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create local file storage: %v", err)
	}

	service := NewDirectService(mailboxes, messageStore, storage)
	service.SetInboundPolicyProvider(func(context.Context, []mailbox.Mailbox) (InboundPolicy, error) {
		return InboundPolicy{MaxAttachmentSizeBytes: 8}, nil
	})

	_, err = service.Deliver(ctx, InboundEnvelope{
		MailFrom:   "sender@example.com",
		Recipients: []string{target.Address},
	}, strings.NewReader("From: sender@example.com\r\nTo: alpha@example.test\r\nSubject: Too big\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=abc\r\n\r\n--abc\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nhello direct smtp\r\n--abc\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=\"note.txt\"\r\n\r\nattachment body\r\n--abc--\r\n"))
	if err == nil {
		t.Fatal("expected attachment policy rejection")
	}
	if !IsRejectionCode(err, RejectAttachmentTooLarge) {
		t.Fatalf("expected attachment-too-large rejection, got %v", err)
	}
}

func TestDirectServiceRejectsExecutableAttachmentWhenInboundPolicyRequiresIt(t *testing.T) {
	ctx := context.Background()
	mailboxes := mailbox.NewMemoryRepository()
	target, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "alpha",
		Address:   "alpha@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}

	messageStore := NewMemoryMessageRepository()
	storage, err := NewLocalFileStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create local file storage: %v", err)
	}

	service := NewDirectService(mailboxes, messageStore, storage)
	service.SetInboundPolicyProvider(func(context.Context, []mailbox.Mailbox) (InboundPolicy, error) {
		return InboundPolicy{RejectExecutableFiles: true}, nil
	})

	_, err = service.Deliver(ctx, InboundEnvelope{
		MailFrom:   "sender@example.com",
		Recipients: []string{target.Address},
	}, strings.NewReader("From: sender@example.com\r\nTo: alpha@example.test\r\nSubject: Executable\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=abc\r\n\r\n--abc\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nhello direct smtp\r\n--abc\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=\"run.exe\"\r\n\r\nMZbinary\r\n--abc--\r\n"))
	if err == nil {
		t.Fatal("expected executable attachment rejection")
	}
	if !IsRejectionCode(err, RejectExecutableAttachment) {
		t.Fatalf("expected executable-attachment rejection, got %v", err)
	}
}

func TestDirectServiceQueuesInboundWhenSpoolEnabled(t *testing.T) {
	ctx := context.Background()
	mailboxes := mailbox.NewMemoryRepository()
	target, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "queued",
		Address:   "queued@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}

	messageStore := NewMemoryMessageRepository()
	storage, err := NewLocalFileStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create local file storage: %v", err)
	}
	spool := NewMemorySpoolRepository()

	service := NewDirectService(mailboxes, messageStore, storage)
	service.SetSpoolRepository(spool)

	stored, err := service.Deliver(ctx, InboundEnvelope{
		MailFrom:   "sender@example.com",
		Recipients: []string{target.Address},
	}, strings.NewReader("From: sender@example.com\r\nTo: queued@example.test\r\nSubject: Queued\r\n\r\nqueued body"))
	if err != nil {
		t.Fatalf("queue inbound message: %v", err)
	}
	if stored.SourceKind != "smtp-spool" {
		t.Fatalf("expected smtp-spool source kind, got %s", stored.SourceKind)
	}

	items, err := messageStore.ListByMailboxID(ctx, target.ID)
	if err != nil {
		t.Fatalf("list messages: %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected no stored message before spool processing, got %d", len(items))
	}

	spoolItems, err := spool.List(ctx)
	if err != nil {
		t.Fatalf("list spool items: %v", err)
	}
	if len(spoolItems) != 1 {
		t.Fatalf("expected 1 spool item, got %d", len(spoolItems))
	}
	if spoolItems[0].Status != SpoolStatusPending {
		t.Fatalf("expected pending spool item, got %s", spoolItems[0].Status)
	}
}

func TestMemorySpoolRepositoryRequeuesBeforeFinalFailure(t *testing.T) {
	ctx := context.Background()
	repo := NewMemorySpoolRepository()

	item, err := repo.Enqueue(ctx, SpoolItem{
		MailFrom:   "sender@example.com",
		Recipients: []string{"queued@example.test"},
		RawMessage: []byte("raw"),
	})
	if err != nil {
		t.Fatalf("enqueue spool item: %v", err)
	}

	claimed, err := repo.ClaimNext(ctx)
	if err != nil {
		t.Fatalf("claim spool item: %v", err)
	}
	if claimed.AttemptCount != 1 {
		t.Fatalf("expected first attempt count 1, got %d", claimed.AttemptCount)
	}

	if err := repo.MarkFailed(ctx, item.ID, "temporary failure"); err != nil {
		t.Fatalf("mark failed: %v", err)
	}

	items, err := repo.List(ctx)
	if err != nil {
		t.Fatalf("list spool items: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 spool item, got %d", len(items))
	}
	if items[0].Status != SpoolStatusPending {
		t.Fatalf("expected requeued pending item, got %s", items[0].Status)
	}
	if items[0].NextAttemptAt.IsZero() {
		t.Fatal("expected next attempt time to be scheduled")
	}
	repo.items[0].AttemptCount = DefaultSpoolMaxTries
	if err := repo.MarkFailed(ctx, item.ID, "final failure"); err != nil {
		t.Fatalf("mark failed final: %v", err)
	}

	items, err = repo.List(ctx)
	if err != nil {
		t.Fatalf("list spool items final: %v", err)
	}
	if items[0].Status != SpoolStatusFailed {
		t.Fatalf("expected final failed status, got %s", items[0].Status)
	}
}

func TestMemorySpoolRepositoryRetryResetsFailedItem(t *testing.T) {
	ctx := context.Background()
	repo := NewMemorySpoolRepository()

	item, err := repo.Enqueue(ctx, SpoolItem{
		MailFrom:   "sender@example.com",
		Recipients: []string{"queued@example.test"},
		RawMessage: []byte("raw"),
	})
	if err != nil {
		t.Fatalf("enqueue spool item: %v", err)
	}

	repo.items[0].Status = SpoolStatusFailed
	repo.items[0].ErrorMessage = "final failure"
	repo.items[0].AttemptCount = DefaultSpoolMaxTries
	repo.items[0].ProcessedAt = ptrTime(time.Now().UTC())
	repo.items[0].NextAttemptAt = time.Time{}

	retried, err := repo.Retry(ctx, item.ID)
	if err != nil {
		t.Fatalf("retry spool item: %v", err)
	}
	if retried.Status != SpoolStatusPending {
		t.Fatalf("expected pending status after retry, got %s", retried.Status)
	}
	if retried.AttemptCount != 0 {
		t.Fatalf("expected attempt count reset to 0, got %d", retried.AttemptCount)
	}
	if retried.ErrorMessage != "" {
		t.Fatalf("expected error message cleared, got %q", retried.ErrorMessage)
	}
	if retried.ProcessedAt != nil {
		t.Fatal("expected processed time cleared after retry")
	}
	if retried.NextAttemptAt.IsZero() {
		t.Fatal("expected next attempt time to be reset")
	}
}

func ptrTime(value time.Time) *time.Time {
	return &value
}
