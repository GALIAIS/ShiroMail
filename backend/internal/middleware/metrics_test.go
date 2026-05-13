package middleware

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestMetricsHandlerIncludesSMTPAndSpoolCounters(t *testing.T) {
	resetMetricsForTest()
	gin.SetMode(gin.TestMode)

	RecordSMTPSessionStarted()
	RecordSMTPRecipientAccepted()
	RecordSMTPDeliveryBytes(512)
	RecordSMTPDeliveryAccepted("spool")
	RecordSMTPDeliveryAccepted("direct")
	RecordSMTPDeliveryRejected("attachment_too_large")
	RecordInboundSpoolProcessed("completed")
	RecordInboundSpoolProcessed("failed")

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	ctx.Request = req

	MetricsHandler("")(ctx)

	body := recorder.Body.String()
	required := []string{
		"shiro_smtp_sessions_total 1",
		"shiro_smtp_recipients_accepted_total 1",
		"shiro_smtp_bytes_received_total 512",
		`shiro_smtp_messages_accepted_total{mode="spool"} 1`,
		`shiro_smtp_messages_accepted_total{mode="direct"} 1`,
		`shiro_smtp_messages_rejected_total{reason="attachment_too_large"} 1`,
		`shiro_inbound_spool_processed_total{status="completed"} 1`,
		`shiro_inbound_spool_processed_total{status="failed"} 1`,
	}
	for _, item := range required {
		if !strings.Contains(body, item) {
			t.Fatalf("expected metrics output to contain %q, got %s", item, body)
		}
	}
}
