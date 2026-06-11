package system

import (
	"bytes"
	"context"
	"crypto/tls"
	"errors"
	"net"
	"net/mail"
	"net/smtp"
	"strings"
	"testing"
	"time"

	"github.com/jhillyerd/enmime/v2"
)

func TestBuildMailDeliveryCodeMessageVerificationHTML(t *testing.T) {
	message := BuildMailDeliveryCodeMessage(
		"Shiro Email verification code",
		"Your verification code is:",
		"123456",
		"http://localhost:5173/auth/verify-email?ticket=ticket-1&code=123456",
		"Verify email",
	)

	if !strings.Contains(message.HTMLBody, "完成账户邮箱验证") {
		t.Fatalf("expected verification headline in HTML body")
	}
	if !strings.Contains(message.HTMLBody, "123456") {
		t.Fatalf("expected code in HTML body")
	}
	if !strings.Contains(message.HTMLBody, "邮箱验证") {
		t.Fatalf("expected verification badge in HTML body")
	}
	if !strings.Contains(message.HTMLBody, "Verify email") || !strings.Contains(message.HTMLBody, "/auth/verify-email?ticket=ticket-1&amp;code=123456") {
		t.Fatalf("expected verification action link in HTML body")
	}
	if len(message.TextLines) == 0 || !strings.Contains(message.TextLines[0], "123456") {
		t.Fatalf("expected plain text fallback with code, got %+v", message.TextLines)
	}
}

func TestBuildMailDeliveryCodeMessagePasswordResetHTML(t *testing.T) {
	message := BuildMailDeliveryCodeMessage(
		"Shiro Email password reset code",
		"Your password reset code is:",
		"654321",
		"http://localhost:5173/auth/reset-password?ticket=ticket-2&code=654321",
		"Reset password",
	)

	if !strings.Contains(message.HTMLBody, "重置你的账户密码") {
		t.Fatalf("expected password reset headline in HTML body")
	}
	if !strings.Contains(message.HTMLBody, "重置密码") {
		t.Fatalf("expected password reset badge in HTML body")
	}
	if !strings.Contains(message.HTMLBody, "#dc2626") {
		t.Fatalf("expected password reset accent color in HTML body")
	}
	if !strings.Contains(message.HTMLBody, "Reset password") || !strings.Contains(message.HTMLBody, "/auth/reset-password?ticket=ticket-2&amp;code=654321") {
		t.Fatalf("expected password reset action link in HTML body")
	}
	if len(message.TextLines) < 3 || !strings.Contains(message.TextLines[2], "检查账户安全") {
		t.Fatalf("expected security warning in text fallback, got %+v", message.TextLines)
	}
}

func TestBuildMailDeliveryMIMEBodyCreatesMultipartAlternative(t *testing.T) {
	settings := MailDeliveryConfig{
		FromAddress: "sender@example.com",
		FromName:    "Shiro Email",
	}
	body, err := buildMailDeliveryMIMEBody(settings, "user@example.com", "Subject", MailDeliveryMessage{
		TextLines: []string{"Plain body"},
		HTMLBody:  "<html><body><strong>HTML body</strong></body></html>",
	})
	if err != nil {
		t.Fatalf("build MIME body: %v", err)
	}

	raw := string(body)
	if !strings.Contains(raw, "multipart/alternative") {
		t.Fatalf("expected multipart content type, got %s", raw)
	}
	if !strings.Contains(raw, "Content-Transfer-Encoding: quoted-printable") {
		t.Fatalf("expected quoted-printable body, got %s", raw)
	}
	if !strings.Contains(raw, "Content-Type: text/plain; charset=UTF-8") {
		t.Fatalf("expected text/plain part")
	}
	if !strings.Contains(raw, "Content-Type: text/html; charset=UTF-8") {
		t.Fatalf("expected text/html part")
	}
	if !strings.Contains(raw, "HTML body") {
		t.Fatalf("expected HTML body content")
	}
}

func TestBuildMailDeliveryMIMEBodyRoundTripsAsMultipartEmail(t *testing.T) {
	settings := MailDeliveryConfig{
		FromAddress: "sender@example.com",
		FromName:    "Shiro Email",
	}
	body, err := buildMailDeliveryMIMEBody(settings, "user@example.com", "验证码测试", MailDeliveryMessage{
		TextLines: []string{
			"Your verification code is: 014455",
			"验证码 15 分钟内有效。",
		},
		HTMLBody: "<!DOCTYPE html><html><body><strong>014455</strong><p>验证码 15 分钟内有效。</p></body></html>",
	})
	if err != nil {
		t.Fatalf("build MIME body: %v", err)
	}

	headerMessage, err := mail.ReadMessage(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("parse top-level message: %v", err)
	}
	if got := headerMessage.Header.Get("Content-Type"); !strings.Contains(got, "multipart/alternative") {
		t.Fatalf("expected multipart content type header, got %q", got)
	}
	if got := headerMessage.Header.Get("Subject"); !strings.Contains(got, "=?utf-8?q?") {
		t.Fatalf("expected encoded subject header, got %q", got)
	}

	envelope, err := enmime.ReadEnvelope(bytes.NewReader(body))
	if err != nil {
		t.Fatalf("parse MIME envelope: %v", err)
	}
	if !strings.Contains(envelope.Text, "014455") {
		t.Fatalf("expected decoded plain text body, got %q", envelope.Text)
	}
	if !strings.Contains(envelope.HTML, "<strong>014455</strong>") {
		t.Fatalf("expected decoded html body, got %q", envelope.HTML)
	}
}

func TestBuildMailDeliveryTestMessageHTML(t *testing.T) {
	message := BuildMailDeliveryTestMessage("2026-04-06T10:00:00Z")

	if !strings.Contains(message.HTMLBody, "SMTP 发信测试成功") {
		t.Fatalf("expected SMTP test headline in HTML body")
	}
	if !strings.Contains(message.HTMLBody, "已连接") {
		t.Fatalf("expected connected status in HTML body")
	}
	if !strings.Contains(message.HTMLBody, "SMTP 测试") {
		t.Fatalf("expected SMTP test badge in HTML body")
	}
	if len(message.TextLines) < 2 || !strings.Contains(message.TextLines[1], "2026-04-06T10:00:00Z") {
		t.Fatalf("expected sent time in text fallback, got %+v", message.TextLines)
	}
}

func TestLoadMailInboundPolicySettingsIncludesDomainOverrides(t *testing.T) {
	repo := NewMemoryConfigRepository()
	_, _ = repo.Upsert(context.Background(), ConfigKeyMailInboundPolicy, map[string]any{
		"maxAttachmentSizeMB":   15,
		"rejectExecutableFiles": true,
		"domainOverrides": map[string]any{
			"Example.Test": map[string]any{
				"enabled":               true,
				"maxAttachmentSizeMB":   5,
				"rejectExecutableFiles": false,
			},
		},
	}, 1)

	settings, err := LoadMailInboundPolicySettings(context.Background(), repo)
	if err != nil {
		t.Fatalf("load inbound policy settings: %v", err)
	}
	override, ok := settings.DomainOverrides["example.test"]
	if !ok {
		t.Fatalf("expected normalized domain override map, got %+v", settings.DomainOverrides)
	}
	if !override.Enabled || override.MaxAttachmentSizeMB != 5 || override.RejectExecutableFiles {
		t.Fatalf("unexpected domain override value: %+v", override)
	}
}

func TestLoadMailDeliverySettingsIncludesTransportMode(t *testing.T) {
	repo := NewMemoryConfigRepository()
	_, _ = repo.Upsert(context.Background(), ConfigKeyMailDelivery, map[string]any{
		"enabled":            true,
		"host":               "smtp.example.com",
		"port":               465,
		"username":           "sender@example.com",
		"password":           "secret",
		"fromAddress":        "sender@example.com",
		"fromName":           "Shiro Email",
		"transportMode":      "smtps",
		"insecureSkipVerify": true,
	}, 1)

	settings, err := LoadMailDeliverySettings(context.Background(), repo)
	if err != nil {
		t.Fatalf("load mail delivery settings: %v", err)
	}
	if settings.TransportMode != "smtps" || !settings.InsecureSkipVerify {
		t.Fatalf("unexpected delivery transport settings: %+v", settings)
	}
}

func TestValidateMailDeliverySettingsRejectsUnknownTransportMode(t *testing.T) {
	err := ValidateMailDeliverySettings(MailDeliveryConfig{
		Enabled:       true,
		Host:          "smtp.example.com",
		Port:          587,
		FromAddress:   "sender@example.com",
		TransportMode: "weird",
	})
	if err == nil || !strings.Contains(err.Error(), "transport mode is invalid") {
		t.Fatalf("expected invalid transport mode error, got %v", err)
	}
}

func TestSendMailDeliveryWithPlainTransportUsesSendMail(t *testing.T) {
	previousSendMail := smtpSendMailFunc
	t.Cleanup(func() {
		smtpSendMailFunc = previousSendMail
	})

	called := false
	smtpSendMailFunc = func(addr string, _ smtp.Auth, from string, to []string, msg []byte) error {
		called = true
		if addr != "smtp.example.com:25" || from != "sender@example.com" || len(to) != 1 || to[0] != "user@example.com" || len(msg) == 0 {
			t.Fatalf("unexpected sendmail call: addr=%s from=%s to=%v bytes=%d", addr, from, to, len(msg))
		}
		return nil
	}

	err := sendMailDeliveryWithTransport(MailDeliveryConfig{
		Host:          "smtp.example.com",
		Port:          25,
		FromAddress:   "sender@example.com",
		TransportMode: "plain",
	}, "smtp.example.com:25", "user@example.com", []byte("message"))
	if err != nil {
		t.Fatalf("send plain mail: %v", err)
	}
	if !called {
		t.Fatal("expected smtp.SendMail path to be used")
	}
}

func TestSendMailDeliveryRawWithPlainTransportUsesEnvelopeSenderAndForwardRecipient(t *testing.T) {
	previousSendMail := smtpSendMailFunc
	t.Cleanup(func() {
		smtpSendMailFunc = previousSendMail
	})

	rawMessage := []byte("From: original@example.com\r\nTo: mailbox@example.test\r\nSubject: Forward me\r\n\r\nbody")
	called := false
	smtpSendMailFunc = func(addr string, _ smtp.Auth, from string, to []string, msg []byte) error {
		called = true
		if addr != "smtp.example.com:25" {
			t.Fatalf("unexpected smtp addr: %s", addr)
		}
		if from != "sender@example.com" {
			t.Fatalf("expected configured envelope sender, got %s", from)
		}
		if len(to) != 1 || to[0] != "forward@example.net" {
			t.Fatalf("expected forward recipient, got %v", to)
		}
		if string(msg) != string(rawMessage) {
			t.Fatalf("expected raw message to be forwarded unchanged, got %q", string(msg))
		}
		return nil
	}

	err := SendMailDeliveryRaw(MailDeliveryConfig{
		Enabled:       true,
		Host:          "smtp.example.com",
		Port:          25,
		FromAddress:   "sender@example.com",
		TransportMode: "plain",
	}, "forward@example.net", rawMessage)
	if err != nil {
		t.Fatalf("send raw forward: %v", err)
	}
	if !called {
		t.Fatal("expected smtp.SendMail path to be used")
	}
}

func TestSendMailDeliveryRawRejectsEmptyPayload(t *testing.T) {
	err := SendMailDeliveryRaw(MailDeliveryConfig{
		Enabled:       true,
		Host:          "smtp.example.com",
		Port:          25,
		FromAddress:   "sender@example.com",
		TransportMode: "plain",
	}, "forward@example.net", nil)
	if err == nil || !strings.Contains(err.Error(), "raw message is empty") {
		t.Fatalf("expected empty raw message error, got %v", err)
	}
}

func TestSendMailDeliveryWithSMTPSUsesTLSDial(t *testing.T) {
	previousTLSDial := smtpDialTLSFunc
	t.Cleanup(func() {
		smtpDialTLSFunc = previousTLSDial
	})

	serverConn, clientConn := net.Pipe()
	defer clientConn.Close()
	defer serverConn.Close()

	called := false
	smtpDialTLSFunc = func(network string, address string, config *tls.Config) (net.Conn, error) {
		called = true
		if network != "tcp" || address != "smtp.example.com:465" || config.ServerName != "smtp.example.com" || !config.InsecureSkipVerify {
			t.Fatalf("unexpected tls dial args: network=%s address=%s config=%+v", network, address, config)
		}
		return clientConn, net.ErrClosed
	}

	_ = sendMailDeliveryWithTransport(MailDeliveryConfig{
		Host:               "smtp.example.com",
		Port:               465,
		FromAddress:        "sender@example.com",
		TransportMode:      "smtps",
		InsecureSkipVerify: true,
	}, "smtp.example.com:465", "user@example.com", []byte("message"))
	if !called {
		t.Fatal("expected tls dial path to be used")
	}
}

func TestSendMailDeliveryWithPlainTransportWrapsStageError(t *testing.T) {
	previousSendMail := smtpSendMailFunc
	t.Cleanup(func() {
		smtpSendMailFunc = previousSendMail
	})

	smtpSendMailFunc = func(string, smtp.Auth, string, []string, []byte) error {
		return errors.New("connection refused")
	}

	err := sendMailDeliveryWithTransport(MailDeliveryConfig{
		Host:          "smtp.example.com",
		Port:          25,
		FromAddress:   "sender@example.com",
		TransportMode: "plain",
	}, "smtp.example.com:25", "user@example.com", []byte("message"))
	if err == nil || !strings.Contains(err.Error(), "mail delivery connect failed") {
		t.Fatalf("expected wrapped connect error, got %v", err)
	}
}

func TestMailDeliveryErrorHumanizesTimeout(t *testing.T) {
	err := wrapMailDeliveryError("auth", &net.DNSError{IsTimeout: true})
	if err == nil || !strings.Contains(err.Error(), "operation timed out") {
		t.Fatalf("expected timeout-humanized auth error, got %v", err)
	}
}

func TestDiagnoseMailDeliveryErrorDetectsStartTLSCapabilityGap(t *testing.T) {
	diagnostic := DiagnoseMailDeliveryError(wrapMailDeliveryError("tls", errors.New("server does not advertise STARTTLS")))
	if diagnostic.Stage != "tls" || diagnostic.Code != "starttls_unavailable" {
		t.Fatalf("unexpected diagnostic: %+v", diagnostic)
	}
	if diagnostic.Retryable {
		t.Fatalf("expected non-retryable STARTTLS capability issue, got %+v", diagnostic)
	}
}

func TestDiagnoseMailDeliveryErrorDetectsTimeout(t *testing.T) {
	diagnostic := DiagnoseMailDeliveryError(wrapMailDeliveryError("connect", &net.DNSError{IsTimeout: true}))
	if diagnostic.Code != "timeout" || !diagnostic.Retryable {
		t.Fatalf("unexpected timeout diagnostic: %+v", diagnostic)
	}
}

func TestSendMailDeliveryWithStartTLSModeRequiresServerCapability(t *testing.T) {
	serverConn, clientConn := net.Pipe()
	defer clientConn.Close()
	defer serverConn.Close()

	serverErrCh := make(chan error, 1)
	go func() {
		_, err := serverConn.Write([]byte("220 smtp.example.com ESMTP ready\r\n"))
		if err != nil {
			serverErrCh <- err
			return
		}
		buf := make([]byte, 1024)
		_, _ = serverConn.Read(buf)
		_, err = serverConn.Write([]byte("250 smtp.example.com\r\n"))
		serverErrCh <- err
	}()

	previousDial := smtpDialTimeoutFunc
	t.Cleanup(func() {
		smtpDialTimeoutFunc = previousDial
	})
	smtpDialTimeoutFunc = func(network string, address string, timeout time.Duration) (net.Conn, error) {
		if network != "tcp" || address != "smtp.example.com:587" || timeout != mailDeliveryOperationTimeout {
			t.Fatalf("unexpected dial args: %s %s %s", network, address, timeout)
		}
		return clientConn, nil
	}

	err := sendMailDeliveryWithTransport(MailDeliveryConfig{
		Host:          "smtp.example.com",
		Port:          587,
		FromAddress:   "sender@example.com",
		TransportMode: "starttls",
	}, "smtp.example.com:587", "user@example.com", []byte("message"))
	if err == nil || !strings.Contains(err.Error(), "STARTTLS") {
		t.Fatalf("expected STARTTLS capability error, got %v", err)
	}
	if srvErr := <-serverErrCh; srvErr != nil {
		t.Fatalf("unexpected mock server error: %v", srvErr)
	}
}

func TestSendMailDeliveryWithCredentialsRequiresServerAuthCapability(t *testing.T) {
	serverConn, clientConn := net.Pipe()
	defer clientConn.Close()
	defer serverConn.Close()

	serverErrCh := make(chan error, 1)
	go func() {
		_, err := serverConn.Write([]byte("220 smtp.example.com ESMTP ready\r\n"))
		if err != nil {
			serverErrCh <- err
			return
		}
		buf := make([]byte, 1024)
		_, _ = serverConn.Read(buf)
		_, err = serverConn.Write([]byte("250 smtp.example.com\r\n"))
		serverErrCh <- err
	}()

	previousDial := smtpDialTLSFunc
	t.Cleanup(func() {
		smtpDialTLSFunc = previousDial
	})
	smtpDialTLSFunc = func(network string, address string, config *tls.Config) (net.Conn, error) {
		if network != "tcp" || address != "smtp.example.com:465" || config.ServerName != "smtp.example.com" {
			t.Fatalf("unexpected tls dial args: %s %s %+v", network, address, config)
		}
		return clientConn, nil
	}

	err := sendMailDeliveryWithTransport(MailDeliveryConfig{
		Host:          "smtp.example.com",
		Port:          465,
		FromAddress:   "sender@example.com",
		Username:      "sender@example.com",
		Password:      "secret",
		TransportMode: "smtps",
	}, "smtp.example.com:465", "user@example.com", []byte("message"))
	if err == nil || !strings.Contains(err.Error(), "AUTH") {
		t.Fatalf("expected AUTH capability error, got %v", err)
	}
	if srvErr := <-serverErrCh; srvErr != nil {
		t.Fatalf("unexpected mock server error: %v", srvErr)
	}
}
