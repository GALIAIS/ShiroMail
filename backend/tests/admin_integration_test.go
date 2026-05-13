package tests

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"shiro-email/backend/internal/bootstrap"
	"shiro-email/backend/internal/config"
	"shiro-email/backend/internal/modules/admin"
	"shiro-email/backend/internal/modules/auth"
	"shiro-email/backend/internal/modules/domain"
	"shiro-email/backend/internal/modules/ingest"
	"shiro-email/backend/internal/modules/mailbox"
	"shiro-email/backend/internal/shared/security"
)

func TestAdminOverview(t *testing.T) {
	server, token, state := newAdminServer(t)

	activeMailbox, err := state.MailboxRepo.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "shiro.local",
		LocalPart: "ops",
		Address:   "ops@shiro.local",
		Status:    "active",
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected active mailbox fixture, got %v", err)
	}

	if err := state.MessageRepo.UpsertFromLegacySync(context.Background(), activeMailbox.ID, activeMailbox.LocalPart, ingest.ParsedMessage{
		LegacyMailboxKey: activeMailbox.LocalPart,
		LegacyMessageKey: "admin-overview-1",
		FromAddr:         "ops@example.com",
		ToAddr:           activeMailbox.Address,
		Subject:          "Overview Seed",
		TextPreview:      "overview-seed",
		ReceivedAt:       time.Now(),
	}); err != nil {
		t.Fatalf("expected overview message seed, got %v", err)
	}

	if _, err := state.JobRepo.Create(context.Background(), "mail_ingest_listener", "failed", "network timeout"); err != nil {
		t.Fatalf("expected failed job fixture, got %v", err)
	}

	rr := performJSON(server, http.MethodGet, "/api/v1/admin/overview", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"activeMailboxCount":1`) {
		t.Fatalf("expected active mailbox count in overview: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"todayMessageCount":1`) {
		t.Fatalf("expected today message count in overview: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"failedJobCount":1`) {
		t.Fatalf("expected failed job count in overview: %s", rr.Body.String())
	}
}

func TestAdminCanUpdateUserRoles(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPut, "/api/v1/admin/users/1/roles", `{"roles":["user","admin"]}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on user role update, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"id":1`) {
		t.Fatalf("expected user id in update response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"roles":["admin","user"]`) && !strings.Contains(rr.Body.String(), `"roles":["user","admin"]`) {
		t.Fatalf("expected updated roles in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/users", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin user list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"username":"alice"`) {
		t.Fatalf("expected alice in user list: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"roles":["admin","user"]`) && !strings.Contains(rr.Body.String(), `"roles":["user","admin"]`) {
		t.Fatalf("expected updated roles in user list: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.user.roles.update`) {
		t.Fatalf("expected user role audit entry: %s", rr.Body.String())
	}
}

func TestAdminCanUpdateUserProfile(t *testing.T) {
	server, token, _ := newAdminServer(t)

	body := `{"username":"alice-updated","email":"alice-updated@shiro.local","status":"active","emailVerified":true,"roles":["admin","user"],"newPassword":"BetterSecret123!"}`
	rr := performJSON(server, http.MethodPut, "/api/v1/admin/users/1", body, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on user update, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"username":"alice-updated"`) {
		t.Fatalf("expected updated username in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"email":"alice-updated@shiro.local"`) {
		t.Fatalf("expected updated email in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"active"`) {
		t.Fatalf("expected updated status in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"emailVerified":true`) {
		t.Fatalf("expected updated verification state in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/auth/login", `{"login":"alice-updated@shiro.local","password":"BetterSecret123!"}`, "")
	if rr.Code != http.StatusOK {
		t.Fatalf("expected login with updated password to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.user.update`) {
		t.Fatalf("expected user update audit entry: %s", rr.Body.String())
	}
}

func TestAdminCanDeleteUserWithoutResources(t *testing.T) {
	server, token, state := newAdminServer(t)

	passwordHash, err := security.HashPassword("Secret123!")
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	created, err := state.AuthRepo.CreateUser(context.Background(), auth.User{
		Username:      "remove-me",
		Email:         "remove-me@shiro.local",
		PasswordHash:  passwordHash,
		Status:        "active",
		EmailVerified: true,
		Roles:         []string{"user"},
	})
	if err != nil {
		t.Fatalf("create removable user: %v", err)
	}

	rr := performJSON(server, http.MethodDelete, "/api/v1/admin/users/"+strconv.FormatUint(created.ID, 10), "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on user delete, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/users", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin users list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"username":"remove-me"`) {
		t.Fatalf("expected deleted user to disappear from list: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.user.delete`) {
		t.Fatalf("expected user delete audit entry: %s", rr.Body.String())
	}
}

func TestAdminRejectsDeletingUserWithMailboxes(t *testing.T) {
	server, token, state := newAdminServer(t)

	_, err := state.MailboxRepo.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "shiro.local",
		LocalPart: "guarded-user",
		Address:   "guarded-user@shiro.local",
		Status:    "active",
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create mailbox fixture: %v", err)
	}

	mailboxes, err := state.MailboxRepo.ListByUserID(context.Background(), 1)
	if err != nil {
		t.Fatalf("list mailbox fixture: %v", err)
	}
	if len(mailboxes) == 0 {
		t.Fatalf("expected mailbox fixture for user 1")
	}

	rr := performJSON(server, http.MethodDelete, "/api/v1/admin/users/1", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 when deleting user with mailboxes, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/users", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin users list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"id":1`) {
		t.Fatalf("expected deleted user to disappear from list: %s", rr.Body.String())
	}
}

func TestAdminDomainMutation(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"mail.sandbox.test","status":"active","isDefault":false,"weight":120}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on domain upsert, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domains", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on domain list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `mail.sandbox.test`) {
		t.Fatalf("expected created domain in response: %s", rr.Body.String())
	}
}

func TestAdminDomainProviderMutationAndBinding(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"Primary Cloudflare","authType":"api_token","status":"healthy","secretRef":"cf-token","capabilities":["zones.read","dns.write"]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 on provider create, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"hasSecret":true`) {
		t.Fatalf("expected provider response to report secret presence: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"provider-bound.test","status":"active","visibility":"private","publicationStatus":"draft","healthStatus":"healthy","providerAccountId":1,"isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on domain upsert with provider binding, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domain-providers", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on provider list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"displayName":"Primary Cloudflare"`) {
		t.Fatalf("expected provider display name in list: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"hasSecret":true`) {
		t.Fatalf("expected provider list to include hasSecret: %s", rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `cf-token`) {
		t.Fatalf("expected provider list to hide raw secret refs: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domains", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on domain list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"providerDisplayName":"Primary Cloudflare"`) {
		t.Fatalf("expected provider binding in domain list: %s", rr.Body.String())
	}
}

func TestAdminDomainAndDNSViewsExcludeUserOwnedAssets(t *testing.T) {
	server, token, state := newAdminServer(t)

	userID := uint64(1)
	provider, err := state.DomainRepo.CreateProviderAccount(context.Background(), domain.ProviderAccount{
		Provider:     "cloudflare",
		OwnerType:    "user",
		OwnerUserID:  &userID,
		DisplayName:  "Alice Private Cloudflare",
		AuthType:     "api_token",
		SecretRef:    "user-secret",
		Status:       "healthy",
		Capabilities: []string{"zones.read", "dns.write"},
	})
	if err != nil {
		t.Fatalf("expected user-owned provider fixture, got %v", err)
	}

	_, err = state.DomainRepo.Upsert(context.Background(), domain.Domain{
		Domain:            "alice-private.test",
		Status:            "active",
		OwnerUserID:       &userID,
		Visibility:        "private",
		PublicationStatus: "draft",
		HealthStatus:      "healthy",
		ProviderAccountID: &provider.ID,
		Weight:            100,
	})
	if err != nil {
		t.Fatalf("expected user-owned domain fixture, got %v", err)
	}

	rr := performJSON(server, http.MethodGet, "/api/v1/admin/domain-providers", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin provider list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "Alice Private Cloudflare") {
		t.Fatalf("expected admin provider list to hide user-owned providers: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domains", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin domain list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), "alice-private.test") {
		t.Fatalf("expected admin domain list to hide user-owned domains: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domain-providers/"+strconv.FormatUint(provider.ID, 10)+"/zones", "", token)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when admin opens user-owned provider zones, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestAdminCanDeleteUnusedDomain(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"delete-me.test","status":"active","isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on domain upsert, got %d: %s", rr.Code, rr.Body.String())
	}

	var created struct {
		ID     uint64 `json:"id"`
		Domain string `json:"domain"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("expected domain response json, got %v: %s", err, rr.Body.String())
	}
	if created.ID == 0 {
		t.Fatalf("expected created domain id, got %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/domains/"+strconv.FormatUint(created.ID, 10), "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on domain delete, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domains", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on domain list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"domain":"delete-me.test"`) {
		t.Fatalf("expected deleted domain to be removed from list: %s", rr.Body.String())
	}
}

func TestAdminCanDeleteDomainWithUnusedSubdomains(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"parent-delete.test","status":"active","isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected root domain create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var root struct {
		ID uint64 `json:"id"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &root); err != nil {
		t.Fatalf("expected root domain response json, got %v: %s", err, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"mx.parent-delete.test","status":"active","isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected child domain create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/domains/"+strconv.FormatUint(root.ID, 10), "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 when deleting root domain with only unused subdomains, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domains", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on domain list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"domain":"parent-delete.test"`) || strings.Contains(rr.Body.String(), `"domain":"mx.parent-delete.test"`) {
		t.Fatalf("expected root and child domains to be removed together: %s", rr.Body.String())
	}
}

func TestAdminRejectsDeletingDomainWithSubdomainMailboxes(t *testing.T) {
	server, token, state := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"parent-mailbox-delete.test","status":"active","isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected root domain create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var root struct {
		ID uint64 `json:"id"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &root); err != nil {
		t.Fatalf("expected root domain response json, got %v: %s", err, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"mx.parent-mailbox-delete.test","status":"active","isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected child domain create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var child struct {
		ID     uint64 `json:"id"`
		Domain string `json:"domain"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &child); err != nil {
		t.Fatalf("expected child domain response json, got %v: %s", err, rr.Body.String())
	}

	_, err := state.MailboxRepo.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  child.ID,
		Domain:    child.Domain,
		LocalPart: "ops",
		Address:   "ops@" + child.Domain,
		Status:    "active",
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected child mailbox fixture, got %v", err)
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/domains/"+strconv.FormatUint(root.ID, 10), "", token)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when deleting root domain with subdomain mailboxes, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), admin.ErrDomainHasMailboxes.Error()) {
		t.Fatalf("expected mailbox guard error for descendant mailbox, got %s", rr.Body.String())
	}
}

func TestAdminRejectsDeletingDomainWithMailboxes(t *testing.T) {
	server, token, state := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"mailbox-bound.test","status":"active","isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected domain create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var created struct {
		ID     uint64 `json:"id"`
		Domain string `json:"domain"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("expected domain response json, got %v: %s", err, rr.Body.String())
	}

	_, err := state.MailboxRepo.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  created.ID,
		Domain:    created.Domain,
		LocalPart: "in-use",
		Address:   "in-use@" + created.Domain,
		Status:    "active",
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected mailbox fixture for domain delete guard, got %v", err)
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/domains/"+strconv.FormatUint(created.ID, 10), "", token)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when deleting domain with mailboxes, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), admin.ErrDomainHasMailboxes.Error()) {
		t.Fatalf("expected mailbox guard error, got %s", rr.Body.String())
	}
}

func TestAdminCanDeleteDomainWithReleasedMailboxes(t *testing.T) {
	server, token, state := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"released-mailbox-domain.test","status":"active","isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected domain create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var created struct {
		ID     uint64 `json:"id"`
		Domain string `json:"domain"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("expected domain response json, got %v: %s", err, rr.Body.String())
	}

	_, err := state.MailboxRepo.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  created.ID,
		Domain:    created.Domain,
		LocalPart: "released-box",
		Address:   "released-box@" + created.Domain,
		Status:    "released",
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected released mailbox fixture for domain delete, got %v", err)
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/domains/"+strconv.FormatUint(created.ID, 10), "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 when deleting domain with only released mailboxes, got %d: %s", rr.Code, rr.Body.String())
	}
}

func TestAdminCanDeleteUnusedProviderAccount(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"Disposable Provider","authType":"api_token","status":"healthy","secretRef":"cf-token","capabilities":["zones.read"]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected provider create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var created struct {
		ID uint64 `json:"id"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("expected provider response json, got %v: %s", err, rr.Body.String())
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/domain-providers/"+strconv.FormatUint(created.ID, 10), "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on provider delete, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domain-providers", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on provider list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"displayName":"Disposable Provider"`) {
		t.Fatalf("expected deleted provider to be removed from list: %s", rr.Body.String())
	}
}

func TestAdminRejectsDeletingProviderAccountInUse(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"Bound Provider","authType":"api_token","status":"healthy","secretRef":"cf-token","capabilities":["zones.read"]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected provider create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var created struct {
		ID uint64 `json:"id"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &created); err != nil {
		t.Fatalf("expected provider response json, got %v: %s", err, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"bound-provider.test","status":"active","visibility":"private","publicationStatus":"draft","healthStatus":"healthy","providerAccountId":`+strconv.FormatUint(created.ID, 10)+`,"isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected provider-bound domain create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/domain-providers/"+strconv.FormatUint(created.ID, 10), "", token)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when deleting bound provider, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), admin.ErrProviderAccountInUse.Error()) {
		t.Fatalf("expected provider in-use guard error, got %s", rr.Body.String())
	}
}

func TestAdminCanUpdateUnusedProviderAccountCoreFields(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"Editable Provider","authType":"api_token","status":"healthy","secretRef":"cf-token","capabilities":["zones.read"]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected provider create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPut, "/api/v1/admin/domain-providers/1", `{"provider":"spaceship","ownerType":"platform","displayName":"Updated Spaceship","authType":"api_key","credentials":{"apiKey":"ship-key","apiSecret":"ship-secret"},"status":"pending","capabilities":["zones.read","dns.write"]}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected provider update to succeed, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"provider":"spaceship"`) {
		t.Fatalf("expected provider type to change for unused account: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"authType":"api_key"`) {
		t.Fatalf("expected auth type to change for unused account: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"displayName":"Updated Spaceship"`) {
		t.Fatalf("expected display name to update: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"pending"`) {
		t.Fatalf("expected status to update: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"capabilities":["zones.read","dns.write"]`) {
		t.Fatalf("expected capabilities to update: %s", rr.Body.String())
	}
}

func TestAdminRejectsChangingProviderOrAuthTypeWhenProviderBound(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"Bound Editable Provider","authType":"api_token","status":"healthy","secretRef":"cf-token","capabilities":["zones.read","dns.write"]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected provider create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domains", `{"domain":"provider-edit-lock.test","status":"active","visibility":"private","publicationStatus":"draft","healthStatus":"healthy","providerAccountId":1,"isDefault":false,"weight":100}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected provider-bound domain create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPut, "/api/v1/admin/domain-providers/1", `{"provider":"spaceship","ownerType":"platform","displayName":"Should Fail","authType":"api_key","credentials":{"apiKey":"ship-key","apiSecret":"ship-secret"},"status":"pending","capabilities":["zones.read"]}`, token)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when changing core fields on bound provider, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), admin.ErrProviderAccountImmutableFieldsLocked.Error()) {
		t.Fatalf("expected immutable field guard error, got %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodPut, "/api/v1/admin/domain-providers/1", `{"provider":"cloudflare","ownerType":"platform","displayName":"Still Bound But Editable","authType":"api_token","credentials":{"apiToken":"cf-token-2"},"status":"degraded","capabilities":["zones.read","dns.read","dns.write"]}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected bound provider to allow safe updates, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"displayName":"Still Bound But Editable"`) {
		t.Fatalf("expected safe field update to persist: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"degraded"`) {
		t.Fatalf("expected safe status update to persist: %s", rr.Body.String())
	}
}

func TestAdminCanValidateProviderAndListZones(t *testing.T) {
	cloudflareAPI := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/client/v4/user/tokens/verify":
			if got := request.Header.Get("Authorization"); got != "Bearer cf-token" {
				t.Fatalf("expected bearer token header, got %q", got)
			}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":{"status":"active"}}`))
		case "/client/v4/zones":
			if got := request.Header.Get("Authorization"); got != "Bearer cf-token" {
				t.Fatalf("expected bearer token header, got %q", got)
			}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":[{"id":"zone-1","name":"example.com","status":"active"}]}`))
		case "/client/v4/zones/zone-1/dns_records":
			if got := request.Header.Get("Authorization"); got != "Bearer cf-token" {
				t.Fatalf("expected bearer token header, got %q", got)
			}
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":[{"type":"MX","name":"example.com","content":"mx1.example.com","ttl":120,"priority":10,"proxied":false}]}`))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer cloudflareAPI.Close()

	t.Setenv("CLOUDFLARE_API_BASE_URL", cloudflareAPI.URL+"/client/v4")
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"Edge Cloudflare","authType":"api_token","status":"pending","secretRef":"cf-token","capabilities":[]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected provider create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers/1/validate", `{}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected provider validation to succeed, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"healthy"`) {
		t.Fatalf("expected provider to become healthy after validation: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"capabilities":["tokens.verify","zones.read","dns.read","dns.write"]`) {
		t.Fatalf("expected provider capabilities to be refreshed from adapter validation: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domain-providers/1/zones", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected provider zones list to succeed, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"name":"example.com"`) {
		t.Fatalf("expected zone inventory in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domain-providers/1/zones/zone-1/records", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected provider records list to succeed, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"type":"MX"`) || !strings.Contains(rr.Body.String(), `"value":"mx1.example.com"`) {
		t.Fatalf("expected provider record inventory in response: %s", rr.Body.String())
	}
}

func TestAdminCanPreviewAndApplyProviderDNSChangeSet(t *testing.T) {
	type providerWriteRequest struct {
		Method string
		Path   string
		Body   string
	}

	var (
		mu            sync.Mutex
		writeRequests []providerWriteRequest
	)

	cloudflareAPI := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch {
		case request.Method == http.MethodGet && request.URL.Path == "/client/v4/zones/zone-1/dns_records":
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":[{"id":"record-update","type":"TXT","name":"_dmarc.example.com","content":"v=DMARC1; p=none","ttl":120,"priority":0,"proxied":false},{"id":"record-delete","type":"MX","name":"example.com","content":"mx1.example.com","ttl":120,"priority":10,"proxied":false}]}`))
		case request.Method == http.MethodPost && request.URL.Path == "/client/v4/zones/zone-1/dns_records":
			payload, _ := io.ReadAll(request.Body)
			mu.Lock()
			writeRequests = append(writeRequests, providerWriteRequest{
				Method: request.Method,
				Path:   request.URL.Path,
				Body:   string(payload),
			})
			mu.Unlock()
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":{"id":"record-created"}}`))
		case request.Method == http.MethodPatch && request.URL.Path == "/client/v4/zones/zone-1/dns_records/record-update":
			payload, _ := io.ReadAll(request.Body)
			mu.Lock()
			writeRequests = append(writeRequests, providerWriteRequest{
				Method: request.Method,
				Path:   request.URL.Path,
				Body:   string(payload),
			})
			mu.Unlock()
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":{"id":"record-update"}}`))
		case request.Method == http.MethodDelete && request.URL.Path == "/client/v4/zones/zone-1/dns_records/record-delete":
			mu.Lock()
			writeRequests = append(writeRequests, providerWriteRequest{
				Method: request.Method,
				Path:   request.URL.Path,
			})
			mu.Unlock()
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":{"id":"record-delete"}}`))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer cloudflareAPI.Close()

	t.Setenv("CLOUDFLARE_API_BASE_URL", cloudflareAPI.URL+"/client/v4")
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"Writable Cloudflare","authType":"api_token","status":"healthy","secretRef":"cf-token","capabilities":["zones.read","dns.read","dns.write"]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected provider create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	previewBody := `{"zoneName":"example.com","records":[{"type":"TXT","name":"_dmarc.example.com","value":"v=DMARC1; p=quarantine","ttl":300,"priority":0,"proxied":false},{"type":"A","name":"mail.example.com","value":"1.2.3.4","ttl":120,"priority":0,"proxied":true}]}`
	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers/1/zones/zone-1/change-sets/preview", previewBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected change-set preview to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var preview struct {
		ID         uint64 `json:"id"`
		Status     string `json:"status"`
		Summary    string `json:"summary"`
		Operations []struct {
			Operation  string `json:"operation"`
			RecordType string `json:"recordType"`
			RecordName string `json:"recordName"`
			Status     string `json:"status"`
		} `json:"operations"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &preview); err != nil {
		t.Fatalf("expected preview response json, got %v: %s", err, rr.Body.String())
	}
	if preview.ID == 0 {
		t.Fatalf("expected preview response to include change-set id: %s", rr.Body.String())
	}
	if preview.Status != "previewed" {
		t.Fatalf("expected preview status, got %q", preview.Status)
	}
	if len(preview.Operations) != 3 {
		t.Fatalf("expected three operations in preview, got %#v", preview.Operations)
	}
	if !strings.Contains(preview.Summary, "1 create") || !strings.Contains(preview.Summary, "1 update") || !strings.Contains(preview.Summary, "1 delete") {
		t.Fatalf("expected preview summary counts, got %q", preview.Summary)
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/dns-change-sets/"+strconv.FormatUint(preview.ID, 10)+"/apply", `{}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected apply change-set to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	var applied struct {
		ID         uint64  `json:"id"`
		Status     string  `json:"status"`
		AppliedAt  *string `json:"appliedAt"`
		Operations []struct {
			Operation string `json:"operation"`
			Status    string `json:"status"`
		} `json:"operations"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &applied); err != nil {
		t.Fatalf("expected apply response json, got %v: %s", err, rr.Body.String())
	}
	if applied.Status != "applied" {
		t.Fatalf("expected applied status, got %q", applied.Status)
	}
	if applied.AppliedAt == nil || *applied.AppliedAt == "" {
		t.Fatalf("expected appliedAt timestamp in response: %s", rr.Body.String())
	}
	if len(applied.Operations) != 3 {
		t.Fatalf("expected three persisted operations after apply, got %#v", applied.Operations)
	}

	mu.Lock()
	defer mu.Unlock()
	if len(writeRequests) != 3 {
		t.Fatalf("expected 3 provider write requests, got %#v", writeRequests)
	}
	if writeRequests[0].Method != http.MethodPost || !strings.Contains(writeRequests[0].Body, `"content":"1.2.3.4"`) {
		t.Fatalf("expected create request first, got %#v", writeRequests[0])
	}
	if writeRequests[1].Method != http.MethodPatch || !strings.Contains(writeRequests[1].Body, `"content":"v=DMARC1; p=quarantine"`) {
		t.Fatalf("expected update request second, got %#v", writeRequests[1])
	}
	if writeRequests[2].Method != http.MethodDelete || writeRequests[2].Path != "/client/v4/zones/zone-1/dns_records/record-delete" {
		t.Fatalf("expected delete request third, got %#v", writeRequests[2])
	}
}

func TestAdminCanListProviderDNSChangeSets(t *testing.T) {
	cloudflareAPI := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/client/v4/zones/zone-1/dns_records":
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":[{"id":"record-update","type":"TXT","name":"_dmarc.example.com","content":"v=DMARC1; p=none","ttl":120,"priority":0,"proxied":false}]}`))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer cloudflareAPI.Close()

	t.Setenv("CLOUDFLARE_API_BASE_URL", cloudflareAPI.URL+"/client/v4")
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"History Cloudflare","authType":"api_token","status":"healthy","secretRef":"cf-token","capabilities":["zones.read","dns.read","dns.write"]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected provider create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	firstPreview := `{"zoneName":"example.com","records":[{"type":"TXT","name":"_dmarc.example.com","value":"v=DMARC1; p=quarantine","ttl":300,"priority":0,"proxied":false}]}`
	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers/1/zones/zone-1/change-sets/preview", firstPreview, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected first preview create, got %d: %s", rr.Code, rr.Body.String())
	}

	secondPreview := `{"zoneName":"example.com","records":[{"type":"A","name":"mail.example.com","value":"1.2.3.4","ttl":120,"priority":0,"proxied":true}]}`
	rr = performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers/1/zones/zone-1/change-sets/preview", secondPreview, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected second preview create, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domain-providers/1/zones/zone-1/change-sets", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected history list to succeed, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"items":[`) {
		t.Fatalf("expected history list wrapper, got %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"summary":"1 create, 0 update, 1 delete"`) {
		t.Fatalf("expected latest preview summary in history: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"summary":"0 create, 1 update, 0 delete"`) {
		t.Fatalf("expected previous preview summary in history: %s", rr.Body.String())
	}
	if strings.Index(rr.Body.String(), `"summary":"1 create, 0 update, 1 delete"`) > strings.Index(rr.Body.String(), `"summary":"0 create, 1 update, 0 delete"`) {
		t.Fatalf("expected newest change-set first in history response: %s", rr.Body.String())
	}
}

func TestAdminCanPreviewProviderVerificationProfiles(t *testing.T) {
	cloudflareAPI := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/client/v4/zones/zone-1/dns_records":
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write([]byte(`{"success":true,"result":[{"id":"mx-1","type":"MX","name":"example.com","content":"mx1.example.com","ttl":300,"priority":10,"proxied":false},{"id":"dmarc-1","type":"TXT","name":"_dmarc.example.com","content":"v=DMARC1; p=none","ttl":120,"priority":0,"proxied":false}]}`))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer cloudflareAPI.Close()

	t.Setenv("CLOUDFLARE_API_BASE_URL", cloudflareAPI.URL+"/client/v4")
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/domain-providers", `{"provider":"cloudflare","ownerType":"platform","displayName":"Verify Cloudflare","authType":"api_token","status":"healthy","secretRef":"cf-token","capabilities":["zones.read","dns.read","dns.write"]}`, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected provider create to succeed, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/domain-providers/1/zones/zone-1/verifications?zoneName=example.com", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected verification preview to succeed, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"verificationType":"inbound_mx"`) || !strings.Contains(rr.Body.String(), `"status":"drifted"`) {
		t.Fatalf("expected inbound mx drift verification profile in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"value":"mail.shiro.local"`) {
		t.Fatalf("expected inbound mx repair target in verification response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"verificationType":"dmarc"`) || !strings.Contains(rr.Body.String(), `"status":"drifted"`) {
		t.Fatalf("expected dmarc drift verification profile in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"value":"v=DMARC1; p=quarantine"`) {
		t.Fatalf("expected repair suggestion in verification response: %s", rr.Body.String())
	}
}

func TestAdminRuleAndConfigMutationsWriteAudit(t *testing.T) {
	server, token, _ := newAdminServer(t)

	rr := performJSON(server, http.MethodPut, "/api/v1/admin/rules/default", `{"name":"default","retentionHours":72,"autoExtend":true}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on rule upsert, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPut, "/api/v1/admin/configs/platform", `{"value":{"brand":"Shiro Email","allowSignup":true}}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on config upsert, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.rule.upsert`) {
		t.Fatalf("expected rule audit entry: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.config.upsert`) {
		t.Fatalf("expected config audit entry: %s", rr.Body.String())
	}
}

func TestAdminMailboxAndMessageFeeds(t *testing.T) {
	server, token, state := newAdminServer(t)

	activeMailbox, err := state.MailboxRepo.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "shiro.local",
		LocalPart: "alpha",
		Address:   "alpha@shiro.local",
		Status:    "active",
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected mailbox fixture, got %v", err)
	}

	if err := state.MessageRepo.UpsertFromLegacySync(context.Background(), activeMailbox.ID, activeMailbox.LocalPart, ingest.ParsedMessage{
		LegacyMailboxKey: activeMailbox.LocalPart,
		LegacyMessageKey: "admin-release-target",
		FromAddr:         "ops@example.com",
		ToAddr:           activeMailbox.Address,
		Subject:          "Mailbox Release Target",
		TextPreview:      "mailbox-release-target",
		ReceivedAt:       time.Now(),
	}); err != nil {
		t.Fatalf("expected message fixture before release, got %v", err)
	}

	if err := state.MessageRepo.UpsertFromLegacySync(context.Background(), activeMailbox.ID, activeMailbox.LocalPart, ingest.ParsedMessage{
		LegacyMailboxKey: activeMailbox.LocalPart,
		LegacyMessageKey: "admin-message-1",
		FromAddr:         "ops@example.com",
		ToAddr:           activeMailbox.Address,
		Subject:          "Operator digest",
		TextPreview:      "digest-preview",
		ReceivedAt:       time.Now(),
	}); err != nil {
		t.Fatalf("expected message fixture, got %v", err)
	}

	rr := performJSON(server, http.MethodGet, "/api/v1/admin/mailboxes", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on mailbox feed, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"address":"alpha@shiro.local"`) {
		t.Fatalf("expected mailbox address in feed: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"ownerUsername":"alice"`) {
		t.Fatalf("expected owner username in feed: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/messages", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on message feed, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"subject":"Operator digest"`) {
		t.Fatalf("expected message subject in feed: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"mailboxAddress":"alpha@shiro.local"`) {
		t.Fatalf("expected mailbox address in message feed: %s", rr.Body.String())
	}
}

func TestAdminCanExtendAndReleaseMailbox(t *testing.T) {
	server, token, state := newAdminServer(t)

	activeMailbox, err := state.MailboxRepo.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "shiro.local",
		LocalPart: "ops-admin",
		Address:   "ops-admin@shiro.local",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected mailbox fixture, got %v", err)
	}

	rr := performJSON(server, http.MethodPost, "/api/v1/admin/mailboxes/"+strconv.FormatUint(activeMailbox.ID, 10)+"/extend", `{"expiresInHours":24}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on mailbox extend, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"active"`) {
		t.Fatalf("expected active mailbox after extend: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/mailboxes/"+strconv.FormatUint(activeMailbox.ID, 10)+"/release", `{}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on mailbox release, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"released"`) {
		t.Fatalf("expected released mailbox in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/mailboxes", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin mailbox list after release, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"id":`+strconv.FormatUint(activeMailbox.ID, 10)) {
		t.Fatalf("expected released mailbox to disappear from admin mailbox list: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/users", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin users after release, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"id":1`) || !strings.Contains(rr.Body.String(), `"mailboxes":0`) {
		t.Fatalf("expected released mailbox to stop contributing to admin user totals: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/mailboxes/"+strconv.FormatUint(activeMailbox.ID, 10)+"/messages", "", token)
	if rr.Code != http.StatusNotFound {
		t.Fatalf("expected 404 on admin mailbox messages after release, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.mailbox.extend`) {
		t.Fatalf("expected admin mailbox extend audit entry: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.mailbox.release`) {
		t.Fatalf("expected admin mailbox release audit entry: %s", rr.Body.String())
	}
}

func TestAdminCanReadMailboxParsedRaw(t *testing.T) {
	server, token, state := newAdminServer(t)

	targetMailbox, err := state.MailboxRepo.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "shiro.local",
		LocalPart: "cid-admin",
		Address:   "cid-admin@shiro.local",
		Status:    "active",
		ExpiresAt: time.Now().Add(24 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("expected mailbox fixture, got %v", err)
	}

	rawMessage := "From: sender@example.com\r\nTo: cid-admin@shiro.local\r\nSubject: Inline image\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary=abc\r\n\r\n--abc\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<img src=\"cid:logo@test\">\r\n--abc\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <logo@test>\r\nContent-Disposition: inline; filename=\"logo.png\"\r\n\r\naGVsbG8=\r\n--abc--\r\n"
	if _, err := state.DirectIngest.Deliver(context.Background(), ingest.InboundEnvelope{
		MailFrom:   "sender@example.com",
		Recipients: []string{targetMailbox.Address},
	}, strings.NewReader(rawMessage)); err != nil {
		t.Fatalf("expected direct ingest success, got %v", err)
	}

	items, err := state.MessageRepo.ListByMailboxID(context.Background(), targetMailbox.ID)
	if err != nil {
		t.Fatalf("expected stored messages, got %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected one stored message, got %d", len(items))
	}

	rr := performJSON(server, http.MethodGet, "/api/v1/admin/mailboxes/"+strconv.FormatUint(targetMailbox.ID, 10)+"/messages/"+strconv.FormatUint(items[0].ID, 10)+"/raw/parsed", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin parsed raw, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"contentId":"logo@test"`) {
		t.Fatalf("expected parsed raw attachment content id, got %s", rr.Body.String())
	}
}

func TestAdminCanCreateOwnAPIKey(t *testing.T) {
	server, token, _ := newAdminServer(t)

	body := `{"name":"ops-worker","scopes":["domains.read","mailboxes.read"],"resourcePolicy":{"domainAccessMode":"private_only","allowPlatformPublicDomains":false,"allowUserPublishedDomains":false,"allowOwnedPrivateDomains":true,"allowProviderMutation":false,"allowProtectedRecordWrite":false},"domainBindings":[{"nodeId":1,"accessLevel":"read"}]}`
	rr := performJSON(server, http.MethodPost, "/api/v1/admin/api-keys", body, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 on admin api key create, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"userId":2`) {
		t.Fatalf("expected admin user id in api key create response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"name":"ops-worker"`) {
		t.Fatalf("expected created api key name in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"plainSecret":"sk_live_`) {
		t.Fatalf("expected one-time plain secret in create response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"domainAccessMode":"private_only"`) {
		t.Fatalf("expected resource policy in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"accessLevel":"read"`) {
		t.Fatalf("expected domain binding in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/api-keys", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin api key list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"name":"ops-worker"`) {
		t.Fatalf("expected created api key in admin list: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.api_key.create`) {
		t.Fatalf("expected admin api key audit entry: %s", rr.Body.String())
	}
}

func TestAdminCanRotateAndRevokeOwnAPIKey(t *testing.T) {
	server, token, _ := newAdminServer(t)

	createBody := `{"name":"ops-worker","scopes":["domains.read","mailboxes.read"]}`
	rr := performJSON(server, http.MethodPost, "/api/v1/admin/api-keys", createBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 on admin api key create, got %d: %s", rr.Code, rr.Body.String())
	}
	apiKeyID := extractJSONScalarField(rr.Body.String(), "id")
	if apiKeyID == "" {
		t.Fatalf("expected api key id in create response: %s", rr.Body.String())
	}
	originalPreview := extractJSONField(rr.Body.String(), "keyPreview")
	originalPlainSecret := extractJSONField(rr.Body.String(), "plainSecret")
	if originalPreview == "" {
		t.Fatalf("expected original key preview in create response: %s", rr.Body.String())
	}
	if originalPlainSecret == "" {
		t.Fatalf("expected original plain secret in create response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/api-keys/"+apiKeyID+"/rotate", `{}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin api key rotate, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"rotatedAt"`) {
		t.Fatalf("expected rotatedAt in rotate response: %s", rr.Body.String())
	}
	rotatedPreview := extractJSONField(rr.Body.String(), "keyPreview")
	rotatedPlainSecret := extractJSONField(rr.Body.String(), "plainSecret")
	if rotatedPreview == "" || rotatedPreview == originalPreview {
		t.Fatalf("expected rotated preview to change, original=%q current=%q body=%s", originalPreview, rotatedPreview, rr.Body.String())
	}
	if rotatedPlainSecret == "" || rotatedPlainSecret == originalPlainSecret {
		t.Fatalf("expected rotated plain secret to change, original=%q current=%q body=%s", originalPlainSecret, rotatedPlainSecret, rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/api-keys/"+apiKeyID+"/revoke", `{}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin api key revoke, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"status":"revoked"`) {
		t.Fatalf("expected revoked status in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.api_key.rotate`) {
		t.Fatalf("expected admin api key rotate audit entry: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.api_key.revoke`) {
		t.Fatalf("expected admin api key revoke audit entry: %s", rr.Body.String())
	}
}

func TestAdminCanManageNotices(t *testing.T) {
	server, token, _ := newAdminServer(t)

	createBody := `{"title":"维护通知","body":"今晚 23:30 进行服务维护。","category":"maintenance","level":"warning"}`
	rr := performJSON(server, http.MethodPost, "/api/v1/admin/notices", createBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 on notice create, got %d: %s", rr.Code, rr.Body.String())
	}

	noticeID := extractJSONScalarField(rr.Body.String(), "id")
	if noticeID == "" {
		t.Fatalf("expected notice id in create response: %s", rr.Body.String())
	}

	updateBody := `{"title":"维护通知更新","body":"维护窗口调整到 23:45。","category":"maintenance","level":"warning"}`
	rr = performJSON(server, http.MethodPut, "/api/v1/admin/notices/"+noticeID, updateBody, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on notice update, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"title":"维护通知更新"`) {
		t.Fatalf("expected updated notice title in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/notices/"+noticeID, "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on notice delete, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/notices", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on notice list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"title":"维护通知更新"`) {
		t.Fatalf("expected deleted notice to disappear from admin list: %s", rr.Body.String())
	}
}

func TestAdminCanManageDocs(t *testing.T) {
	server, token, _ := newAdminServer(t)

	createBody := `{"title":"Webhook 事件","category":"开发文档","summary":"说明收件、续期、释放邮箱等事件结构。","readTimeMin":6,"tags":["Webhook","事件","回调"]}`
	rr := performJSON(server, http.MethodPost, "/api/v1/admin/docs", createBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 on doc create, got %d: %s", rr.Code, rr.Body.String())
	}

	docID := extractJSONField(rr.Body.String(), "id")
	if docID == "" {
		t.Fatalf("expected doc id in create response: %s", rr.Body.String())
	}

	updateBody := `{"title":"Webhook 事件更新","category":"开发文档","summary":"补充 webhook payload 与失败重试规则。","readTimeMin":8,"tags":["Webhook","重试"]}`
	rr = performJSON(server, http.MethodPut, "/api/v1/admin/docs/"+docID, updateBody, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on doc update, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"title":"Webhook 事件更新"`) {
		t.Fatalf("expected updated doc title in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/portal/docs", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on portal doc list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"title":"Webhook 事件更新"`) {
		t.Fatalf("expected updated admin doc to appear in portal docs: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodDelete, "/api/v1/admin/docs/"+docID, "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on doc delete, got %d: %s", rr.Code, rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/docs", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin doc list, got %d: %s", rr.Code, rr.Body.String())
	}
	if strings.Contains(rr.Body.String(), `"title":"Webhook 事件更新"`) {
		t.Fatalf("expected deleted doc to disappear from admin list: %s", rr.Body.String())
	}
}

func TestAdminCanCreateWebhookForUser(t *testing.T) {
	server, token, _ := newAdminServer(t)

	body := `{"userId":1,"name":"ops-events","targetUrl":"https://sandbox.local/hooks/ops-events","events":["new_message","mailbox_created"]}`
	rr := performJSON(server, http.MethodPost, "/api/v1/admin/webhooks", body, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 on admin webhook create, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"userId":1`) {
		t.Fatalf("expected target user id in webhook create response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"name":"ops-events"`) {
		t.Fatalf("expected created webhook name in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"targetUrl":"https://sandbox.local/hooks/ops-events"`) {
		t.Fatalf("expected created webhook target in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"events":["new_message","mailbox_created"]`) {
		t.Fatalf("expected webhook events in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/webhooks", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin webhook list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"name":"ops-events"`) {
		t.Fatalf("expected created webhook in admin list: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.webhook.create`) {
		t.Fatalf("expected admin webhook audit entry: %s", rr.Body.String())
	}
}

func TestAdminCanUpdateAndToggleWebhookForUser(t *testing.T) {
	server, token, _ := newAdminServer(t)

	createBody := `{"userId":1,"name":"ops-events","targetUrl":"https://sandbox.local/hooks/ops-events","events":["new_message","mailbox_created"]}`
	rr := performJSON(server, http.MethodPost, "/api/v1/admin/webhooks", createBody, token)
	if rr.Code != http.StatusCreated {
		t.Fatalf("expected 201 on admin webhook create, got %d: %s", rr.Code, rr.Body.String())
	}
	webhookID := extractJSONScalarField(rr.Body.String(), "id")
	if webhookID == "" {
		t.Fatalf("expected webhook id in create response: %s", rr.Body.String())
	}

	updateBody := `{"name":"ops-events-updated","targetUrl":"https://sandbox.local/hooks/ops-events-updated","events":["new_message"]}`
	rr = performJSON(server, http.MethodPut, "/api/v1/admin/webhooks/"+webhookID, updateBody, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin webhook update, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"name":"ops-events-updated"`) {
		t.Fatalf("expected updated webhook name in response: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"targetUrl":"https://sandbox.local/hooks/ops-events-updated"`) {
		t.Fatalf("expected updated target url in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodPost, "/api/v1/admin/webhooks/"+webhookID+"/toggle", `{"enabled":false}`, token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on admin webhook toggle, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `"enabled":false`) {
		t.Fatalf("expected disabled webhook in response: %s", rr.Body.String())
	}

	rr = performJSON(server, http.MethodGet, "/api/v1/admin/audit", "", token)
	if rr.Code != http.StatusOK {
		t.Fatalf("expected 200 on audit list, got %d: %s", rr.Code, rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.webhook.update`) {
		t.Fatalf("expected admin webhook update audit entry: %s", rr.Body.String())
	}
	if !strings.Contains(rr.Body.String(), `admin.webhook.toggle`) {
		t.Fatalf("expected admin webhook toggle audit entry: %s", rr.Body.String())
	}
}

func newAdminServer(t *testing.T) (http.Handler, string, *bootstrap.AppState) {
	t.Helper()

	server, state := bootstrap.NewTestApp()
	token, err := security.SignAccessToken(2, []string{"admin"}, config.MustLoadConfig().JWTSecret)
	if err != nil {
		t.Fatalf("expected admin token, got %v", err)
	}
	return server, token, state
}
