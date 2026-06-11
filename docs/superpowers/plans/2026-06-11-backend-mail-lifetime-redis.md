# Backend Mail, Permanent Mailbox, and Redis Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the backend gaps behind three user issues: outbound mail support, permanent mailbox semantics, and Redis password support.

**Architecture:** Treat the three issues as separate backend tracks. Redis password is already supported in Go and only needs deployment hardening; permanent mailboxes already exist but need explicit repository/service semantics; outbound mail must be split into notification mail, inbound forwarding, and user-initiated sending because those are different risk levels.

**Tech Stack:** Go 1.24, Gin, Gorm, MySQL, Redis, Docker Compose, existing `system.mail.delivery` SMTP transport.

---

## Current Code Facts

### Redis Password

The backend already reads `REDIS_PASSWORD` in `backend/internal/config/config.go` and passes it into Redis in `backend/internal/bootstrap/app.go`. `backend/internal/database/redis.go` already sets `redis.Options.Password`.

Remaining gap: compose healthchecks and local dev Redis do not consistently authenticate when a password is configured.

### Permanent Mailbox

`backend/internal/modules/mailbox/model.go` already exposes `CreateMailboxRequest.Permanent`. `backend/internal/modules/mailbox/service.go` already skips TTL validation for permanent mailboxes and stores `9999-12-31 23:59:59 UTC`.

Remaining gap: repositories still define active/expired by `expires_at`, admin mailbox creation does not honor `Permanent`, and extension semantics for permanent mailboxes are not explicit.

### Send Email

System notification sending already exists in `backend/internal/modules/system/mail_delivery.go`, including SMTP modes `plain`, `starttls`, and `smtps`. Admin test endpoint exists at `POST /admin/configs/mail.delivery/test`. Auth verification emails call `system.SendMailDeliveryCode`.

Remaining gaps:
- Mailbox forwarding callback only logs; it does not actually send.
- User-initiated mailbox sending does not exist.
- DKIM does not affect receiving mail. It matters for outbound deliverability when this system sends as a domain.

## Issue Judgment

### 1. "Can it support sending email?"

Reasonable, but it must be split:

- System notification emails: already supported. No major backend feature needed.
- Mail forwarding: reasonable near-term backend fix because forwarding fields already exist on `mailboxes`.
- User-initiated send mail: reasonable but larger feature. Needs message model, API, queue, rate limits, audit, and deliverability design.

### 2. "Can it support permanent mailbox?"

Reasonable. Basic support already exists, but current implementation relies on a far-future `expires_at`. The backend should make `permanent = true` part of the actual active/expired predicates and expose the same behavior through admin flows.

### 3. "Can Redis support password?"

Reasonable, but backend code already supports it. Remaining work is deployment consistency and validation.

---

## File Structure

### Redis Password Hardening

- Modify: `docker-compose.yml`
  - Make Redis healthcheck authenticate when `REDIS_PASSWORD` is set.
- Modify: `docker-compose.dev.yml`
  - Add optional `REDIS_PASSWORD` environment and command parity with default compose.
  - Make dev healthcheck work with or without password.
- Optional modify: `.env.example`
  - Keep one clear `REDIS_PASSWORD` example and remove contradictory duplicate comments if desired.

### Permanent Mailbox Semantics

- Modify: `backend/internal/modules/mailbox/repository.go`
  - Update memory repository active/expired checks to respect `Permanent`.
- Modify: `backend/internal/modules/mailbox/mysql_repository.go`
  - Use `permanent = true OR expires_at > ?` for active queries.
  - Use `permanent = false AND expires_at <= ?` for expired queries.
- Modify: `backend/internal/modules/mailbox/service.go`
  - Add one helper for permanent expiration.
  - Make extending a permanent mailbox explicit and idempotent.
- Modify: `backend/internal/modules/admin/service.go`
  - Make admin mailbox creation honor `req.Permanent`.
  - Include `permanent` in admin mailbox DTOs where the frontend needs to render lifetime accurately.
- Test: `backend/internal/modules/mailbox/service_test.go`
- Test: `backend/internal/modules/mailbox/repository_lookup_test.go`
- Test: `backend/tests/repository_mailbox_persistence_test.go`
- Test: `backend/tests/mailbox_integration_test.go`

### Mail Forwarding

- Modify: `backend/internal/modules/system/mail_delivery.go`
  - Add exported raw SMTP send helper that reuses existing transport modes and diagnostics.
- Modify: `backend/internal/modules/system/mail_delivery_test.go`
  - Cover raw/forward send behavior and SMTP stage errors.
- Modify: `backend/internal/bootstrap/app.go`
  - Replace forwarding TODO with real send using `system.LoadMailDeliverySettings`.
  - Log structured success/failure.
- Optional create: `backend/internal/modules/system/mail_forwarding.go`
  - If `mail_delivery.go` becomes too broad, keep forwarding-specific MIME construction here.
- Test: `backend/tests/system_spool_integration_test.go`
  - Verify inbound delivery invokes forwarding sender without blocking local mailbox storage.

### User-Initiated Sending

This should be a later phase, not bundled into the small backend cleanup.

- Create migration: `backend/internal/database/migrations/000005_outbound_messages.sql`
- Create: `backend/internal/modules/outbound/model.go`
- Create: `backend/internal/modules/outbound/repository.go`
- Create: `backend/internal/modules/outbound/mysql_repository.go`
- Create: `backend/internal/modules/outbound/service.go`
- Create: `backend/internal/modules/outbound/controller.go`
- Modify: `backend/internal/bootstrap/app.go`
  - Register outbound repository, service, controller, and routes.
- Modify: `backend/internal/modules/system/config_keys.go`
  - Add outbound policy config only if policy cannot fit `mail.delivery`.
- Test: `backend/internal/modules/outbound/service_test.go`
- Test: `backend/tests/outbound_integration_test.go`

---

## Phase 0: Redis Password Deployment Fix

**Decision:** Backend code does not need a Redis password rewrite. Fix docker and document the expected env contract.

### Task 0.1: Default Compose Redis Healthcheck

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Replace unauthenticated Redis healthcheck**

Use shell form so the same healthcheck works with and without `REDIS_PASSWORD`:

```yaml
healthcheck:
  test:
    [
      "CMD-SHELL",
      "if [ -n \"$${REDIS_PASSWORD}\" ]; then redis-cli -a \"$${REDIS_PASSWORD}\" ping; else redis-cli ping; fi",
    ]
  interval: 10s
  timeout: 5s
  retries: 10
```

- [ ] **Step 2: Validate compose syntax**

Run:

```bash
docker compose -f docker-compose.yml config
```

Expected: command exits 0 and Redis service includes the authenticated healthcheck.

### Task 0.2: Dev Compose Password Parity

**Files:**
- Modify: `docker-compose.dev.yml`

- [ ] **Step 1: Add optional Redis password support**

Add this to the dev Redis service:

```yaml
command: >-
  sh -c 'if [ -n "$$REDIS_PASSWORD" ]; then exec redis-server --requirepass "$$REDIS_PASSWORD"; else exec redis-server; fi'
environment:
  REDIS_PASSWORD: ${REDIS_PASSWORD:-}
healthcheck:
  test:
    [
      "CMD-SHELL",
      "if [ -n \"$${REDIS_PASSWORD}\" ]; then redis-cli -a \"$${REDIS_PASSWORD}\" ping; else redis-cli ping; fi",
    ]
  interval: 5s
  timeout: 3s
  retries: 10
```

- [ ] **Step 2: Validate dev compose syntax**

Run:

```bash
docker compose -f docker-compose.dev.yml config
```

Expected: command exits 0.

---

## Phase 1: Permanent Mailbox Backend Semantics

**Decision:** Keep the existing `permanent` column and far-future `expires_at` for compatibility, but never rely on far-future time as the only permanent marker.

### Task 1.1: Add Shared Lifetime Helpers

**Files:**
- Modify: `backend/internal/modules/mailbox/service.go`

- [ ] **Step 1: Add helper functions near `ResolveLocalPart`**

```go
func PermanentExpiresAt() time.Time {
	return time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC)
}

func IsMailboxActiveAt(item Mailbox, now time.Time) bool {
	return item.Status == "active" && (item.Permanent || item.ExpiresAt.After(now))
}

func IsMailboxExpiredAt(item Mailbox, now time.Time) bool {
	return item.Status == "active" && !item.Permanent && !item.ExpiresAt.After(now)
}
```

- [ ] **Step 2: Replace direct permanent expiration construction**

In `CreateMailbox`, replace the inline `time.Date(9999, 12, 31, 23, 59, 59, 0, time.UTC)` with:

```go
expiresAt = PermanentExpiresAt()
```

### Task 1.2: Harden Memory Repository

**Files:**
- Modify: `backend/internal/modules/mailbox/repository.go`
- Test: `backend/internal/modules/mailbox/repository_lookup_test.go`

- [ ] **Step 1: Write failing tests**

Add tests that prove a permanent mailbox is active even if `expires_at` is accidentally old, and that cleanup excludes permanent mailboxes:

```go
func TestMemoryRepositoryPermanentMailboxIsActiveEvenWithPastExpiresAt(t *testing.T) {
	ctx := context.Background()
	repo := NewMemoryRepository()
	created, err := repo.Create(ctx, Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "permanent",
		Address:   "permanent@example.test",
		Status:    "active",
		Permanent: true,
		ExpiresAt: time.Now().Add(-time.Hour),
	})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}

	found, err := repo.FindActiveByAddress(ctx, created.Address)
	if err != nil {
		t.Fatalf("find active permanent mailbox: %v", err)
	}
	if found.ID != created.ID {
		t.Fatalf("expected mailbox %d, got %d", created.ID, found.ID)
	}
}

func TestMemoryRepositoryListExpiredIDsSkipsPermanentMailbox(t *testing.T) {
	ctx := context.Background()
	repo := NewMemoryRepository()
	if _, err := repo.Create(ctx, Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "permanent",
		Address:   "permanent@example.test",
		Status:    "active",
		Permanent: true,
		ExpiresAt: time.Now().Add(-time.Hour),
	}); err != nil {
		t.Fatalf("create mailbox: %v", err)
	}

	ids, err := repo.ListExpiredIDs(ctx, time.Now())
	if err != nil {
		t.Fatalf("list expired ids: %v", err)
	}
	if len(ids) != 0 {
		t.Fatalf("expected no expired permanent mailboxes, got %v", ids)
	}
}
```

- [ ] **Step 2: Replace active/expired conditions**

Use:

```go
if IsMailboxActiveAt(item, now) {
```

and:

```go
if IsMailboxExpiredAt(item, now) {
```

in `CountActive`, `ListActive`, `FindActiveByAddress`, and `ListExpiredIDs`.

- [ ] **Step 3: Run focused tests**

Run:

```bash
go test ./internal/modules/mailbox -run 'TestMemoryRepository.*Permanent|TestMemoryRepositoryFindActiveByAddress' -count=1
```

Expected: PASS.

### Task 1.3: Harden MySQL Repository

**Files:**
- Modify: `backend/internal/modules/mailbox/mysql_repository.go`
- Test: `backend/tests/repository_mailbox_persistence_test.go`

- [ ] **Step 1: Write failing persistence tests**

Add a persistence test that inserts `Permanent: true` with a past `ExpiresAt`, then asserts it is returned by `FindActiveByAddress` and not returned by `ListExpiredIDs`.

- [ ] **Step 2: Update query predicates**

Use this predicate for active records:

```sql
mailboxes.status = ? AND (mailboxes.permanent = ? OR mailboxes.expires_at > ?)
```

with args:

```go
"active", true, time.Now()
```

Use this predicate for expired records:

```sql
status = ? AND permanent = ? AND expires_at <= ?
```

with args:

```go
"active", false, now
```

Apply the active predicate to `CountActive`, `ListActive`, and `FindActiveByAddress`.

- [ ] **Step 3: Run persistence tests**

Run:

```bash
go test ./tests -run 'TestMySQLMailboxRepository.*Permanent|TestMySQLMailboxRepositoryFindActiveByAddress|TestMySQLMailboxRepositoryListExpired' -count=1
```

Expected: PASS when MySQL test dependencies are available.

### Task 1.4: Admin Mailbox Creation Parity

**Files:**
- Modify: `backend/internal/modules/admin/service.go`
- Test: `backend/tests/admin_integration_test.go`

- [ ] **Step 1: Update admin validation**

Change:

```go
if req.ExpiresInHours <= 0 {
	return mailbox.Mailbox{}, mailbox.ErrInvalidMailboxTTL
}
```

to:

```go
if !req.Permanent && req.ExpiresInHours <= 0 {
	return mailbox.Mailbox{}, mailbox.ErrInvalidMailboxTTL
}
```

- [ ] **Step 2: Set permanent fields on created mailbox**

Before constructing `mailbox.Mailbox`, compute:

```go
expiresAt := time.Now().Add(time.Duration(req.ExpiresInHours) * time.Hour)
if req.Permanent {
	expiresAt = mailbox.PermanentExpiresAt()
}
```

Then set:

```go
Permanent: req.Permanent,
ExpiresAt: expiresAt,
RetentionDays: req.RetentionDays,
```

- [ ] **Step 3: Include permanent in audit detail**

Add:

```go
"permanent": req.Permanent,
```

to the `admin.mailbox.create` audit detail.

- [ ] **Step 4: Run admin tests**

Run:

```bash
go test ./tests -run 'TestAdmin.*Mailbox' -count=1
```

Expected: PASS.

### Task 1.5: Explicit Permanent Extension Behavior

**Files:**
- Modify: `backend/internal/modules/mailbox/service.go`
- Modify: `backend/internal/modules/admin/service.go`
- Test: `backend/internal/modules/mailbox/service_test.go`
- Test: `backend/tests/admin_integration_test.go`

- [ ] **Step 1: Make user extension idempotent for permanent mailboxes**

After loading the mailbox and passing authorization, add:

```go
if item.Permanent {
	item.Status = "active"
	item.ExpiresAt = PermanentExpiresAt()
	item.UpdatedAt = time.Now()
	updated, err := s.repo.Update(ctx, item)
	if err == nil {
		s.invalidateCaches(ctx, userID)
	}
	return updated, err
}
```

- [ ] **Step 2: Make admin extension idempotent for permanent mailboxes**

After loading the mailbox:

```go
if item.Permanent {
	item.Status = "active"
	item.ExpiresAt = mailbox.PermanentExpiresAt()
	item.UpdatedAt = time.Now()
	updated, err := s.mailboxRepo.Update(ctx, item)
	if err != nil {
		return mailbox.Mailbox{}, err
	}
	s.invalidateMailboxCaches(ctx, updated.UserID)
	_, _ = s.auditRepo.Create(ctx, actorID, "admin.mailbox.extend", "mailbox", strconv.FormatUint(updated.ID, 10), map[string]any{
		"userId": updated.UserID,
		"address": updated.Address,
		"expiresAt": updated.ExpiresAt,
		"permanent": true,
		"status": updated.Status,
	})
	return updated, nil
}
```

- [ ] **Step 3: Run mailbox service tests**

Run:

```bash
go test ./internal/modules/mailbox -run 'Test.*Permanent|Test.*Extend' -count=1
```

Expected: PASS.

---

## Phase 2: Real Mail Forwarding

**Decision:** Implement forwarding as "send through configured SMTP delivery channel" and do not block inbound mailbox storage when forwarding fails. Forwarding failure should be logged and observable.

### Task 2.1: Export Raw SMTP Delivery Helper

**Files:**
- Modify: `backend/internal/modules/system/mail_delivery.go`
- Test: `backend/internal/modules/system/mail_delivery_test.go`

- [ ] **Step 1: Add helper function**

Add an exported function:

```go
func SendMailDeliveryRaw(settings MailDeliveryConfig, envelopeFrom string, recipients []string, rawBody []byte) error {
	if err := ValidateMailDeliverySettings(settings); err != nil {
		return err
	}
	cleanRecipients := make([]string, 0, len(recipients))
	for _, recipient := range recipients {
		trimmed := strings.TrimSpace(recipient)
		if trimmed != "" {
			cleanRecipients = append(cleanRecipients, trimmed)
		}
	}
	if len(cleanRecipients) == 0 {
		return fmt.Errorf("mail delivery recipient is required")
	}
	from := strings.TrimSpace(envelopeFrom)
	if from == "" {
		from = settings.FromAddress
	}
	addr := fmt.Sprintf("%s:%d", settings.Host, settings.Port)
	return sendMailDeliveryWithTransportRecipients(settings, addr, from, cleanRecipients, rawBody)
}
```

- [ ] **Step 2: Generalize transport helper**

Keep current single-recipient behavior by making `sendMailDeliveryWithTransport` call a multi-recipient helper:

```go
func sendMailDeliveryWithTransport(settings MailDeliveryConfig, addr string, recipient string, body []byte) error {
	return sendMailDeliveryWithTransportRecipients(settings, addr, settings.FromAddress, []string{recipient}, body)
}
```

The multi-recipient helper must use `client.Mail(envelopeFrom)` and call `client.Rcpt(recipient)` for every recipient.

- [ ] **Step 3: Add tests**

Cover:
- Plain SMTP uses provided envelope sender.
- Multiple recipients call RCPT for each recipient.
- Recipient validation rejects empty recipient list.

- [ ] **Step 4: Run tests**

Run:

```bash
go test ./internal/modules/system -run 'TestSendMailDelivery.*Raw|TestSendMailDeliveryWith' -count=1
```

Expected: PASS.

### Task 2.2: Build Forwarded Message Body

**Files:**
- Modify: `backend/internal/modules/system/mail_delivery.go`
- Optional create: `backend/internal/modules/system/mail_forwarding.go`
- Test: `backend/internal/modules/system/mail_delivery_test.go`

- [ ] **Step 1: Add forwarding MIME builder**

The forwarded message must avoid sending unauthenticated mail as the original sender. Use configured `FromAddress`, put the original mailbox in text, and attach the original raw message as `message/rfc822`.

Function signature:

```go
func BuildForwardedMailMessage(settings MailDeliveryConfig, mailboxAddress string, forwardTo string, subject string, rawBytes []byte) ([]byte, error)
```

Minimum headers:

```text
From: <configured sender>
To: <forwardTo>
Subject: Fwd: <subject>
Date: <now>
MIME-Version: 1.0
Content-Type: multipart/mixed; boundary="<boundary>"
```

Include one `text/plain; charset=UTF-8` part and one `message/rfc822` attachment part.

- [ ] **Step 2: Add MIME builder tests**

Assert generated body contains:
- `Subject: Fwd:`
- `Content-Type: message/rfc822`
- original raw bytes
- configured sender, not original sender, in `From`

### Task 2.3: Wire Forwarding Callback

**Files:**
- Modify: `backend/internal/bootstrap/app.go`

- [ ] **Step 1: Replace forwarding TODO**

Use:

```go
state.DirectIngest.SetForwardingCallback(func(ctx context.Context, mailboxAddress string, forwardTo string, subject string, rawBytes []byte) {
	settings, err := system.LoadMailDeliverySettings(ctx, state.ConfigRepo)
	if err != nil {
		slog.Error("load mail delivery settings for forwarding failed", "error", err, "from_mailbox", mailboxAddress, "forward_to", forwardTo)
		return
	}
	body, err := system.BuildForwardedMailMessage(settings, mailboxAddress, forwardTo, subject, rawBytes)
	if err != nil {
		slog.Error("build forwarded mail failed", "error", err, "from_mailbox", mailboxAddress, "forward_to", forwardTo)
		return
	}
	if err := system.SendMailDeliveryRaw(settings, settings.FromAddress, []string{forwardTo}, body); err != nil {
		diagnostic := system.DiagnoseMailDeliveryError(err)
		slog.Error("forwarding message failed",
			"error", err,
			"stage", diagnostic.Stage,
			"code", diagnostic.Code,
			"from_mailbox", mailboxAddress,
			"forward_to", forwardTo,
			"subject", subject,
			"size_bytes", len(rawBytes),
		)
		return
	}
	slog.Info("forwarding message sent",
		"from_mailbox", mailboxAddress,
		"forward_to", forwardTo,
		"subject", subject,
		"size_bytes", len(rawBytes),
	)
})
```

- [ ] **Step 2: Run bootstrap tests**

Run:

```bash
go test ./internal/bootstrap -run 'Test.*Forward|Test.*Runtime|Test.*SMTP' -count=1
```

Expected: PASS.

### Task 2.4: Decide Failure Persistence

**Files:**
- Modify only if needed: `backend/internal/modules/system/mysql_job_repository.go`
- Modify only if needed: `backend/internal/modules/system/model.go`

Recommended first version: logs only, no retry queue. Reason: forwarding is secondary to inbound receipt, and introducing retry semantics needs a separate queue contract. If product requires retry, implement `outbound_jobs` together with Phase 3.

---

## Phase 3: User-Initiated Send Mail

**Decision:** This is a new product capability, not a patch. It needs a queue and policy layer before exposing an API.

### Task 3.1: Add Outbound Message Persistence

**Files:**
- Create: `backend/internal/database/migrations/000005_outbound_messages.sql`
- Create: `backend/internal/modules/outbound/model.go`

- [ ] **Step 1: Add migration**

```sql
CREATE TABLE IF NOT EXISTS outbound_messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  mailbox_id BIGINT UNSIGNED NOT NULL,
  from_addr VARCHAR(320) NOT NULL,
  to_addrs JSON NOT NULL,
  cc_addrs JSON NULL,
  bcc_addrs JSON NULL,
  subject VARCHAR(998) NOT NULL,
  text_body MEDIUMTEXT NULL,
  html_body MEDIUMTEXT NULL,
  raw_message MEDIUMBLOB NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'queued',
  error_message TEXT NULL,
  attempt_count INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NULL,
  sent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  INDEX idx_outbound_user_created (user_id, created_at),
  INDEX idx_outbound_mailbox_created (mailbox_id, created_at),
  INDEX idx_outbound_status_next_attempt (status, next_attempt_at)
);
```

- [ ] **Step 2: Add model**

Define `OutboundMessage`, `CreateOutboundMessageRequest`, and `OutboundSendResult` with `queued`, `sending`, `sent`, and `failed` statuses.

### Task 3.2: Add Service Policy

**Files:**
- Create: `backend/internal/modules/outbound/service.go`
- Test: `backend/internal/modules/outbound/service_test.go`

- [ ] **Step 1: Validate sender ownership**

The service must call mailbox repository and require:

```go
mailbox.UserID == userID
mailbox.Status == "active"
mailbox.Permanent || mailbox.ExpiresAt.After(time.Now())
```

- [ ] **Step 2: Validate recipients**

Rules:
- At least one `to` recipient.
- Total `to + cc + bcc` <= 20.
- Each address must parse with `net/mail.ParseAddress`.
- Subject max 255 runes for UI-created messages.

- [ ] **Step 3: Queue message**

Initial version should persist `status = queued`. Worker sends later.

### Task 3.3: Add Worker Send Loop

**Files:**
- Modify: `backend/internal/bootstrap/worker.go`
- Create: `backend/internal/jobs/send_outbound.go`

- [ ] **Step 1: Select queued messages**

Select `status = queued` or retryable `failed` with `next_attempt_at <= now`.

- [ ] **Step 2: Send through configured SMTP**

Use `system.SendMailDeliveryRaw` with a composed MIME body. First version can use `settings.FromAddress` as envelope sender unless domain-aligned DKIM/SPF support is added.

- [ ] **Step 3: Update status**

On success: `sent`.

On failure: increment attempt count. Retry up to 3 times with backoff `1m`, `5m`, `30m`, then mark `failed`.

### Task 3.4: Add API Routes

**Files:**
- Create: `backend/internal/modules/outbound/controller.go`
- Modify: `backend/internal/bootstrap/app.go`

- [ ] **Step 1: Add authenticated routes**

```go
authGroup.POST("/mailboxes/:mailboxId/send", outboundController.Create)
authGroup.GET("/mailboxes/:mailboxId/outbound", outboundController.ListByMailbox)
```

- [ ] **Step 2: Add integration tests**

Test:
- User can send from own active mailbox.
- User cannot send from another user's mailbox.
- Expired non-permanent mailbox is rejected.
- Permanent mailbox can send.

---

## DKIM Policy

Receiving mail does not require DKIM. The existing inbound SMTP flow should not block receipt based on whether DKIM is configured.

Outbound sending is different:

- If the app sends through a third-party SMTP provider, that provider usually handles DKIM for its own sending domain.
- If the app sends as the user's domain, SPF/DKIM/DMARC alignment becomes important for deliverability.
- Do not block Phase 2 forwarding on DKIM. Forward using the configured delivery sender to avoid pretending to be the original sender.
- For Phase 3 user sending, add DKIM signing only after the project decides whether Shiro Email is an outbound MTA or only an SMTP-client relay.

---

## Recommended Execution Order

1. Phase 0 Redis password deployment fix.
2. Phase 1 permanent mailbox semantic hardening and admin parity.
3. Phase 2 inbound forwarding through configured SMTP.
4. Phase 3 user-initiated outbound send as a separate feature.

This order keeps small correctness fixes separate from the larger mail-sending product surface.

## Verification Matrix

Run after Phase 0:

```bash
docker compose -f docker-compose.yml config
docker compose -f docker-compose.dev.yml config
```

Run after Phase 1:

```bash
go test ./internal/modules/mailbox -count=1
go test ./tests -run 'TestMySQLMailboxRepository|TestAdmin.*Mailbox|TestMailbox' -count=1
```

Run after Phase 2:

```bash
go test ./internal/modules/system -count=1
go test ./internal/bootstrap -count=1
go test ./tests -run 'Test.*Spool|Test.*Ingest|Test.*Forward' -count=1
```

Run after Phase 3:

```bash
go test ./internal/modules/outbound -count=1
go test ./tests -run 'TestOutbound|TestMailbox.*Send' -count=1
go test ./... -count=1
```

## Acceptance Criteria

- Redis starts healthy with empty `REDIS_PASSWORD` and with a non-empty password in default and dev compose.
- Permanent mailboxes remain active based on `permanent = true`, not only based on `expires_at = 9999-12-31`.
- Cleanup jobs never expire permanent mailboxes.
- Admin-created permanent mailboxes behave the same as user-created permanent mailboxes.
- Inbound forwarding sends through the configured SMTP delivery channel and never prevents the original inbound message from being stored.
- User-initiated send is not exposed until ownership checks, rate limits, persistence, retry behavior, and audit trail are implemented.

## Risks

- Forwarding raw inbound messages as the original sender can fail DMARC. Use configured sender and attach the original message instead.
- User-initiated sending can turn the service into an abuse target. Do not ship Phase 3 without rate limits and audit.
- Redis password changes require coordinated env updates for app, worker, and Redis service.
- MySQL tests depend on the local integration test environment; if unavailable, still run focused unit tests and compose syntax validation.
