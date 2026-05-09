package admin

import (
	"errors"
	"fmt"
	"mime"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/modules/auth"
	"shiro-email/backend/internal/modules/domain"
	"shiro-email/backend/internal/modules/mailbox"
	"shiro-email/backend/internal/modules/message"
	"shiro-email/backend/internal/modules/portal"
)

type Controller struct {
	service *Service
}

func NewController(service *Service) *Controller {
	return &Controller{service: service}
}

func (c *Controller) Overview(ctx *gin.Context) {
	payload, err := c.service.Overview(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to build overview"})
		return
	}
	ctx.JSON(http.StatusOK, payload)
}

func (c *Controller) ListUsers(ctx *gin.Context) {
	items, err := c.service.ListUsers(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list users"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) GetUserDetail(ctx *gin.Context) {
	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	detail, err := c.service.GetUserDetail(ctx, userID)
	if err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		return
	}
	ctx.JSON(http.StatusOK, detail)
}

func (c *Controller) UpdateUserRoles(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	var req struct {
		Roles []string `json:"roles"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.UpdateUserRoles(ctx, actorID, userID, req.Roles)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		case errors.Is(err, ErrInvalidUserRoles), errors.Is(err, ErrCannotRemoveOwnAdminRole), errors.Is(err, ErrCannotRemoveLastAdminRole):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update user roles"})
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) UpdateUser(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	var req struct {
		Username      string   `json:"username"`
		Email         string   `json:"email"`
		Status        string   `json:"status"`
		EmailVerified bool     `json:"emailVerified"`
		Roles         []string `json:"roles"`
		NewPassword   string   `json:"newPassword"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.UpdateUser(ctx, actorID, userID, UpdateUserInput{
		Username:      req.Username,
		Email:         req.Email,
		Status:        req.Status,
		EmailVerified: req.EmailVerified,
		Roles:         req.Roles,
		NewPassword:   req.NewPassword,
	})
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		case errors.Is(err, ErrInvalidUserRoles),
			errors.Is(err, ErrInvalidUserProfile),
			errors.Is(err, ErrCannotRemoveOwnAdminRole),
			errors.Is(err, ErrCannotRemoveLastAdminRole):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		case err.Error() == "username already exists", err.Error() == "email already exists":
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteUser(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	if err := c.service.DeleteUser(ctx, actorID, userID); err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		case errors.Is(err, ErrCannotDeleteOwnAccount),
			errors.Is(err, ErrCannotDeleteLastAdmin),
			errors.Is(err, ErrUserHasMailboxes),
			errors.Is(err, ErrUserOwnsDomains),
			errors.Is(err, ErrUserOwnsProviderAccounts):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to delete user"})
		}
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) BanUser(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	var req struct {
		Reason string `json:"reason"`
	}
	_ = ctx.ShouldBindJSON(&req)

	item, err := c.service.BanUser(ctx, actorID, userID, req.Reason)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		case errors.Is(err, ErrCannotBanSelf), errors.Is(err, ErrCannotBanAdmin):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to ban user"})
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) UnbanUser(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	item, err := c.service.UnbanUser(ctx, actorID, userID)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		case errors.Is(err, ErrInvalidUserProfile):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": "user is not banned"})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to unban user"})
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListDomains(ctx *gin.Context) {
	items, err := c.service.ListDomains(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list domains"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListDomainProviders(ctx *gin.Context) {
	items, err := c.service.ListDomainProviders(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list domain providers"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListMailboxes(ctx *gin.Context) {
	items, err := c.service.ListMailboxes(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list mailboxes"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListMailboxDomains(ctx *gin.Context) {
	items, err := c.service.ListMailboxDomains(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list mailbox domains"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateMailbox(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	var req struct {
		UserID uint64 `json:"userId" binding:"required"`
		mailbox.CreateMailboxRequest
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.CreateMailbox(ctx, actorID, req.UserID, req.CreateMailboxRequest)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		case errors.Is(err, domain.ErrDomainNotFound), errors.Is(err, mailbox.ErrAddressConflict):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		case errors.Is(err, mailbox.ErrInvalidMailboxTTL), errors.Is(err, mailbox.ErrInvalidLocalPart), errors.Is(err, mailbox.ErrDomainVerificationRequired):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create mailbox"})
		}
		return
	}

	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) ExtendMailbox(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	mailboxID, ok := parseAdminMailboxID(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	var req mailbox.ExtendMailboxRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.ExtendMailbox(ctx, actorID, mailboxID, req.ExpiresInHours)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "mailbox not found"})
		case errors.Is(err, mailbox.ErrInvalidMailboxTTL):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to extend mailbox"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ReleaseMailbox(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	mailboxID, ok := parseAdminMailboxID(ctx)
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	item, err := c.service.ReleaseMailbox(ctx, actorID, mailboxID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "mailbox not found"})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to release mailbox"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListMessages(ctx *gin.Context) {
	items, err := c.service.ListMessages(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list messages"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListMailboxMessages(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return
	}

	items, err := c.service.ListMailboxMessages(ctx, mailboxID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "mailbox not found"})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list mailbox messages"})
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) MailboxMessageDetail(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return
	}
	messageID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid message id"})
		return
	}

	item, err := c.service.GetMailboxMessage(ctx, mailboxID, messageID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "mailbox not found"})
		case errors.Is(err, message.ErrMessageDeleted):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "message deleted"})
		case message.IsNotFound(err):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load mailbox message"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) MailboxMessageRaw(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return
	}
	messageID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid message id"})
		return
	}

	download, err := c.service.DownloadMailboxMessageRaw(ctx, mailboxID, messageID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound), errors.Is(err, message.ErrMessageDeleted), message.IsNotFound(err), errors.Is(err, message.ErrMessageContentUnavailable):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load raw mailbox message"})
		}
		return
	}
	writeAdminDownload(ctx, download)
}

func (c *Controller) MailboxMessageParsedRaw(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return
	}
	messageID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid message id"})
		return
	}

	parsed, err := c.service.ParseMailboxMessageRaw(ctx, mailboxID, messageID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound), errors.Is(err, message.ErrMessageDeleted), message.IsNotFound(err), errors.Is(err, message.ErrMessageContentUnavailable):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to parse raw mailbox message"})
		}
		return
	}
	ctx.JSON(http.StatusOK, parsed)
}

func (c *Controller) MailboxMessageAttachment(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return
	}
	messageID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid message id"})
		return
	}
	attachmentIndex, err := strconv.Atoi(ctx.Param("index"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid attachment index"})
		return
	}

	download, err := c.service.DownloadMailboxMessageAttachment(ctx, mailboxID, messageID, attachmentIndex)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound), errors.Is(err, message.ErrMessageDeleted), message.IsNotFound(err), errors.Is(err, message.ErrAttachmentNotFound), errors.Is(err, message.ErrMessageContentUnavailable):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load mailbox attachment"})
		}
		return
	}
	writeAdminDownload(ctx, download)
}

func (c *Controller) ListAPIKeys(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	items, err := c.service.ListAPIKeys(ctx, actorID)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list api keys"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateAPIKey(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	var req struct {
		Name           string                       `json:"name"`
		Scopes         []string                     `json:"scopes"`
		ResourcePolicy portal.APIKeyResourcePolicy  `json:"resourcePolicy"`
		DomainBindings []portal.APIKeyDomainBinding `json:"domainBindings"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.CreateAPIKey(ctx, actorID, portal.CreateAPIKeyInput{
		Name:           req.Name,
		Scopes:         req.Scopes,
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
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	apiKeyID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	item, err := c.service.RotateAPIKey(ctx, actorID, apiKeyID)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "api key not found"})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to rotate api key"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) RevokeAPIKey(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	apiKeyID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid id"})
		return
	}

	item, err := c.service.RevokeAPIKey(ctx, actorID, apiKeyID)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "api key not found"})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to revoke api key"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListWebhooks(ctx *gin.Context) {
	items, err := c.service.ListWebhooks(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list webhooks"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateWebhook(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	var req struct {
		UserID    uint64   `json:"userId"`
		Name      string   `json:"name"`
		TargetURL string   `json:"targetUrl"`
		Events    []string `json:"events"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.CreateWebhook(ctx, actorID, req.UserID, req.Name, req.TargetURL, req.Events)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create webhook"})
		}
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateWebhook(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	webhookID, ok := parseAdminParamID(ctx, "id")
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

	item, err := c.service.UpdateWebhook(ctx, actorID, webhookID, req.Name, req.TargetURL, req.Events)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "webhook not found"})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update webhook"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ToggleWebhook(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	webhookID, ok := parseAdminParamID(ctx, "id")
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

	item, err := c.service.ToggleWebhook(ctx, actorID, webhookID, req.Enabled)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "webhook not found"})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to toggle webhook"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListNotices(ctx *gin.Context) {
	items, err := c.service.ListNotices(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list notices"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateNotice(ctx *gin.Context) {
	var req struct {
		Title    string `json:"title"`
		Body     string `json:"body"`
		Category string `json:"category"`
		Level    string `json:"level"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}
	item, err := c.service.CreateNotice(ctx, req.Title, req.Body, req.Category, req.Level)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create notice"})
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateNotice(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	noticeID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid notice id"})
		return
	}

	var req struct {
		Title    string `json:"title"`
		Body     string `json:"body"`
		Category string `json:"category"`
		Level    string `json:"level"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.UpdateNotice(ctx, actorID, noticeID, req.Title, req.Body, req.Category, req.Level)
	if err != nil {
		if errors.Is(err, portal.ErrNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"message": "notice not found"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update notice"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteNotice(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	noticeID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid notice id"})
		return
	}

	if err := c.service.DeleteNotice(ctx, actorID, noticeID); err != nil {
		if errors.Is(err, portal.ErrNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"message": "notice not found"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to delete notice"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) ListDocs(ctx *gin.Context) {
	items, err := c.service.ListDocs(ctx)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list docs"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateDoc(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	var req struct {
		Title       string   `json:"title"`
		Category    string   `json:"category"`
		Summary     string   `json:"summary"`
		ReadTimeMin int      `json:"readTimeMin"`
		Tags        []string `json:"tags"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.CreateDoc(ctx, actorID, req.Title, req.Category, req.Summary, req.ReadTimeMin, req.Tags)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create doc"})
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateDoc(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	var req struct {
		Title       string   `json:"title"`
		Category    string   `json:"category"`
		Summary     string   `json:"summary"`
		ReadTimeMin int      `json:"readTimeMin"`
		Tags        []string `json:"tags"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.UpdateDoc(ctx, actorID, ctx.Param("id"), req.Title, req.Category, req.Summary, req.ReadTimeMin, req.Tags)
	if err != nil {
		if errors.Is(err, portal.ErrNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"message": "doc not found"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update doc"})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteDoc(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	if err := c.service.DeleteDoc(ctx, actorID, ctx.Param("id")); err != nil {
		if errors.Is(err, portal.ErrNotFound) {
			ctx.JSON(http.StatusNotFound, gin.H{"message": "doc not found"})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to delete doc"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) UpsertDomain(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	var req struct {
		Domain            string  `json:"domain"`
		Status            string  `json:"status"`
		Visibility        string  `json:"visibility"`
		PublicationStatus string  `json:"publicationStatus"`
		VerificationScore int     `json:"verificationScore"`
		HealthStatus      string  `json:"healthStatus"`
		ProviderAccountID *uint64 `json:"providerAccountId"`
		IsDefault         bool    `json:"isDefault"`
		Weight            int     `json:"weight"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.UpsertDomain(ctx, actorID, domain.Domain{
		Domain:            req.Domain,
		Status:            req.Status,
		Visibility:        req.Visibility,
		PublicationStatus: req.PublicationStatus,
		VerificationScore: req.VerificationScore,
		HealthStatus:      req.HealthStatus,
		ProviderAccountID: req.ProviderAccountID,
		IsDefault:         req.IsDefault,
		Weight:            req.Weight,
	})
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrDomainNotFound), errors.Is(err, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to upsert domain"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteDomain(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	domainID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid domain id"})
		return
	}

	if err := c.service.DeleteDomain(ctx, actorID, domainID); err != nil {
		switch {
		case errors.Is(err, domain.ErrDomainNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		case errors.Is(err, ErrDomainHasMailboxes), errors.Is(err, ErrDomainHasChildren):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to delete domain"})
		}
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) VerifyDomain(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	domainID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid domain id"})
		return
	}

	result, err := c.service.VerifyDomain(ctx, actorID, domainID)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrDomainNotFound), errors.Is(err, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		case errors.Is(err, domain.ErrProviderAdapterUnavailable), errors.Is(err, domain.ErrInvalidDNSChangeSetRequest):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusBadGateway, gin.H{"message": err.Error()})
		}
		return
	}

	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) CreateDomainProvider(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	var req domain.CreateProviderAccountRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.CreateDomainProvider(ctx, actorID, req)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to create domain provider"})
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateDomainProvider(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid provider account id"})
		return
	}

	var req domain.CreateProviderAccountRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, updateErr := c.service.UpdateDomainProvider(ctx, actorID, providerAccountID, req)
	if updateErr != nil {
		switch {
		case errors.Is(updateErr, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": updateErr.Error()})
		case errors.Is(updateErr, ErrProviderAccountImmutableFieldsLocked):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": updateErr.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to update domain provider"})
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteDomainProvider(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid provider account id"})
		return
	}

	if err := c.service.DeleteDomainProvider(ctx, actorID, providerAccountID); err != nil {
		switch {
		case errors.Is(err, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		case errors.Is(err, ErrProviderAccountInUse):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to delete domain provider"})
		}
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) ValidateDomainProvider(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid provider account id"})
		return
	}

	item, validateErr := c.service.ValidateDomainProvider(ctx, actorID, providerAccountID)
	if validateErr != nil {
		switch {
		case errors.Is(validateErr, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": validateErr.Error()})
		case errors.Is(validateErr, domain.ErrProviderAdapterUnavailable):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": validateErr.Error()})
		default:
			ctx.JSON(http.StatusBadGateway, gin.H{"message": validateErr.Error()})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListDomainProviderZones(ctx *gin.Context) {
	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid provider account id"})
		return
	}

	items, listErr := c.service.ListDomainProviderZones(ctx, providerAccountID)
	if listErr != nil {
		switch {
		case errors.Is(listErr, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": listErr.Error()})
		case errors.Is(listErr, domain.ErrProviderAdapterUnavailable):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": listErr.Error()})
		default:
			ctx.JSON(http.StatusBadGateway, gin.H{"message": listErr.Error()})
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListDomainProviderRecords(ctx *gin.Context) {
	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid provider account id"})
		return
	}

	items, listErr := c.service.ListDomainProviderRecords(ctx, providerAccountID, ctx.Param("zoneId"))
	if listErr != nil {
		switch {
		case errors.Is(listErr, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": listErr.Error()})
		case errors.Is(listErr, domain.ErrProviderAdapterUnavailable):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": listErr.Error()})
		default:
			ctx.JSON(http.StatusBadGateway, gin.H{"message": listErr.Error()})
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListDomainProviderChangeSets(ctx *gin.Context) {
	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid provider account id"})
		return
	}

	items, listErr := c.service.ListDomainProviderChangeSets(ctx, providerAccountID, ctx.Param("zoneId"))
	if listErr != nil {
		switch {
		case errors.Is(listErr, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": listErr.Error()})
		case errors.Is(listErr, domain.ErrProviderAdapterUnavailable):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": listErr.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list provider change sets"})
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListDomainProviderVerifications(ctx *gin.Context) {
	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid provider account id"})
		return
	}

	items, listErr := c.service.ListDomainProviderVerifications(ctx, providerAccountID, ctx.Param("zoneId"), ctx.Query("zoneName"))
	if listErr != nil {
		switch {
		case errors.Is(listErr, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": listErr.Error()})
		case errors.Is(listErr, domain.ErrProviderAdapterUnavailable), errors.Is(listErr, domain.ErrInvalidDNSChangeSetRequest):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": listErr.Error()})
		default:
			ctx.JSON(http.StatusBadGateway, gin.H{"message": listErr.Error()})
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) PreviewDomainProviderChangeSet(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid provider account id"})
		return
	}

	var req domain.PreviewProviderChangeSetRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, previewErr := c.service.PreviewDomainProviderChangeSet(ctx, actorID, providerAccountID, ctx.Param("zoneId"), req)
	if previewErr != nil {
		switch {
		case errors.Is(previewErr, domain.ErrProviderAccountNotFound), errors.Is(previewErr, domain.ErrDNSChangeSetNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": previewErr.Error()})
		case errors.Is(previewErr, domain.ErrProviderAdapterUnavailable), errors.Is(previewErr, domain.ErrInvalidDNSChangeSetRequest), errors.Is(previewErr, domain.ErrUnsupportedDNSRecordType):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": previewErr.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to preview provider change set"})
		}
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) ApplyDomainProviderChangeSet(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	changeSetID, err := strconv.ParseUint(ctx.Param("changeSetId"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid change set id"})
		return
	}

	item, applyErr := c.service.ApplyDomainProviderChangeSet(ctx, actorID, changeSetID)
	if applyErr != nil {
		switch {
		case errors.Is(applyErr, domain.ErrDNSChangeSetNotFound), errors.Is(applyErr, domain.ErrProviderAccountNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": applyErr.Error()})
		case errors.Is(applyErr, domain.ErrProviderAdapterUnavailable), errors.Is(applyErr, domain.ErrInvalidDNSChangeSetRequest), errors.Is(applyErr, domain.ErrUnsupportedDNSRecordType):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": applyErr.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to apply provider change set"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ReviewDomainPublication(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	domainID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid domain id"})
		return
	}

	var req struct {
		Decision string `json:"decision"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, reviewErr := c.service.ReviewDomainPublication(ctx, actorID, domainID, req.Decision)
	if reviewErr != nil {
		switch {
		case errors.Is(reviewErr, domain.ErrDomainNotFound):
			ctx.JSON(http.StatusNotFound, gin.H{"message": reviewErr.Error()})
		case errors.Is(reviewErr, ErrInvalidDomainReviewDecision):
			ctx.JSON(http.StatusBadRequest, gin.H{"message": reviewErr.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to review domain publication"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func currentUserID(ctx *gin.Context) (uint64, bool) {
	value, exists := ctx.Get("auth.userID")
	if !exists {
		return 0, false
	}
	userID, ok := value.(uint64)
	return userID, ok
}

func parseAdminParamID(ctx *gin.Context, key string) (uint64, bool) {
	value, err := strconv.ParseUint(ctx.Param(key), 10, 64)
	if err != nil {
		return 0, false
	}
	return value, true
}

func parseAdminMailboxID(ctx *gin.Context) (uint64, bool) {
	if value := ctx.Param("mailboxId"); value != "" {
		id, err := strconv.ParseUint(value, 10, 64)
		if err == nil {
			return id, true
		}
	}
	return parseAdminParamID(ctx, "id")
}

func writeAdminDownload(ctx *gin.Context, download message.Download) {
	contentType := download.ContentType
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	disposition := mime.FormatMediaType("attachment", map[string]string{"filename": download.FileName})
	if disposition == "" {
		disposition = fmt.Sprintf("attachment; filename=%q", download.FileName)
	}

	ctx.Header("Content-Type", contentType)
	ctx.Header("Content-Disposition", disposition)
	ctx.Data(http.StatusOK, contentType, download.Content)
}
