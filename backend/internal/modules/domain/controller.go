package domain

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/middleware"
	"shiro-email/backend/internal/modules/portal"
	"shiro-email/backend/internal/shared/apierror"
)

type Controller struct {
	service *Service
}

func NewController(service *Service) *Controller {
	return &Controller{service: service}
}

func (c *Controller) List(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	items, err := c.service.ListAccessibleActive(ctx, userID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrDomainListFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) Create(ctx *gin.Context) {
	var req CreateDomainRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	item, err := c.service.CreateOwned(ctx, userID, req, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrInvalidDomain):
			apierror.AbortWithMessage(ctx, apierror.ErrDomainInvalid, err.Error())
		case errors.Is(err, ErrDomainAlreadyExists):
			apierror.Abort(ctx, apierror.ErrDomainAlreadyExists)
		default:
			apierror.Abort(ctx, apierror.ErrDomainCreateFailed)
		}
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) Generate(ctx *gin.Context) {
	var req GenerateSubdomainsRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	items, err := c.service.GenerateOwnedSubdomains(ctx, userID, req, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrInvalidDomain):
			apierror.AbortWithMessage(ctx, apierror.ErrDomainInvalid, err.Error())
		case errors.Is(err, ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		default:
			apierror.Abort(ctx, apierror.ErrDomainGenerateFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) Delete(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	domainID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	if err := c.service.DeleteOwned(ctx, userID, domainID); err != nil {
		switch {
		case errors.Is(err, ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, ErrDomainHasChildren):
			apierror.Abort(ctx, apierror.ErrDomainHasChildren)
		case errors.Is(err, ErrDomainHasMailboxes):
			apierror.Abort(ctx, apierror.ErrDomainHasMailboxes)
		default:
			apierror.Abort(ctx, apierror.ErrDomainDeleteFailed)
		}
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) UpdateOwnedProviderBinding(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	domainID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req UpdateOwnedDomainProviderBindingRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UpdateOwnedDomainProviderBinding(ctx, userID, domainID, req, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		default:
			apierror.Abort(ctx, apierror.ErrProviderUpdateFailed)
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) VerifyOwnedDomain(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	domainID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	result, err := c.service.VerifyOwnedDomain(ctx, userID, domainID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		case errors.Is(err, ErrInvalidDNSChangeSetRequest):
			apierror.Abort(ctx, apierror.ErrDNSInvalidRequest)
		default:
			apierror.AbortWithMessage(ctx, apierror.ErrDomainVerifyFailed, err.Error())
		}
		return
	}

	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) GenerateAdmin(ctx *gin.Context) {
	var req GenerateSubdomainsRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, err := c.service.GenerateSubdomains(ctx, req)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidDomain):
			apierror.AbortWithMessage(ctx, apierror.ErrDomainInvalid, err.Error())
		case errors.Is(err, ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		default:
			apierror.Abort(ctx, apierror.ErrDomainGenerateFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) RequestPublicPoolPublication(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	domainID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.RequestPublicPoolPublication(ctx, userID, domainID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, ErrInvalidPublicationState):
			apierror.Abort(ctx, apierror.ErrDomainInvalidPublication)
		default:
			apierror.Abort(ctx, apierror.ErrDomainPublicationFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) WithdrawPublicPoolPublication(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	domainID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.WithdrawPublicPoolPublication(ctx, userID, domainID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrDomainNotFound):
			apierror.Abort(ctx, apierror.ErrDomainNotFound)
		case errors.Is(err, ErrInvalidPublicationState):
			apierror.Abort(ctx, apierror.ErrDomainInvalidPublication)
		default:
			apierror.Abort(ctx, apierror.ErrDomainPublicationFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListOwnedProviderAccounts(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	items, err := c.service.ListOwnedProviderAccounts(ctx, userID)
	if err != nil {
		apierror.AbortWithMessage(ctx, apierror.ErrProviderCreateFailed, "failed to list provider accounts")
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) CreateOwnedProviderAccount(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req CreateProviderAccountRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.CreateOwnedProviderAccount(ctx, userID, req)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrProviderCreateFailed)
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) UpdateOwnedProviderAccount(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req CreateProviderAccountRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UpdateOwnedProviderAccount(ctx, userID, providerAccountID, req)
	if err != nil {
		switch {
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAccountImmutableFieldsLocked):
			apierror.Abort(ctx, apierror.ErrProviderImmutableFields)
		default:
			apierror.Abort(ctx, apierror.ErrProviderUpdateFailed)
		}
		return
	}

	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteOwnedProviderAccount(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	if err := c.service.DeleteOwnedProviderAccount(ctx, userID, providerAccountID); err != nil {
		switch {
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAccountInUse):
			apierror.Abort(ctx, apierror.ErrProviderAccountInUse)
		default:
			apierror.Abort(ctx, apierror.ErrProviderDeleteFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) ValidateOwnedProviderAccount(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.ValidateOwnedProviderAccount(ctx, userID, providerAccountID)
	if err != nil {
		switch {
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		default:
			apierror.Abort(ctx, apierror.ErrProviderValidateFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListOwnedProviderZones(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, err := c.service.ListOwnedProviderZones(ctx, userID, providerAccountID)
	if err != nil {
		switch {
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		default:
			apierror.Abort(ctx, apierror.ErrProviderZonesFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListOwnedProviderRecords(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, err := c.service.ListOwnedProviderRecords(ctx, userID, providerAccountID, ctx.Param("zoneId"))
	if err != nil {
		switch {
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		default:
			apierror.Abort(ctx, apierror.ErrProviderRecordsFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListOwnedProviderChangeSets(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, err := c.service.ListOwnedProviderChangeSets(ctx, userID, providerAccountID, ctx.Param("zoneId"))
	if err != nil {
		switch {
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		default:
			apierror.Abort(ctx, apierror.ErrDNSChangeSetListFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListOwnedProviderVerifications(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, err := c.service.PreviewOwnedProviderVerifications(ctx, userID, providerAccountID, ctx.Param("zoneId"), ctx.Query("zoneName"))
	if err != nil {
		switch {
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		case errors.Is(err, ErrInvalidDNSChangeSetRequest):
			apierror.Abort(ctx, apierror.ErrDNSInvalidRequest)
		default:
			apierror.Abort(ctx, apierror.ErrDNSVerificationListFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) PreviewOwnedProviderChangeSet(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	providerAccountID, ok := domainIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req PreviewProviderChangeSetRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.PreviewOwnedProviderChangeSet(ctx, userID, providerAccountID, ctx.Param("zoneId"), req)
	if err != nil {
		switch {
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrDNSChangeSetNotFound):
			apierror.Abort(ctx, apierror.ErrDNSChangeSetNotFound)
		case errors.Is(err, ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		case errors.Is(err, ErrInvalidDNSChangeSetRequest):
			apierror.Abort(ctx, apierror.ErrDNSInvalidRequest)
		case errors.Is(err, ErrUnsupportedDNSRecordType):
			apierror.Abort(ctx, apierror.ErrDNSUnsupportedRecordType)
		default:
			apierror.Abort(ctx, apierror.ErrDNSChangeSetPreviewFailed)
		}
		return
	}
	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) ApplyOwnedProviderChangeSet(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	changeSetID, ok := changeSetIDFromParam(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.ApplyOwnedProviderChangeSet(ctx, userID, changeSetID)
	if err != nil {
		switch {
		case errors.Is(err, ErrDNSChangeSetNotFound):
			apierror.Abort(ctx, apierror.ErrDNSChangeSetNotFound)
		case errors.Is(err, ErrProviderAccountNotFound):
			apierror.Abort(ctx, apierror.ErrProviderAccountNotFound)
		case errors.Is(err, ErrProviderAdapterUnavailable):
			apierror.Abort(ctx, apierror.ErrProviderAdapterUnavailable)
		case errors.Is(err, ErrInvalidDNSChangeSetRequest):
			apierror.Abort(ctx, apierror.ErrDNSInvalidRequest)
		case errors.Is(err, ErrUnsupportedDNSRecordType):
			apierror.Abort(ctx, apierror.ErrDNSUnsupportedRecordType)
		default:
			apierror.Abort(ctx, apierror.ErrDNSChangeSetApplyFailed)
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

func domainIDFromParam(ctx *gin.Context) (uint64, bool) {
	id, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		return 0, false
	}
	return id, true
}

func changeSetIDFromParam(ctx *gin.Context) (uint64, bool) {
	id, err := strconv.ParseUint(ctx.Param("changeSetId"), 10, 64)
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
