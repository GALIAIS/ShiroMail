package admin

import (
	"encoding/csv"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/modules/auth"
	"shiro-email/backend/internal/modules/domain"
	"shiro-email/backend/internal/modules/mailbox"
	"shiro-email/backend/internal/modules/message"
	"shiro-email/backend/internal/modules/portal"
	"shiro-email/backend/internal/shared/apierror"
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
		apierror.Abort(ctx, apierror.ErrAdminOverviewFailed)
		return
	}
	ctx.JSON(http.StatusOK, payload)
}

func (c *Controller) ListUsers(ctx *gin.Context) {
	items, err := c.service.ListUsers(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list users"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) GetUserDetail(ctx *gin.Context) {
	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	detail, err := c.service.GetUserDetail(ctx, userID)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrUserNotFound)
		return
	}
	ctx.JSON(http.StatusOK, detail)
}

func (c *Controller) UpdateUserRoles(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req struct {
		Roles []string `json:"roles"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UpdateUserRoles(ctx, actorID, userID, req.Roles)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			apierror.Abort(ctx, apierror.ErrUserNotFound)
		case errors.Is(err, ErrInvalidUserRoles):
			apierror.Abort(ctx, apierror.ErrAdminInvalidUserRoles)
		case errors.Is(err, ErrCannotRemoveOwnAdminRole):
			apierror.Abort(ctx, apierror.ErrAdminCannotRemoveOwnRole)
		case errors.Is(err, ErrCannotRemoveLastAdminRole):
			apierror.Abort(ctx, apierror.ErrAdminCannotRemoveLastRole)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to update user roles"))
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) UpdateUser(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
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
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
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
			apierror.Abort(ctx, apierror.ErrUserNotFound)
		case errors.Is(err, ErrInvalidUserRoles):
			apierror.Abort(ctx, apierror.ErrAdminInvalidUserRoles)
		case errors.Is(err, ErrInvalidUserProfile):
			apierror.Abort(ctx, apierror.ErrAdminInvalidUserProfile)
		case errors.Is(err, ErrCannotRemoveOwnAdminRole):
			apierror.Abort(ctx, apierror.ErrAdminCannotRemoveOwnRole)
		case errors.Is(err, ErrCannotRemoveLastAdminRole):
			apierror.Abort(ctx, apierror.ErrAdminCannotRemoveLastRole)
		case err.Error() == "username already exists":
			apierror.Abort(ctx, apierror.ErrAdminUsernameExists)
		case err.Error() == "email already exists":
			apierror.Abort(ctx, apierror.ErrAdminEmailExists)
		default:
			apierror.Abort(ctx, apierror.InternalError(err.Error()))
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteUser(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	if err := c.service.DeleteUser(ctx, actorID, userID); err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			apierror.Abort(ctx, apierror.ErrUserNotFound)
		case errors.Is(err, ErrCannotDeleteOwnAccount):
			apierror.Abort(ctx, apierror.ErrAdminCannotDeleteSelf)
		case errors.Is(err, ErrCannotDeleteLastAdmin):
			apierror.Abort(ctx, apierror.ErrAdminCannotDeleteLastAdmin)
		case errors.Is(err, ErrUserHasMailboxes):
			apierror.Abort(ctx, apierror.ErrAdminUserHasMailboxes)
		case errors.Is(err, ErrUserOwnsDomains):
			apierror.Abort(ctx, apierror.ErrAdminUserOwnsDomains)
		case errors.Is(err, ErrUserOwnsProviderAccounts):
			apierror.Abort(ctx, apierror.ErrAdminUserOwnsProviders)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to delete user"))
		}
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) BanUser(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
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
			apierror.Abort(ctx, apierror.ErrUserNotFound)
		case errors.Is(err, ErrCannotBanSelf):
			apierror.Abort(ctx, apierror.ErrAdminCannotBanSelf)
		case errors.Is(err, ErrCannotBanAdmin):
			apierror.Abort(ctx, apierror.ErrAdminCannotBanAdmin)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to ban user"))
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) UnbanUser(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	userID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UnbanUser(ctx, actorID, userID)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			apierror.Abort(ctx, apierror.ErrUserNotFound)
		case errors.Is(err, ErrInvalidUserProfile):
			apierror.Abort(ctx, apierror.ErrAdminInvalidUserProfile)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to unban user"))
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) BatchUserAction(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req struct {
		IDs    []uint64 `json:"ids"`
		Action string   `json:"action"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	if len(req.IDs) == 0 {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	switch req.Action {
	case "ban", "unban", "delete":
	default:
		apierror.Abort(ctx, apierror.ErrAdminBatchActionInvalid)
		return
	}

	result := c.service.BatchUserAction(ctx, actorID, req.IDs, req.Action)
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) ListDomains(ctx *gin.Context) {
	items, err := c.service.ListDomains(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list domains"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListDomainProviders(ctx *gin.Context) {
	items, err := c.service.ListDomainProviders(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list domain providers"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListMailboxes(ctx *gin.Context) {
	items, err := c.service.ListMailboxes(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list mailboxes"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListMailboxDomains(ctx *gin.Context) {
	items, err := c.service.ListMailboxDomains(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list mailbox domains"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateMailbox(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req struct {
		UserID uint64 `json:"userId" binding:"required"`
		mailbox.CreateMailboxRequest
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.CreateMailbox(ctx, actorID, req.UserID, req.CreateMailboxRequest)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			apierror.Abort(ctx, apierror.ErrUserNotFound)
		case errors.Is(err, domain.ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, mailbox.ErrAddressConflict):
			apierror.Abort(ctx, apierror.ErrMailboxAddressConflict)
		case errors.Is(err, mailbox.ErrInvalidMailboxTTL):
			apierror.Abort(ctx, apierror.ErrMailboxInvalidTTL)
		case errors.Is(err, mailbox.ErrInvalidLocalPart):
			apierror.Abort(ctx, apierror.ErrMailboxInvalidLocalPart)
		case errors.Is(err, mailbox.ErrDomainVerificationRequired):
			apierror.Abort(ctx, apierror.ErrMailboxDomainVerification)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to create mailbox"))
		}
		return
	}

	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) ExtendMailbox(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	mailboxID, ok := parseAdminMailboxID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req mailbox.ExtendMailboxRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.ExtendMailbox(ctx, actorID, mailboxID, req.ExpiresInHours)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		case errors.Is(err, mailbox.ErrInvalidMailboxTTL):
			apierror.Abort(ctx, apierror.ErrMailboxInvalidTTL)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to extend mailbox"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ReleaseMailbox(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	mailboxID, ok := parseAdminMailboxID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.ReleaseMailbox(ctx, actorID, mailboxID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to release mailbox"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListMessages(ctx *gin.Context) {
	items, err := c.service.ListMessages(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list messages"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListMailboxMessages(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, err := c.service.ListMailboxMessages(ctx, mailboxID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to list mailbox messages"))
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) MailboxMessageDetail(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	messageID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.GetMailboxMessage(ctx, mailboxID, messageID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		case errors.Is(err, message.ErrMessageDeleted):
			apierror.Abort(ctx, apierror.ErrMessageDeleted)
		case message.IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to load mailbox message"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) MailboxMessageRaw(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	messageID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	download, err := c.service.DownloadMailboxMessageRaw(ctx, mailboxID, messageID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		case errors.Is(err, message.ErrMessageDeleted):
			apierror.Abort(ctx, apierror.ErrMessageDeleted)
		case errors.Is(err, message.ErrMessageContentUnavailable):
			apierror.Abort(ctx, apierror.ErrMessageContentUnavailable)
		case message.IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to load raw mailbox message"))
		}
		return
	}
	writeAdminDownload(ctx, download)
}

func (c *Controller) MailboxMessageParsedRaw(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	messageID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	parsed, err := c.service.ParseMailboxMessageRaw(ctx, mailboxID, messageID)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		case errors.Is(err, message.ErrMessageDeleted):
			apierror.Abort(ctx, apierror.ErrMessageDeleted)
		case errors.Is(err, message.ErrMessageContentUnavailable):
			apierror.Abort(ctx, apierror.ErrMessageContentUnavailable)
		case message.IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to parse raw mailbox message"))
		}
		return
	}
	ctx.JSON(http.StatusOK, parsed)
}

func (c *Controller) MailboxMessageAttachment(ctx *gin.Context) {
	mailboxID, ok := parseAdminParamID(ctx, "mailboxId")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	messageID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	attachmentIndex, err := strconv.Atoi(ctx.Param("index"))
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	download, err := c.service.DownloadMailboxMessageAttachment(ctx, mailboxID, messageID, attachmentIndex)
	if err != nil {
		switch {
		case errors.Is(err, mailbox.ErrMailboxNotFound):
			apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		case errors.Is(err, message.ErrMessageDeleted):
			apierror.Abort(ctx, apierror.ErrMessageDeleted)
		case errors.Is(err, message.ErrAttachmentNotFound):
			apierror.Abort(ctx, apierror.ErrAttachmentNotFound)
		case errors.Is(err, message.ErrMessageContentUnavailable):
			apierror.Abort(ctx, apierror.ErrMessageContentUnavailable)
		case message.IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to load mailbox attachment"))
		}
		return
	}
	writeAdminDownload(ctx, download)
}

func (c *Controller) ListAPIKeys(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	items, err := c.service.ListAPIKeys(ctx, actorID)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list api keys"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateAPIKey(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req struct {
		Name           string                       `json:"name"`
		Scopes         []string                     `json:"scopes"`
		ExpiresAt      *time.Time                   `json:"expiresAt"`
		ResourcePolicy portal.APIKeyResourcePolicy  `json:"resourcePolicy"`
		DomainBindings []portal.APIKeyDomainBinding `json:"domainBindings"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.CreateAPIKey(ctx, actorID, portal.CreateAPIKeyInput{
		Name:           req.Name,
		Scopes:         req.Scopes,
		ExpiresAt:      req.ExpiresAt,
		ResourcePolicy: req.ResourcePolicy,
		DomainBindings: req.DomainBindings,
	})
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to create api key"))
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) RotateAPIKey(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	apiKeyID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.RotateAPIKey(ctx, actorID, apiKeyID)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrNotFound):
			apierror.Abort(ctx, apierror.ErrPortalNotFound)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to rotate api key"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) RevokeAPIKey(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	apiKeyID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.RevokeAPIKey(ctx, actorID, apiKeyID)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrNotFound):
			apierror.Abort(ctx, apierror.ErrPortalNotFound)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to revoke api key"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListWebhooks(ctx *gin.Context) {
	items, err := c.service.ListWebhooks(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list webhooks"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateWebhook(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req struct {
		UserID    uint64   `json:"userId"`
		Name      string   `json:"name"`
		TargetURL string   `json:"targetUrl"`
		Events    []string `json:"events"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.CreateWebhook(ctx, actorID, req.UserID, req.Name, req.TargetURL, req.Events)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrUserNotFound):
			apierror.Abort(ctx, apierror.ErrUserNotFound)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to create webhook"))
		}
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateWebhook(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	webhookID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req struct {
		Name      string   `json:"name"`
		TargetURL string   `json:"targetUrl"`
		Events    []string `json:"events"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UpdateWebhook(ctx, actorID, webhookID, req.Name, req.TargetURL, req.Events)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrNotFound):
			apierror.Abort(ctx, apierror.ErrPortalNotFound)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to update webhook"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ToggleWebhook(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	webhookID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.ToggleWebhook(ctx, actorID, webhookID, req.Enabled)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrNotFound):
			apierror.Abort(ctx, apierror.ErrPortalNotFound)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to toggle webhook"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListNotices(ctx *gin.Context) {
	items, err := c.service.ListNotices(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list notices"))
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
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	item, err := c.service.CreateNotice(ctx, req.Title, req.Body, req.Category, req.Level)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to create notice"))
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateNotice(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	noticeID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req struct {
		Title    string `json:"title"`
		Body     string `json:"body"`
		Category string `json:"category"`
		Level    string `json:"level"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UpdateNotice(ctx, actorID, noticeID, req.Title, req.Body, req.Category, req.Level)
	if err != nil {
		if errors.Is(err, portal.ErrNotFound) {
			apierror.Abort(ctx, apierror.ErrPortalNotFound)
			return
		}
		apierror.Abort(ctx, apierror.InternalError("failed to update notice"))
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteNotice(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	noticeID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	if err := c.service.DeleteNotice(ctx, actorID, noticeID); err != nil {
		if errors.Is(err, portal.ErrNotFound) {
			apierror.Abort(ctx, apierror.ErrPortalNotFound)
			return
		}
		apierror.Abort(ctx, apierror.InternalError("failed to delete notice"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) ListDocs(ctx *gin.Context) {
	items, err := c.service.ListDocs(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list docs"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateDoc(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
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
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.CreateDoc(ctx, actorID, req.Title, req.Category, req.Summary, req.ReadTimeMin, req.Tags)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to create doc"))
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateDoc(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
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
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UpdateDoc(ctx, actorID, ctx.Param("id"), req.Title, req.Category, req.Summary, req.ReadTimeMin, req.Tags)
	if err != nil {
		if errors.Is(err, portal.ErrNotFound) {
			apierror.Abort(ctx, apierror.ErrPortalNotFound)
			return
		}
		apierror.Abort(ctx, apierror.InternalError("failed to update doc"))
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteDoc(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	if err := c.service.DeleteDoc(ctx, actorID, ctx.Param("id")); err != nil {
		if errors.Is(err, portal.ErrNotFound) {
			apierror.Abort(ctx, apierror.ErrPortalNotFound)
			return
		}
		apierror.Abort(ctx, apierror.InternalError("failed to delete doc"))
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) UpsertDomain(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
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
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
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
		case errors.Is(err, domain.ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to upsert domain"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteDomain(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	domainID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	if err := c.service.DeleteDomain(ctx, actorID, domainID); err != nil {
		switch {
		case errors.Is(err, domain.ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, ErrDomainHasMailboxes):
			apierror.Abort(ctx, apierror.ErrAdminDomainHasMailboxes)
		case errors.Is(err, ErrDomainHasChildren):
			apierror.Abort(ctx, apierror.ErrAdminDomainHasChildren)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to delete domain"))
		}
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) VerifyDomain(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	domainID, ok := parseAdminParamID(ctx, "id")
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	result, err := c.service.VerifyDomain(ctx, actorID, domainID)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, domain.ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		case errors.Is(err, domain.ErrInvalidDNSChangeSetRequest):
			apierror.Abort(ctx, apierror.ErrDNSInvalidRequest)
		default:
			apierror.Abort(ctx, apierror.ErrDomainVerifyFailed)
		}
		return
	}

	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) CreateDomainProvider(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req domain.CreateProviderAccountRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.CreateDomainProvider(ctx, actorID, req)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to create domain provider"))
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateDomainProvider(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req domain.CreateProviderAccountRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, updateErr := c.service.UpdateDomainProvider(ctx, actorID, providerAccountID, req)
	if updateErr != nil {
		switch {
		case errors.Is(updateErr, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(updateErr, ErrProviderAccountImmutableFieldsLocked):
			apierror.Abort(ctx, apierror.ErrAdminProviderImmutable)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to update domain provider"))
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteDomainProvider(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	if err := c.service.DeleteDomainProvider(ctx, actorID, providerAccountID); err != nil {
		switch {
		case errors.Is(err, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAccountInUse):
			apierror.Abort(ctx, apierror.ErrAdminProviderInUse)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to delete domain provider"))
		}
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) ValidateDomainProvider(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, validateErr := c.service.ValidateDomainProvider(ctx, actorID, providerAccountID)
	if validateErr != nil {
		switch {
		case errors.Is(validateErr, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(validateErr, domain.ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		default:
			apierror.Abort(ctx, apierror.ErrDomainVerifyFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListDomainProviderZones(ctx *gin.Context) {
	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, listErr := c.service.ListDomainProviderZones(ctx, providerAccountID)
	if listErr != nil {
		switch {
		case errors.Is(listErr, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(listErr, domain.ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		default:
			apierror.Abort(ctx, apierror.ErrDomainVerifyFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListDomainProviderRecords(ctx *gin.Context) {
	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, listErr := c.service.ListDomainProviderRecords(ctx, providerAccountID, ctx.Param("zoneId"))
	if listErr != nil {
		switch {
		case errors.Is(listErr, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(listErr, domain.ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		default:
			apierror.Abort(ctx, apierror.ErrDomainVerifyFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListDomainProviderChangeSets(ctx *gin.Context) {
	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, listErr := c.service.ListDomainProviderChangeSets(ctx, providerAccountID, ctx.Param("zoneId"))
	if listErr != nil {
		switch {
		case errors.Is(listErr, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(listErr, domain.ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to list provider change sets"))
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListDomainProviderVerifications(ctx *gin.Context) {
	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, listErr := c.service.ListDomainProviderVerifications(ctx, providerAccountID, ctx.Param("zoneId"), ctx.Query("zoneName"))
	if listErr != nil {
		switch {
		case errors.Is(listErr, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(listErr, domain.ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		case errors.Is(listErr, domain.ErrInvalidDNSChangeSetRequest):
			apierror.Abort(ctx, apierror.ErrDNSInvalidRequest)
		default:
			apierror.Abort(ctx, apierror.ErrDomainVerifyFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) PreviewDomainProviderChangeSet(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req domain.PreviewProviderChangeSetRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, previewErr := c.service.PreviewDomainProviderChangeSet(ctx, actorID, providerAccountID, ctx.Param("zoneId"), req)
	if previewErr != nil {
		switch {
		case errors.Is(previewErr, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(previewErr, domain.ErrDNSChangeSetNotFound):
			apierror.Abort(ctx, apierror.ErrDNSChangeSetNotFound)
		case errors.Is(previewErr, domain.ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		case errors.Is(previewErr, domain.ErrInvalidDNSChangeSetRequest):
			apierror.Abort(ctx, apierror.ErrDNSInvalidRequest)
		case errors.Is(previewErr, domain.ErrUnsupportedDNSRecordType):
			apierror.Abort(ctx, apierror.ErrDNSUnsupportedRecordType)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to preview provider change set"))
		}
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) ApplyDomainProviderChangeSet(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	changeSetID, err := strconv.ParseUint(ctx.Param("changeSetId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, applyErr := c.service.ApplyDomainProviderChangeSet(ctx, actorID, changeSetID)
	if applyErr != nil {
		switch {
		case errors.Is(applyErr, domain.ErrDNSChangeSetNotFound):
			apierror.Abort(ctx, apierror.ErrDNSChangeSetNotFound)
		case errors.Is(applyErr, domain.ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(applyErr, domain.ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		case errors.Is(applyErr, domain.ErrInvalidDNSChangeSetRequest):
			apierror.Abort(ctx, apierror.ErrDNSInvalidRequest)
		case errors.Is(applyErr, domain.ErrUnsupportedDNSRecordType):
			apierror.Abort(ctx, apierror.ErrDNSUnsupportedRecordType)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to apply provider change set"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ReviewDomainPublication(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	domainID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req struct {
		Decision string `json:"decision"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, reviewErr := c.service.ReviewDomainPublication(ctx, actorID, domainID, req.Decision)
	if reviewErr != nil {
		switch {
		case errors.Is(reviewErr, domain.ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(reviewErr, ErrInvalidDomainReviewDecision):
			apierror.Abort(ctx, apierror.ErrAdminInvalidReviewDecision)
		default:
			apierror.Abort(ctx, apierror.InternalError("failed to review domain publication"))
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ExportUsersCSV(ctx *gin.Context) {
	items, err := c.service.ListUsers(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to export users"))
		return
	}

	ctx.Header("Content-Type", "text/csv; charset=utf-8")
	ctx.Header("Content-Disposition", `attachment; filename="users.csv"`)
	ctx.Writer.WriteHeader(http.StatusOK)

	writer := csv.NewWriter(ctx.Writer)
	_ = writer.Write([]string{"id", "username", "email", "roles", "status", "email_verified", "mailbox_count"})
	for _, item := range items {
		_ = writer.Write([]string{
			strconv.FormatUint(item.ID, 10),
			item.Username,
			item.Email,
			joinRoles(item.Roles),
			item.Status,
			strconv.FormatBool(item.EmailVerified),
			strconv.Itoa(item.Mailboxes),
		})
	}
	writer.Flush()
}

func (c *Controller) ExportStatsCSV(ctx *gin.Context) {
	stats, err := c.service.ExportDailyStats(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to export stats"))
		return
	}

	ctx.Header("Content-Type", "text/csv; charset=utf-8")
	ctx.Header("Content-Disposition", `attachment; filename="stats.csv"`)
	ctx.Writer.WriteHeader(http.StatusOK)

	writer := csv.NewWriter(ctx.Writer)
	_ = writer.Write([]string{"date", "total_messages", "active_users", "active_mailboxes"})
	for _, item := range stats {
		_ = writer.Write([]string{
			item.Date,
			strconv.Itoa(item.TotalMessages),
			strconv.Itoa(item.ActiveUsers),
			strconv.Itoa(item.ActiveMailboxes),
		})
	}
	writer.Flush()
}

func joinRoles(roles []string) string {
	if len(roles) == 0 {
		return ""
	}
	result := roles[0]
	for _, role := range roles[1:] {
		result += "," + role
	}
	return result
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
