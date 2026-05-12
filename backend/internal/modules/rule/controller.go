package rule

import (
	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/shared/apierror"
)

type Controller struct {
	service *Service
}

func NewController(service *Service) *Controller {
	return &Controller{service: service}
}

func (c *Controller) List(ctx *gin.Context) {
	items, err := c.service.List(ctx)
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to list rules"))
		return
	}
	ctx.JSON(200, gin.H{"items": items})
}

func (c *Controller) Upsert(ctx *gin.Context) {
	actorID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req struct {
		Name           string `json:"name"`
		RetentionHours int    `json:"retentionHours"`
		AutoExtend     bool   `json:"autoExtend"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.Upsert(ctx, actorID, Rule{
		ID:             ctx.Param("id"),
		Name:           req.Name,
		RetentionHours: req.RetentionHours,
		AutoExtend:     req.AutoExtend,
	})
	if err != nil {
		apierror.Abort(ctx, apierror.InternalError("failed to upsert rule"))
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
