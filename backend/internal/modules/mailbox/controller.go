package mailbox

import (
	"errors"
	"strconv"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/middleware"
	"shiro-email/backend/internal/modules/domain"
	"shiro-email/backend/internal/modules/portal"
	"shiro-email/backend/internal/shared/apierror"
)

type Controller struct {
	service *Service
}

func NewController(service *Service) *Controller {
	return &Controller{service: service}
}

func (c *Controller) Dashboard(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	payload, err := c.service.BuildDashboard(ctx, userID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxDashboardFailed)
		return
	}
	ctx.JSON(200, payload)
}

func (c *Controller) List(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	items, err := c.service.ListMailboxes(ctx, userID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxListFailed)
		return
	}
	ctx.JSON(200, gin.H{"items": items})
}

func (c *Controller) Create(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req CreateMailboxRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.CreateMailbox(ctx, userID, req, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrInvalidMailboxTTL):
			apierror.AbortWithMessage(ctx, apierror.ErrMailboxInvalidTTL, err.Error())
		case errors.Is(err, ErrInvalidLocalPart):
			apierror.AbortWithMessage(ctx, apierror.ErrMailboxInvalidLocalPart, err.Error())
		case errors.Is(err, ErrDomainVerificationRequired):
			apierror.AbortWithMessage(ctx, apierror.ErrMailboxDomainVerification, err.Error())
		case errors.Is(err, domain.ErrDomainNotFound):
			apierror.AbortWithMessage(ctx, apierror.ErrDomainNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.ErrMailboxCreateFailed)
		}
		return
	}

	ctx.JSON(201, item)
}

func (c *Controller) Extend(ctx *gin.Context) {
	c.updateExpiry(ctx)
}

func (c *Controller) Release(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	mailboxID, ok := mailboxIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.ReleaseMailbox(ctx, userID, mailboxID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		if errors.Is(err, portal.ErrAPIKeyForbidden) {
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
			return
		}
		if errors.Is(err, ErrMailboxNotFound) {
			apierror.AbortWithMessage(ctx, apierror.ErrMailboxNotFound, err.Error())
			return
		}
		apierror.Abort(ctx, apierror.ErrMailboxReleaseFailed)
		return
	}
	ctx.JSON(200, item)
}

func (c *Controller) UpdateForwarding(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	mailboxID, ok := mailboxIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req UpdateForwardingRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UpdateForwarding(ctx, userID, mailboxID, req)
	if err != nil {
		if errors.Is(err, ErrMailboxNotFound) {
			apierror.AbortWithMessage(ctx, apierror.ErrMailboxNotFound, err.Error())
			return
		}
		apierror.Abort(ctx, apierror.ErrMailboxForwardingFailed)
		return
	}
	ctx.JSON(200, item)
}

func (c *Controller) updateExpiry(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	mailboxID, ok := mailboxIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req ExtendMailboxRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.ExtendMailbox(ctx, userID, mailboxID, req, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrInvalidMailboxTTL):
			apierror.AbortWithMessage(ctx, apierror.ErrMailboxInvalidTTL, err.Error())
		case errors.Is(err, ErrMailboxNotFound):
			apierror.AbortWithMessage(ctx, apierror.ErrMailboxNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.ErrMailboxExtendFailed)
		}
		return
	}
	ctx.JSON(200, item)
}

func currentUserID(ctx *gin.Context) (uint64, bool) {
	value, exists := ctx.Get("auth.userID")
	if !exists {
		return 0, false
	}
	userID, ok := value.(uint64)
	return userID, ok
}

func mailboxIDFromParam(ctx *gin.Context) (uint64, bool) {
	value := ctx.Param("mailboxId")
	if value == "" {
		value = ctx.Param("id")
	}
	id, err := strconv.ParseUint(value, 10, 64)
	if err != nil {
		return 0, false
	}
	return id, true
}

func currentAPIKeyArgs(ctx *gin.Context) []portal.APIKey {
	apiKey, ok := middleware.CurrentAPIKey(ctx)
	if !ok {
		return nil
	}
	return []portal.APIKey{apiKey}
}
