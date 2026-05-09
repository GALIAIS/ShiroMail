package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"gorm.io/gorm"
	"shiro-email/backend/internal/database"
	"shiro-email/backend/internal/modules/portal"
)

type WebhookRepo interface {
	ListWebhooksByUser(ctx context.Context, userID uint64) ([]portal.Webhook, error)
}

type Dispatcher struct {
	repo    WebhookRepo
	db      *gorm.DB
	client  *http.Client
	sem     chan struct{}
}

type Payload struct {
	Event     string `json:"event"`
	Timestamp string `json:"timestamp"`
	Data      any    `json:"data"`
}

type DeliveryLog struct {
	WebhookID      uint64
	UserID         uint64
	Event          string
	TargetURL      string
	RequestBody    string
	ResponseStatus int
	ResponseBody   string
	LatencyMs      int
	Success        bool
	ErrorMessage   string
	Attempt        int
}

const maxConcurrentDeliveries = 16
const maxResponseBodyLog = 1024

func NewDispatcher(repo WebhookRepo, db *gorm.DB) *Dispatcher {
	return &Dispatcher{
		repo: repo,
		db:   db,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		sem: make(chan struct{}, maxConcurrentDeliveries),
	}
}

type TestResult struct {
	Success        bool   `json:"success"`
	ResponseStatus int    `json:"responseStatus"`
	ResponseBody   string `json:"responseBody"`
	LatencyMs      int    `json:"latencyMs"`
	ErrorMessage   string `json:"errorMessage,omitempty"`
}

func (d *Dispatcher) TestDeliver(ctx context.Context, userID uint64, wh portal.Webhook) TestResult {
	payload := Payload{
		Event:     "test",
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Data: map[string]any{
			"mailbox": "test@example.com",
			"subject": "Test webhook delivery",
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return TestResult{ErrorMessage: err.Error()}
	}

	log := DeliveryLog{
		WebhookID:   wh.ID,
		UserID:      userID,
		Event:       "test",
		TargetURL:   wh.TargetURL,
		RequestBody: truncate(string(body), 4096),
		Attempt:     1,
	}

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, wh.TargetURL, bytes.NewReader(body))
	if err != nil {
		log.ErrorMessage = err.Error()
		d.saveLog(log)
		return TestResult{ErrorMessage: err.Error()}
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "ShiroEmail-Webhook/1.0")
	if wh.SecretPreview != "" {
		req.Header.Set("X-Webhook-Signature", signPayload(body, wh.SecretPreview))
	}

	resp, err := d.client.Do(req)
	log.LatencyMs = int(time.Since(start).Milliseconds())

	if err != nil {
		log.ErrorMessage = err.Error()
		d.saveLog(log)
		return TestResult{
			ErrorMessage: err.Error(),
			LatencyMs:    log.LatencyMs,
		}
	}
	defer resp.Body.Close()

	log.ResponseStatus = resp.StatusCode
	log.Success = resp.StatusCode >= 200 && resp.StatusCode < 300

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponseBodyLog))
	log.ResponseBody = string(respBody)

	d.saveLog(log)

	return TestResult{
		Success:        log.Success,
		ResponseStatus: resp.StatusCode,
		ResponseBody:   log.ResponseBody,
		LatencyMs:      log.LatencyMs,
	}
}

func (d *Dispatcher) Dispatch(ctx context.Context, userID uint64, event string, data any) {
	webhooks, err := d.repo.ListWebhooksByUser(ctx, userID)
	if err != nil {
		slog.Error("webhook: failed to list webhooks", "userId", userID, "error", err)
		return
	}

	payload := Payload{
		Event:     event,
		Timestamp: time.Now().UTC().Format(time.RFC3339),
		Data:      data,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		slog.Error("webhook: failed to marshal payload", "error", err)
		return
	}

	for _, wh := range webhooks {
		if !wh.Enabled || !matchesEvent(wh.Events, event) {
			continue
		}
		wh := wh
		d.sem <- struct{}{}
		go func() {
			defer func() { <-d.sem }()
			d.deliverWithLog(userID, event, wh, body)
		}()
	}
}

func (d *Dispatcher) deliverWithLog(userID uint64, event string, wh portal.Webhook, body []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	log := DeliveryLog{
		WebhookID:   wh.ID,
		UserID:      userID,
		Event:       event,
		TargetURL:   wh.TargetURL,
		RequestBody: truncate(string(body), 4096),
		Attempt:     1,
	}

	start := time.Now()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, wh.TargetURL, bytes.NewReader(body))
	if err != nil {
		log.ErrorMessage = err.Error()
		d.saveLog(log)
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "ShiroEmail-Webhook/1.0")
	if wh.SecretPreview != "" {
		req.Header.Set("X-Webhook-Signature", signPayload(body, wh.SecretPreview))
	}

	resp, err := d.client.Do(req)
	log.LatencyMs = int(time.Since(start).Milliseconds())

	if err != nil {
		log.ErrorMessage = err.Error()
		d.saveLog(log)
		slog.Warn("webhook: delivery failed", "webhookId", wh.ID, "url", wh.TargetURL, "error", err)
		return
	}
	defer resp.Body.Close()

	log.ResponseStatus = resp.StatusCode
	log.Success = resp.StatusCode >= 200 && resp.StatusCode < 300

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponseBodyLog))
	log.ResponseBody = string(respBody)

	d.saveLog(log)

	if !log.Success {
		slog.Warn("webhook: delivery returned error", "webhookId", wh.ID, "status", resp.StatusCode)
	}
}

func (d *Dispatcher) saveLog(log DeliveryLog) {
	if d.db == nil {
		return
	}
	row := database.WebhookDeliveryLogRow{
		WebhookID:      log.WebhookID,
		UserID:         log.UserID,
		Event:          log.Event,
		TargetURL:      log.TargetURL,
		RequestBody:    log.RequestBody,
		ResponseStatus: log.ResponseStatus,
		ResponseBody:   log.ResponseBody,
		LatencyMs:      log.LatencyMs,
		Success:        log.Success,
		ErrorMessage:   log.ErrorMessage,
		Attempt:        log.Attempt,
	}
	if err := d.db.Create(&row).Error; err != nil {
		slog.Error("webhook: failed to save delivery log", "webhookId", log.WebhookID, "error", err)
	}
}

func signPayload(body []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func matchesEvent(subscribed []string, event string) bool {
	for _, e := range subscribed {
		if e == "*" || e == event {
			return true
		}
	}
	return false
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}
