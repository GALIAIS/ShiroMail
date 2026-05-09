package message

import (
	"errors"
	"fmt"
	"mime"
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/middleware"
	"shiro-email/backend/internal/modules/portal"
)

type Controller struct {
	service  *Service
	receiver InboundReceiver
}

func NewController(service *Service, receiver ...InboundReceiver) *Controller {
	var optional InboundReceiver
	if len(receiver) > 0 {
		optional = receiver[0]
	}
	return &Controller{service: service, receiver: optional}
}

func (c *Controller) Trend(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	days := 7
	if d, err := strconv.Atoi(ctx.Query("days")); err == nil && d > 0 {
		days = d
	}

	items, err := c.service.MessageTrend(ctx, userID, days)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load trend"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListByMailbox(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return
	}

	query := ctx.Query("q")
	var items []Summary
	if query != "" {
		items, err = c.service.SearchByMailbox(ctx, userID, mailboxID, query, currentAPIKeyArgs(ctx)...)
	} else {
		items, err = c.service.ListByMailbox(ctx, userID, mailboxID, currentAPIKeyArgs(ctx)...)
	}
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			ctx.JSON(http.StatusForbidden, gin.H{"message": "forbidden"})
			return
		case IsNotFound(err):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
			return
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to list messages"})
			return
		}
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) Detail(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return
	}
	messageID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid message id"})
		return
	}

	item, err := c.service.GetByMailboxAndID(ctx, userID, mailboxID, messageID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			ctx.JSON(http.StatusForbidden, gin.H{"message": "forbidden"})
		case errors.Is(err, ErrMessageDeleted):
			ctx.JSON(http.StatusNotFound, gin.H{"message": "message deleted"})
		case IsNotFound(err):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load message"})
		}
		return
	}
	ctx.JSON(http.StatusOK, item)
}

func (c *Controller) Raw(ctx *gin.Context) {
	userID, mailboxID, messageID, ok := parseMessageScope(ctx)
	if !ok {
		return
	}

	download, err := c.service.DownloadRawByMailboxAndID(ctx, userID, mailboxID, messageID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			ctx.JSON(http.StatusForbidden, gin.H{"message": "forbidden"})
		case errors.Is(err, ErrMessageDeleted), IsNotFound(err), errors.Is(err, ErrMessageContentUnavailable):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load raw message"})
		}
		return
	}

	writeDownload(ctx, download)
}

func (c *Controller) ParsedRaw(ctx *gin.Context) {
	userID, mailboxID, messageID, ok := parseMessageScope(ctx)
	if !ok {
		return
	}

	parsed, err := c.service.ParseRawByMailboxAndID(ctx, userID, mailboxID, messageID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			ctx.JSON(http.StatusForbidden, gin.H{"message": "forbidden"})
		case errors.Is(err, ErrMessageDeleted), IsNotFound(err), errors.Is(err, ErrMessageContentUnavailable):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to parse raw message"})
		}
		return
	}

	ctx.JSON(http.StatusOK, parsed)
}

func (c *Controller) Receive(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	if c.receiver == nil {
		ctx.JSON(http.StatusServiceUnavailable, gin.H{"message": "mail ingest unavailable"})
		return
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return
	}

	var req ReceiveRawMessageRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid request"})
		return
	}

	item, err := c.service.ReceiveRawMessage(ctx, userID, mailboxID, req.MailFrom, []byte(req.Raw), c.receiver, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			ctx.JSON(http.StatusForbidden, gin.H{"message": "forbidden"})
		case IsNotFound(err):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to receive raw message"})
		}
		return
	}

	ctx.JSON(http.StatusCreated, item)
}

func (c *Controller) Attachment(ctx *gin.Context) {
	userID, mailboxID, messageID, ok := parseMessageScope(ctx)
	if !ok {
		return
	}

	attachmentIndex, err := strconv.Atoi(ctx.Param("index"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid attachment index"})
		return
	}

	download, err := c.service.DownloadAttachmentByMailboxAndID(ctx, userID, mailboxID, messageID, attachmentIndex, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			ctx.JSON(http.StatusForbidden, gin.H{"message": "forbidden"})
		case errors.Is(err, ErrMessageDeleted), IsNotFound(err), errors.Is(err, ErrAttachmentNotFound), errors.Is(err, ErrMessageContentUnavailable):
			ctx.JSON(http.StatusNotFound, gin.H{"message": err.Error()})
		default:
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "failed to load attachment"})
		}
		return
	}

	writeDownload(ctx, download)
}

func currentUserID(ctx *gin.Context) (uint64, bool) {
	value, exists := ctx.Get("auth.userID")
	if !exists {
		return 0, false
	}
	userID, ok := value.(uint64)
	return userID, ok
}

func parseMessageScope(ctx *gin.Context) (uint64, uint64, uint64, bool) {
	userID, ok := currentUserID(ctx)
	if !ok {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return 0, 0, 0, false
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid mailbox id"})
		return 0, 0, 0, false
	}

	messageID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "invalid message id"})
		return 0, 0, 0, false
	}

	return userID, mailboxID, messageID, true
}

func writeDownload(ctx *gin.Context, download Download) {
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

func currentAPIKeyArgs(ctx *gin.Context) []portal.APIKey {
	apiKey, ok := middleware.CurrentAPIKey(ctx)
	if !ok {
		return nil
	}
	return []portal.APIKey{apiKey}
}
