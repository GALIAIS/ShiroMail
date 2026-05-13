package message

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"shiro-email/backend/internal/middleware"
	"shiro-email/backend/internal/modules/portal"
	"shiro-email/backend/internal/shared/apierror"
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
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	days := 7
	if d, err := strconv.Atoi(ctx.Query("days")); err == nil && d > 0 {
		days = d
	}

	items, err := c.service.MessageTrend(ctx, userID, days)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMessageTrendFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) RecentActivity(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	limit := 10
	if l, err := strconv.Atoi(ctx.Query("limit")); err == nil && l > 0 {
		limit = l
	}

	items, err := c.service.RecentActivity(ctx, userID, limit)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMessageListFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) GlobalSearch(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	query := ctx.Query("q")
	if query == "" {
		ctx.JSON(http.StatusOK, gin.H{"items": []Summary{}})
		return
	}

	items, err := c.service.GlobalSearch(ctx, userID, query, 20)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMessageSearchFailed)
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) ListByMailbox(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
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
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
			return
		case IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
			return
		default:
			apierror.Abort(ctx, apierror.ErrMessageListFailed)
			return
		}
	}
	ctx.JSON(http.StatusOK, gin.H{"items": items})
}

func (c *Controller) Detail(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}
	messageID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.GetByMailboxAndID(ctx, userID, mailboxID, messageID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrMessageDeleted):
			apierror.Abort(ctx, apierror.ErrMessageDeleted)
		case IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.ErrMessageLoadFailed)
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
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrMessageDeleted):
			apierror.Abort(ctx, apierror.ErrMessageDeleted)
		case errors.Is(err, ErrMessageContentUnavailable):
			apierror.Abort(ctx, apierror.ErrMessageContentUnavailable)
		case IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.ErrMessageRawFailed)
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
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrMessageDeleted):
			apierror.Abort(ctx, apierror.ErrMessageDeleted)
		case errors.Is(err, ErrMessageContentUnavailable):
			apierror.Abort(ctx, apierror.ErrMessageContentUnavailable)
		case IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.ErrMessageParseFailed)
		}
		return
	}

	ctx.JSON(http.StatusOK, parsed)
}

func (c *Controller) Receive(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}
	if c.receiver == nil {
		apierror.Abort(ctx, apierror.ErrIngestMailUnavailable)
		return
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	var req ReceiveRawMessageRequest
	if err := ctx.ShouldBindJSON(&req); err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	item, err := c.service.ReceiveRawMessage(ctx, userID, mailboxID, req.MailFrom, []byte(req.Raw), c.receiver, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.ErrMessageReceiveFailed)
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
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	download, err := c.service.DownloadAttachmentByMailboxAndID(ctx, userID, mailboxID, messageID, attachmentIndex, currentAPIKeyArgs(ctx)...)
	if err != nil {
		switch {
		case errors.Is(err, portal.ErrAPIKeyForbidden):
			apierror.Abort(ctx, apierror.ErrPortalForbidden)
		case errors.Is(err, ErrMessageDeleted):
			apierror.Abort(ctx, apierror.ErrMessageDeleted)
		case errors.Is(err, ErrAttachmentNotFound):
			apierror.Abort(ctx, apierror.ErrAttachmentNotFound)
		case errors.Is(err, ErrMessageContentUnavailable):
			apierror.Abort(ctx, apierror.ErrMessageContentUnavailable)
		case IsNotFound(err):
			apierror.AbortWithMessage(ctx, apierror.ErrMessageNotFound, err.Error())
		default:
			apierror.Abort(ctx, apierror.ErrMessageAttachmentFailed)
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
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return 0, 0, 0, false
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return 0, 0, 0, false
	}

	messageID, err := strconv.ParseUint(ctx.Param("id"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
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

type BatchDeleteRequest struct {
	IDs []uint64 `json:"ids" binding:"required"`
}

type BatchReadRequest struct {
	IDs  []uint64 `json:"ids" binding:"required"`
	Read bool     `json:"read"`
}

func (c *Controller) BatchDelete(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req BatchDeleteRequest
	if err := ctx.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		apierror.Abort(ctx, apierror.ErrMessageIDsRequired)
		return
	}
	if len(req.IDs) > 100 {
		apierror.Abort(ctx, apierror.ErrMessageTooManyIDs)
		return
	}

	if err := c.service.BatchDeleteMessages(ctx, userID, req.IDs); err != nil {
		if err.Error() == "message does not belong to user" || err.Error() == "one or more messages not found" {
			apierror.Abort(ctx, apierror.ErrMessageOwnershipFailed)
			return
		}
		apierror.Abort(ctx, apierror.ErrMessageBatchDeleteFailed)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) BatchRead(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	var req BatchReadRequest
	if err := ctx.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		apierror.Abort(ctx, apierror.ErrMessageIDsRequired)
		return
	}
	if len(req.IDs) > 100 {
		apierror.Abort(ctx, apierror.ErrMessageTooManyIDs)
		return
	}

	if err := c.service.BatchSetReadMessages(ctx, userID, req.IDs, req.Read); err != nil {
		if err.Error() == "message does not belong to user" || err.Error() == "one or more messages not found" {
			apierror.Abort(ctx, apierror.ErrMessageOwnershipFailed)
			return
		}
		apierror.Abort(ctx, apierror.ErrMessageBatchReadFailed)
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"ok": true})
}

func (c *Controller) ExportMailbox(ctx *gin.Context) {
	userID, ok := currentUserID(ctx)
	if !ok {
		apierror.Abort(ctx, apierror.ErrUnauthorized)
		return
	}

	mailboxID, err := strconv.ParseUint(ctx.Param("mailboxId"), 10, 64)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrInvalidRequest)
		return
	}

	items, err := c.service.ListByMailbox(ctx, userID, mailboxID, currentAPIKeyArgs(ctx)...)
	if err != nil {
		apierror.Abort(ctx, apierror.ErrMessageListFailed)
		return
	}

	format := ctx.DefaultQuery("format", "json")
	switch format {
	case "csv":
		ctx.Header("Content-Type", "text/csv; charset=utf-8")
		ctx.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="mailbox_%d_messages.csv"`, mailboxID))
		ctx.Writer.WriteHeader(http.StatusOK)

		writer := csvWriter(ctx.Writer)
		_ = writer.Write([]string{"id", "from", "to", "subject", "received_at", "size_bytes", "has_attachments"})
		for _, item := range items {
			_ = writer.Write([]string{
				strconv.FormatUint(item.ID, 10),
				item.FromAddr,
				item.ToAddr,
				item.Subject,
				item.ReceivedAt.Format(time.RFC3339),
				strconv.FormatInt(item.SizeBytes, 10),
				strconv.FormatBool(item.HasAttachments),
			})
		}
		writer.Flush()
	default:
		ctx.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="mailbox_%d_messages.json"`, mailboxID))
		ctx.JSON(http.StatusOK, gin.H{"mailboxId": mailboxID, "count": len(items), "messages": items})
	}
}

func csvWriter(w io.Writer) *csv.Writer {
	return csv.NewWriter(w)
}