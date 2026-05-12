package portal

import (
	"context"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type WebhookTestResult struct {
	Success        bool   `json:"success"`
	ResponseStatus int    `json:"responseStatus"`
	ResponseBody   string `json:"responseBody"`
	LatencyMs      int    `json:"latencyMs"`
	ErrorMessage   string `json:"errorMessage,omitempty"`
}

type WebhookTester interface {
	TestDeliver(ctx context.Context, userID uint64, wh Webhook) WebhookTestResult
}

type WebhookRetrier interface {
	RetryDeliver(ctx context.Context, userID uint64, wh Webhook, originalBody []byte) WebhookTestResult
}

type Controller struct {
	service        *Service
	webhookTester  WebhookTester
	webhookRetrier WebhookRetrier
}

func NewController(service *Service, extras ...any) *Controller {
	c := &Controller{service: service}
	for _, extra := range extras {
		switch v := extra.(type) {
		case WebhookTester:
			c.webhookTester = v
		case WebhookRetrier:
			c.webhookRetrier = v
		}
	}
	return c
}

func (c *Controller) Overview(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	item, err := c.service.Overview(ctx, userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load overview"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListNotices(ctx *gin.Context) {
	items, err := c.service.ListNotices(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load notices"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListFeedback(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	items, err := c.service.ListFeedback(ctx, userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load feedback"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateFeedback(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	var req struct {
		Category string `json:"category"`
		Subject  string `json:"subject"`
		Content  string `json:"content"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}
	item, err := c.service.CreateFeedback(ctx, userID, req.Category, req.Subject, req.Content)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to submit feedback"})
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) ListAPIKeys(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	items, err := c.service.ListAPIKeys(ctx, userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load api keys"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateAPIKey(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	var req struct {
		Name           string                `json:"name"`
		Scopes         []string              `json:"scopes"`
		ExpiresAt      *time.Time            `json:"expiresAt"`
		ResourcePolicy APIKeyResourcePolicy  `json:"resourcePolicy"`
		DomainBindings []APIKeyDomainBinding `json:"domainBindings"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}
	item, err := c.service.CreateAPIKey(ctx, userID, CreateAPIKeyInput{
		Name:           req.Name,
		Scopes:         req.Scopes,
		ExpiresAt:      req.ExpiresAt,
		ResourcePolicy: req.ResourcePolicy,
		DomainBindings: req.DomainBindings,
	})
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create api key"})
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) RotateAPIKey(ctx *gin.Context) {
	c.withAPIKeyID(ctx, func(userID uint64, apiKeyID uint64) {
		item, err := c.service.RotateAPIKey(ctx, userID, apiKeyID)
		if err != nil {
			ctx.JSON(http.StatusNotFound, gin.H{"message": "api key not found"})
			return
		}
		ctx.JSON(http.StatusOK, item)
	})
}

func (c *Controller) RevokeAPIKey(ctx *gin.Context) {
	c.withAPIKeyID(ctx, func(userID uint64, apiKeyID uint64) {
		item, err := c.service.RevokeAPIKey(ctx, userID, apiKeyID)
		if err != nil {
			ctx.JSON(http.StatusNotFound, gin.H{"message": "api key not found"})
			return
		}
		ctx.JSON(http.StatusOK, item)
	})
}

func (c *Controller) ListWebhooks(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	items, err := c.service.ListWebhooks(ctx, userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load webhooks"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListWebhookEventTypes(ctx *gin.Context) {
	ctx.JSON(http.StatusOK, gin.H{"items": SupportedWebhookEvents})
}

func (c *Controller) CreateWebhook(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	var req struct {
		Name      string   `json:"name"`
		TargetURL string   `json:"targetUrl"`
		Events    []string `json:"events"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}
	item, err := c.service.CreateWebhook(ctx, userID, req.Name, req.TargetURL, req.Events)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create webhook"})
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateWebhook(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	webhookID, ok := parseParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}
	var req struct {
		Name      string   `json:"name"`
		TargetURL string   `json:"targetUrl"`
		Events    []string `json:"events"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}
	item, err := c.service.UpdateWebhook(ctx, userID, webhookID, req.Name, req.TargetURL, req.Events)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "webhook not found"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ToggleWebhook(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	webhookID, ok := parseParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}
	item, err := c.service.ToggleWebhook(ctx, userID, webhookID, req.Enabled)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "webhook not found"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListWebhookDeliveryLogs(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	webhookID, _ := parseParamID(ctx, "id")
	items, err := c.service.ListWebhookDeliveryLogs(ctx, userID, webhookID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load delivery logs"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) TestWebhook(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	webhookID, ok := parseParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}
	wh, err := c.service.TestWebhook(ctx, userID, webhookID)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "webhook not found"})
		return
	}
	if c.webhookTester == nil {
		ctx.JSON(http.StatusServiceUnavailable, gin.H{"message": "webhook dispatcher not available"})
		return
	}
	result := c.webhookTester.TestDeliver(ctx.Request.Context(), userID, wh)
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) RetryWebhookDelivery(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	deliveryID, ok := parseParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid delivery id"})
		return
	}
	if c.webhookRetrier == nil {
		ctx.JSON(http.StatusServiceUnavailable, gin.H{"message": "webhook dispatcher not available"})
		return
	}
	result, err := c.service.RetryWebhookDelivery(ctx, userID, deliveryID, c.webhookRetrier)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "delivery log not found"})
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) ListDocs(ctx *gin.Context) {
	items, err := c.service.ListDocs(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load docs"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) GetBilling(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	item, err := c.service.GetBilling(ctx, userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load billing"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) GetBalance(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	item, err := c.service.GetBalance(ctx, userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load balance"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) GetSettings(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	item, err := c.service.GetSettings(ctx, userID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load settings"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) UpdateSettings(ctx *gin.Context) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	var req struct {
		DisplayName        string `json:"displayName"`
		Locale             string `json:"locale"`
		Timezone           string `json:"timezone"`
		AutoRefreshSeconds int    `json:"autoRefreshSeconds"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}
	item, err := c.service.UpdateSettings(ctx, userID, req.DisplayName, req.Locale, req.Timezone, req.AutoRefreshSeconds)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update settings"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) withAPIKeyID(ctx *gin.Context, fn func(userID uint64, apiKeyID uint64)) {
	userID, ok := authUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	apiKeyID, ok := parseParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}
	fn(userID, apiKeyID)
}

func authUserID(ctx *gin.Context) (uint64, bool) {
	value, ok := ctx.Get("auth.userID")
	if !ok {
		return 0, false
	}
	userID, ok := value.(uint64)
	return userID, ok
}

func parseParamID(ctx *gin.Context, name string) (uint64, bool) {
	value, err := strconv.ParseUint(ctx.Param(name), 10, 64)
	if err != nil {
		return 0, false
	}
	return value, true
}
