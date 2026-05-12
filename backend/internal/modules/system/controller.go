package system

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/shared/apierror"
)

type Controller struct {
	service *Service
}

func NewController(service *Service) *Controller {
	return &Controller{service: service}
}

func (c *Controller) ListConfigs(ctx *gin.Context) {
	items, err := c.service.ListConfigs(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemConfigListFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListSettingsSections(ctx *gin.Context) {
	items, err := c.service.ListSettingsSections(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemSettingsFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) PublicSiteSettings(ctx *gin.Context) {
	item, err := c.service.PublicSiteSettings(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemSettingsFailed)
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) PublicSiteStats(ctx *gin.Context) {
	item, err := c.service.PublicStats(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemMonitoringFailed)
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) APILimitsSettings(ctx *gin.Context) {
	item, err := c.service.APILimitsSettings(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemSettingsFailed)
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) UpsertConfig(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req struct {
		Value map[string]any `json:"value"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.UpsertConfig(ctx, actorID, ctx.Param("key"), req.Value)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemConfigUpsertFailed)
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) DeleteConfig(ctx *gin.Context) {
	key := ctx.Param("key")
	if err := c.service.DeleteConfig(ctx, key); err != nil {
		apierror.Abort(ctx, apierror.ErrSystemConfigDeleteFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "deleted", "key": key})
}

func (c *Controller) SendMailDeliveryTest(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req struct {
		To string `json:"to"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.SendMailDeliveryTest(ctx, actorID, req.To)
	if err != nil {
		diagnostic := DiagnoseMailDeliveryError(err)
		ctx.JSON(http.StatusBadRequest, gin.H{
			"code":      diagnostic.Code,
			"message":   err.Error(),
			"stage":     diagnostic.Stage,
			"hint":      diagnostic.Hint,
			"retryable": diagnostic.Retryable,
		})
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListJobs(ctx *gin.Context) {
	items, err := c.service.ListJobs(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemJobsFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListInboundSpool(ctx *gin.Context) {
	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("pageSize", "50"))
	result, err := c.service.ListInboundSpool(ctx, InboundSpoolListOptions{
		Status:      ctx.Query("status"),
		FailureMode: ctx.Query("failureMode"),
		Page:        page,
		PageSize:    pageSize,
	})
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemSpoolListFailed)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func (c *Controller) RetryInboundSpool(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	id, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil || id == 0 {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.RetryInboundSpool(ctx, actorID, id)
	if err != nil {
		switch {
		case errors.Is(err, ErrInboundSpoolUnavailable):
			apierror.Abort(ctx, apierror.ErrSystemSpoolUnavailable)
		case errors.Is(err, ErrInboundSpoolItemNotFound):
			apierror.Abort(ctx, apierror.ErrSystemSpoolItemNotFound)
		default:
			apierror.Abort(ctx, apierror.ErrSystemSpoolListFailed)
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) SMTPMetrics(ctx *gin.Context) {
	item, err := c.service.SMTPMetrics(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemSMTPMetricsFailed)
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) SystemMonitoring(ctx *gin.Context) {
	item, err := c.service.SystemMonitoring(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemMonitoringFailed)
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) ListAudit(ctx *gin.Context) {
	page, _ := strconv.Atoi(ctx.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(ctx.DefaultQuery("pageSize", "20"))
	action := ctx.Query("action")

	result, err := c.service.ListAuditPaginated(ctx, AuditListOptions{
		Page:   page,
		Size:   pageSize,
		Action: action,
	})
	if err != nil {
		apierror.Abort(ctx, apierror.ErrSystemAuditFailed)
		return
	}
	ctx.JSON(http.StatusOK, result)
}

func currentUserID(ctx *gin.Context) (uint64, bool) {
	value, exists := ctx.Get("auth.userID")
	if !exists {
		return 0, false
	}
	userID, ok := value.(uint64)
	return userID, ok
}
