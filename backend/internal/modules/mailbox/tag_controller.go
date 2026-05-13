package mailbox

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/shared/apierror"
)

type TagController struct {
	repo *TagRepository
}

func NewTagController(repo *TagRepository) *TagController {
	return &TagController{repo: repo}
}

func (c *TagController) List(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	tags, err := c.repo.ListByUser(ctx, userID)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxListFailed)
		return
	}
	bindings, err := c.repo.ListBindings(ctx, userID)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxListFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"tags": tags, "bindings": bindings})
}

func (c *TagController) Create(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	var req struct {
		Name  string `json:"name" binding:"required,max=50"`
		Color string `json:"color" binding:"required,max=7"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	tag, err := c.repo.Create(ctx, userID, req.Name, req.Color)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxCreateFailed)
		return
	}
	ctx.JSON(http.StatusCreated, tag)
}

func (c *TagController) Update(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	tagID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	var req struct {
		Name  string `json:"name" binding:"required,max=50"`
		Color string `json:"color" binding:"required,max=7"`
	}
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	tag, err := c.repo.Update(ctx, userID, tagID, req.Name, req.Color)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		return
	}
	ctx.JSON(http.StatusOK, tag)
}

func (c *TagController) Delete(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	tagID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	if err := c.repo.Delete(ctx, userID, tagID); err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

func (c *TagController) Bind(ctx *gin.Context) {
	_, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	tagID, err := strconv.ParseUint(ctx.Param("tagId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	if err := c.repo.BindMailbox(ctx, mailboxID, tagID); err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxCreateFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "bound"})
}

func (c *TagController) Unbind(ctx *gin.Context) {
	_, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	tagID, err := strconv.ParseUint(ctx.Param("tagId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	if err := c.repo.UnbindMailbox(ctx, mailboxID, tagID); err != nil {
		apierror.Abort(ctx, apierror.ErrMailboxNotFound)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"status": "unbound"})
}
