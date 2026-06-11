package system

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/tls"
	"errors"
	"fmt"
	"html"
	"mime"
	"mime/quotedprintable"
	"net"
	"net/smtp"
	"strings"
	"time"
)

var smtpSendMailFunc = smtp.SendMail
var smtpDialTimeoutFunc = func(network string, address string, timeout time.Duration) (net.Conn, error) {
	return net.DialTimeout(network, address, timeout)
}
var smtpDialTLSFunc = func(network string, address string, config *tls.Config) (net.Conn, error) {
	return tls.Dial(network, address, config)
}

const mailDeliveryOperationTimeout = 10 * time.Second

type MailDeliveryError struct {
	Stage string
	Err   error
}

func (e *MailDeliveryError) Error() string {
	if e == nil || e.Err == nil {
		return "mail delivery failed"
	}
	switch e.Stage {
	case "connect":
		return fmt.Sprintf("mail delivery connect failed: %s", humanizeMailDeliveryError(e.Err))
	case "tls":
		return fmt.Sprintf("mail delivery TLS handshake failed: %s", humanizeMailDeliveryError(e.Err))
	case "auth":
		return fmt.Sprintf("mail delivery authentication failed: %s", humanizeMailDeliveryError(e.Err))
	case "mail_from":
		return fmt.Sprintf("mail delivery MAIL FROM failed: %s", humanizeMailDeliveryError(e.Err))
	case "rcpt_to":
		return fmt.Sprintf("mail delivery RCPT TO failed: %s", humanizeMailDeliveryError(e.Err))
	case "data":
		return fmt.Sprintf("mail delivery DATA failed: %s", humanizeMailDeliveryError(e.Err))
	case "quit":
		return fmt.Sprintf("mail delivery quit failed: %s", humanizeMailDeliveryError(e.Err))
	default:
		return fmt.Sprintf("mail delivery failed: %s", humanizeMailDeliveryError(e.Err))
	}
}

func (e *MailDeliveryError) Unwrap() error {
	if e == nil {
		return nil
	}
	return e.Err
}

type ConfigMailDeliveryTester struct {
	configRepo ConfigRepository
}

func NewConfigMailDeliveryTester(configRepo ConfigRepository) *ConfigMailDeliveryTester {
	return &ConfigMailDeliveryTester{configRepo: configRepo}
}

func (t *ConfigMailDeliveryTester) SendTestMail(ctx context.Context, to string) error {
	settings, err := LoadMailDeliverySettings(ctx, t.configRepo)
	if err != nil {
		return err
	}
	return SendMailDeliveryTest(settings, to)
}

func SendMailDeliveryTest(settings MailDeliveryConfig, to string) error {
	recipient := strings.TrimSpace(to)
	if recipient == "" {
		recipient = settings.FromAddress
	}
	sentAt := time.Now().Format(time.RFC3339)
	subject := fmt.Sprintf("Shiro Email SMTP test %s", sentAt)
	return sendMailDeliveryMessage(settings, recipient, subject, BuildMailDeliveryTestMessage(sentAt))
}

func SendMailDeliveryCode(settings MailDeliveryConfig, to string, subject string, intro string, code string, actionURL string, actionLabel string) error {
	message := BuildMailDeliveryCodeMessage(subject, intro, code, actionURL, actionLabel)
	return sendMailDeliveryMessage(settings, to, subject, message)
}

func SendMailDeliveryRaw(settings MailDeliveryConfig, to string, rawMessage []byte) error {
	if err := ValidateMailDeliverySettings(settings); err != nil {
		return err
	}
	recipient := strings.TrimSpace(to)
	if recipient == "" {
		return fmt.Errorf("mail delivery recipient is required")
	}
	if len(rawMessage) == 0 {
		return fmt.Errorf("raw message is empty")
	}

	addr := fmt.Sprintf("%s:%d", settings.Host, settings.Port)
	return sendMailDeliveryWithTransport(settings, addr, recipient, rawMessage)
}

type MailDeliveryMessage struct {
	TextLines []string
	HTMLBody  string
}

func BuildMailDeliveryTestMessage(sentAt string) MailDeliveryMessage {
	return MailDeliveryMessage{
		TextLines: []string{
			"这是一封来自 Shiro Email 的真实 SMTP 连通性测试邮件。",
			fmt.Sprintf("发送时间：%s", sentAt),
			"如果你收到这封邮件，说明当前账户邮件发信配置已经可以正常使用。",
		},
		HTMLBody: renderMailDeliveryLayout(mailDeliveryTemplateData{
			Title:       "SMTP 发信测试成功",
			Preheader:   "这是一封来自 Shiro Email 的真实 SMTP 连通性测试邮件。",
			BadgeText:   "SMTP 测试",
			AccentColor: "#0f766e",
			Eyebrow:     "发信诊断",
			Headline:    "账户邮件通道已成功连通",
			Supporting:  "这封邮件用于确认当前配置的 SMTP 服务商可以正常发送 Shiro Email 的账户验证、重置密码与通知邮件。",
			HeroLabel:   "当前状态",
			HeroValue:   "已连接",
			HeroNote:    fmt.Sprintf("发送时间：%s", sentAt),
			InfoText:    "现在可以继续使用这套发信配置向用户发送注册验证邮件、重置密码邮件和系统通知邮件。",
			FooterText:  "此邮箱仅用于系统通知，请勿直接回复此邮件。",
		}),
	}
}

func BuildMailDeliveryCodeMessage(subject string, intro string, code string, actionURL string, actionLabel string) MailDeliveryMessage {
	preheader := fmt.Sprintf("%s %s", intro, code)
	theme := mailDeliveryThemeForSubject(subject)
	headline := "完成账户邮箱验证"
	supporting := "请输入下方验证码，完成你的账户邮箱验证并继续使用 Shiro Email。"
	footer := "如果这不是你本人发起的操作，可以直接忽略此邮件。"
	infoText := "请在验证页面输入下方验证码后继续。"
	actionTitle := ""

	if theme.Kind == "password_reset" {
		headline = "重置你的账户密码"
		supporting = "请输入下方验证码，继续完成密码重置流程。"
		footer = "如果这不是你本人发起的密码重置请求，请尽快检查账户安全。"
		infoText = "请在重置密码页面输入下方验证码，并尽快完成新密码设置。"
	}
	if strings.TrimSpace(actionURL) != "" {
		if strings.TrimSpace(actionLabel) == "" {
			actionLabel = "继续处理"
		}
		actionTitle = "也可以直接点击下方按钮继续。"
	}

	return MailDeliveryMessage{
		TextLines: []string{
			fmt.Sprintf("%s %s", intro, code),
			"验证码 15 分钟内有效。",
			footer,
		},
		HTMLBody: renderMailDeliveryLayout(mailDeliveryTemplateData{
			Title:        headline,
			Preheader:    preheader,
			BadgeText:    theme.BadgeText,
			AccentColor:  theme.AccentColor,
			Eyebrow:      "账户安全",
			Headline:     headline,
			Supporting:   supporting,
			HeroLabel:    "验证码",
			HeroValue:    code,
			HeroValueCSS: "font-size:40px;line-height:1;font-weight:800;letter-spacing:.35em;color:#0f172a;text-indent:.35em;",
			HeroNote:     "验证码 15 分钟内有效。",
			InfoText:     infoText,
			ActionTitle:  actionTitle,
			ActionLabel:  actionLabel,
			ActionURL:    actionURL,
			FooterText:   footer,
		}),
	}
}

func sendMailDeliveryMessage(settings MailDeliveryConfig, to string, subject string, message MailDeliveryMessage) error {
	if err := ValidateMailDeliverySettings(settings); err != nil {
		return err
	}
	recipient := strings.TrimSpace(to)

	addr := fmt.Sprintf("%s:%d", settings.Host, settings.Port)
	body, err := buildMailDeliveryMIMEBody(settings, recipient, subject, message)
	if err != nil {
		return err
	}

	return sendMailDeliveryWithTransport(settings, addr, recipient, body)
}

func ValidateMailDeliverySettings(settings MailDeliveryConfig) error {
	if !settings.Enabled {
		return fmt.Errorf("mail delivery is disabled")
	}
	if strings.TrimSpace(settings.Host) == "" || settings.Port <= 0 || strings.TrimSpace(settings.FromAddress) == "" {
		return fmt.Errorf("mail delivery is not fully configured")
	}
	switch settings.TransportMode {
	case "", "plain", "starttls", "smtps":
	default:
		return fmt.Errorf("mail delivery transport mode is invalid")
	}
	return nil
}

func sendMailDeliveryWithTransport(settings MailDeliveryConfig, addr string, recipient string, body []byte) error {
	switch normalizeMailTransportMode(settings.TransportMode) {
	case "plain":
		if err := smtpSendMailFunc(addr, smtpPlainAuth(settings), settings.FromAddress, []string{recipient}, body); err != nil {
			return wrapMailDeliveryError("connect", err)
		}
		return nil
	case "smtps":
		return sendMailDeliveryViaClient(settings, addr, recipient, body, true)
	default:
		return sendMailDeliveryViaClient(settings, addr, recipient, body, false)
	}
}

func smtpPlainAuth(settings MailDeliveryConfig) smtp.Auth {
	if strings.TrimSpace(settings.Username) == "" {
		return nil
	}
	return smtp.PlainAuth("", settings.Username, settings.Password, settings.Host)
}

func sendMailDeliveryViaClient(settings MailDeliveryConfig, addr string, recipient string, body []byte, implicitTLS bool) error {
	transportMode := normalizeMailTransportMode(settings.TransportMode)
	tlsConfig := &tls.Config{
		ServerName:         settings.Host,
		InsecureSkipVerify: settings.InsecureSkipVerify,
	}

	var (
		conn net.Conn
		err  error
	)
	if implicitTLS {
		conn, err = smtpDialTLSFunc("tcp", addr, tlsConfig)
	} else {
		conn, err = smtpDialTimeoutFunc("tcp", addr, mailDeliveryOperationTimeout)
	}
	if err != nil {
		stage := "connect"
		if implicitTLS {
			stage = "tls"
		}
		return wrapMailDeliveryError(stage, err)
	}
	defer conn.Close()

	_ = conn.SetDeadline(time.Now().Add(mailDeliveryOperationTimeout))
	client, err := smtp.NewClient(conn, settings.Host)
	if err != nil {
		return wrapMailDeliveryError("connect", err)
	}
	defer client.Close()

	if !implicitTLS {
		if ok, _ := client.Extension("STARTTLS"); ok {
			_ = conn.SetDeadline(time.Now().Add(mailDeliveryOperationTimeout))
			if err := client.StartTLS(tlsConfig); err != nil {
				return wrapMailDeliveryError("tls", err)
			}
		} else if transportMode == "starttls" {
			return wrapMailDeliveryError("tls", fmt.Errorf("server does not advertise STARTTLS"))
		}
	}

	if auth := smtpPlainAuth(settings); auth != nil {
		if ok, _ := client.Extension("AUTH"); ok {
			_ = conn.SetDeadline(time.Now().Add(mailDeliveryOperationTimeout))
			if err := client.Auth(auth); err != nil {
				return wrapMailDeliveryError("auth", err)
			}
		} else {
			return wrapMailDeliveryError("auth", fmt.Errorf("server does not advertise AUTH"))
		}
	}
	_ = conn.SetDeadline(time.Now().Add(mailDeliveryOperationTimeout))
	if err := client.Mail(settings.FromAddress); err != nil {
		return wrapMailDeliveryError("mail_from", err)
	}
	_ = conn.SetDeadline(time.Now().Add(mailDeliveryOperationTimeout))
	if err := client.Rcpt(recipient); err != nil {
		return wrapMailDeliveryError("rcpt_to", err)
	}
	_ = conn.SetDeadline(time.Now().Add(mailDeliveryOperationTimeout))
	writer, err := client.Data()
	if err != nil {
		return wrapMailDeliveryError("data", err)
	}
	if _, err := writer.Write(body); err != nil {
		_ = writer.Close()
		return wrapMailDeliveryError("data", err)
	}
	if err := writer.Close(); err != nil {
		return wrapMailDeliveryError("data", err)
	}
	_ = conn.SetDeadline(time.Now().Add(mailDeliveryOperationTimeout))
	if err := client.Quit(); err != nil {
		return wrapMailDeliveryError("quit", err)
	}
	return nil
}

func wrapMailDeliveryError(stage string, err error) error {
	if err == nil {
		return nil
	}
	var mailErr *MailDeliveryError
	if errors.As(err, &mailErr) {
		return err
	}
	return &MailDeliveryError{Stage: stage, Err: err}
}

func humanizeMailDeliveryError(err error) string {
	if err == nil {
		return "unknown error"
	}
	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return "operation timed out"
	}
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "unknown error"
	}
	return message
}

func DiagnoseMailDeliveryError(err error) MailDeliveryDiagnostic {
	diagnostic := MailDeliveryDiagnostic{}
	if err == nil {
		return diagnostic
	}

	var mailErr *MailDeliveryError
	if errors.As(err, &mailErr) {
		diagnostic.Stage = mailErr.Stage
		message := strings.ToLower(humanizeMailDeliveryError(mailErr.Err))
		switch mailErr.Stage {
		case "connect":
			diagnostic.Code = "connect_failed"
			diagnostic.Hint = "Check the SMTP host, port, firewall, and upstream network reachability."
			diagnostic.Retryable = true
		case "tls":
			diagnostic.Code = "tls_failed"
			diagnostic.Hint = "Check the selected transport mode and verify the server certificate or STARTTLS support."
			if strings.Contains(message, "starttls") {
				diagnostic.Code = "starttls_unavailable"
				diagnostic.Hint = "The server does not advertise STARTTLS. Switch to Plain SMTP / SMTPS, or enable STARTTLS on the server."
				diagnostic.Retryable = false
			} else if strings.Contains(message, "certificate") || strings.Contains(message, "x509") {
				diagnostic.Code = "tls_certificate_invalid"
				diagnostic.Hint = "The server certificate is not trusted. Fix the certificate chain or enable insecure TLS verification only for controlled environments."
				diagnostic.Retryable = false
			} else {
				diagnostic.Retryable = true
			}
		case "auth":
			diagnostic.Code = "auth_failed"
			diagnostic.Hint = "Check the SMTP username, password, and authentication method."
			if strings.Contains(message, "advertise auth") {
				diagnostic.Code = "auth_unavailable"
				diagnostic.Hint = "The server does not advertise AUTH. Remove credentials for anonymous relay, or enable AUTH on the SMTP server."
				diagnostic.Retryable = false
			} else {
				diagnostic.Retryable = false
			}
		case "mail_from":
			diagnostic.Code = "sender_rejected"
			diagnostic.Hint = "The SMTP server rejected the sender identity. Verify the configured From address is allowed by the provider."
			diagnostic.Retryable = false
		case "rcpt_to":
			diagnostic.Code = "recipient_rejected"
			diagnostic.Hint = "The SMTP server rejected the recipient address. Verify the target mailbox and provider restrictions."
			diagnostic.Retryable = false
		case "data":
			diagnostic.Code = "data_failed"
			diagnostic.Hint = "The SMTP server rejected the DATA phase. Check message size limits, upstream content filtering, or try again."
			diagnostic.Retryable = true
		case "quit":
			diagnostic.Code = "quit_failed"
			diagnostic.Hint = "The server disconnected during QUIT. The message body may already have been accepted; check the inbox before retrying."
			diagnostic.Retryable = false
		default:
			diagnostic.Code = "delivery_failed"
			diagnostic.Hint = "Review the SMTP configuration and upstream server logs."
		}

		var netErr net.Error
		if errors.As(mailErr.Err, &netErr) && netErr.Timeout() {
			diagnostic.Code = "timeout"
			diagnostic.Hint = "The SMTP server timed out. Check network latency, firewall rules, and provider responsiveness."
			diagnostic.Retryable = true
		}
		return diagnostic
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return MailDeliveryDiagnostic{
			Code:      "timeout",
			Hint:      "The SMTP server timed out. Check network latency, firewall rules, and provider responsiveness.",
			Retryable: true,
		}
	}

	return MailDeliveryDiagnostic{
		Code:      "delivery_failed",
		Hint:      "Review the SMTP configuration and upstream server logs.",
		Retryable: false,
	}
}

func buildMailDeliveryMIMEBody(settings MailDeliveryConfig, recipient string, subject string, message MailDeliveryMessage) ([]byte, error) {
	if len(message.TextLines) == 0 {
		message.TextLines = []string{"Shiro Email 系统通知"}
	}
	if strings.TrimSpace(message.HTMLBody) == "" {
		message.HTMLBody = "<html><body><p>" + strings.Join(message.TextLines, "</p><p>") + "</p></body></html>"
	}

	boundary, err := generateMailBoundary()
	if err != nil {
		return nil, err
	}
	fromName := strings.TrimSpace(settings.FromName)
	if fromName == "" {
		fromName = "Shiro Email"
	}
	fromDisplay := formatMailAddress(fromName, settings.FromAddress)
	subjectHeader := mime.QEncoding.Encode("utf-8", subject)
	dateHeader := time.Now().Format(time.RFC1123Z)

	var body bytes.Buffer
	headers := []string{
		fmt.Sprintf("From: %s", fromDisplay),
		fmt.Sprintf("To: %s", recipient),
		fmt.Sprintf("Subject: %s", subjectHeader),
		fmt.Sprintf("Date: %s", dateHeader),
		"MIME-Version: 1.0",
		fmt.Sprintf("Content-Type: multipart/alternative; boundary=%q", boundary),
	}
	if _, err := body.WriteString(strings.Join(headers, "\r\n") + "\r\n\r\n"); err != nil {
		return nil, err
	}
	if err := writeQuotedPrintablePart(&body, boundary, "text/plain; charset=UTF-8", strings.Join(message.TextLines, "\r\n")); err != nil {
		return nil, err
	}
	if err := writeQuotedPrintablePart(&body, boundary, "text/html; charset=UTF-8", message.HTMLBody); err != nil {
		return nil, err
	}
	if _, err := body.WriteString("--" + boundary + "--\r\n"); err != nil {
		return nil, err
	}
	return body.Bytes(), nil
}

func generateMailBoundary() (string, error) {
	var token [16]byte
	if _, err := rand.Read(token[:]); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", token[:]), nil
}

func formatMailAddress(name string, address string) string {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" {
		return strings.TrimSpace(address)
	}
	return fmt.Sprintf("%s <%s>", mime.QEncoding.Encode("utf-8", trimmedName), strings.TrimSpace(address))
}

func writeQuotedPrintablePart(body *bytes.Buffer, boundary string, contentType string, payload string) error {
	if _, err := body.WriteString("--" + boundary + "\r\n"); err != nil {
		return err
	}
	partHeaders := []string{
		fmt.Sprintf("Content-Type: %s", contentType),
		"Content-Transfer-Encoding: quoted-printable",
	}
	if _, err := body.WriteString(strings.Join(partHeaders, "\r\n") + "\r\n\r\n"); err != nil {
		return err
	}
	writer := quotedprintable.NewWriter(body)
	if _, err := writer.Write([]byte(payload)); err != nil {
		_ = writer.Close()
		return err
	}
	if err := writer.Close(); err != nil {
		return err
	}
	_, err := body.WriteString("\r\n")
	return err
}

type mailDeliveryTheme struct {
	Kind        string
	BadgeText   string
	AccentColor string
}

func mailDeliveryThemeForSubject(subject string) mailDeliveryTheme {
	normalized := strings.ToLower(subject)
	if strings.Contains(normalized, "reset") {
		return mailDeliveryTheme{
			Kind:        "password_reset",
			BadgeText:   "重置密码",
			AccentColor: "#dc2626",
		}
	}
	return mailDeliveryTheme{
		Kind:        "verification",
		BadgeText:   "邮箱验证",
		AccentColor: "#2563eb",
	}
}

type mailDeliveryTemplateData struct {
	Title        string
	Preheader    string
	BadgeText    string
	AccentColor  string
	Eyebrow      string
	Headline     string
	Supporting   string
	HeroLabel    string
	HeroValue    string
	HeroValueCSS string
	HeroNote     string
	InfoText     string
	ActionTitle  string
	ActionLabel  string
	ActionURL    string
	FooterText   string
}

func renderMailDeliveryLayout(data mailDeliveryTemplateData) string {
	heroValueCSS := data.HeroValueCSS
	if strings.TrimSpace(heroValueCSS) == "" {
		heroValueCSS = "font-size:30px;line-height:1.15;font-weight:700;letter-spacing:-0.02em;color:#0f172a;"
	}
	actionBlock := ""
	if strings.TrimSpace(data.ActionURL) != "" {
		actionBlock = fmt.Sprintf(`
                      <div style="margin-top:18px;">
                        <div style="margin-bottom:10px;font-size:13px;line-height:1.7;color:#64748b;">%s</div>
                        <a href="%s" style="display:inline-block;padding:11px 18px;border:1px solid %s;color:%s;text-decoration:none;font-size:13px;font-weight:700;">%s</a>
                      </div>`,
			html.EscapeString(data.ActionTitle),
			html.EscapeString(data.ActionURL),
			html.EscapeString(data.AccentColor),
			html.EscapeString(data.AccentColor),
			html.EscapeString(data.ActionLabel),
		)
	}
	return fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>%s</title>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">%s</div>
    <table role="presentation" style="width:100%%;border-collapse:collapse;background:#ffffff;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" style="width:100%%;max-width:640px;border-collapse:collapse;">
            <tr>
              <td style="padding:8px 20px 14px 20px;text-align:left;">
                <table role="presentation" style="width:100%%;border-collapse:collapse;">
                  <tr>
                    <td style="padding:0 0 10px 0;border-bottom:2px solid %s;">
                      <div style="font-size:20px;font-weight:700;letter-spacing:-0.01em;color:#0f172a;">Shiro Email</div>
                      <div style="margin-top:4px;font-size:12px;color:#64748b;">%s · %s</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 18px 20px;">
                <table role="presentation" style="width:100%%;border-collapse:collapse;background:#ffffff;border:1px solid #dbe2ea;">
                  <tr>
                    <td style="padding:26px 24px 22px 24px;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:%s;">%s</div>
                      <div style="margin-top:8px;font-size:26px;font-weight:700;line-height:1.2;color:#0f172a;letter-spacing:-0.02em;">%s</div>
                      <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#475569;">%s</div>
                      <div style="margin-top:20px;padding:18px 16px;background:#f8fafc;border:1px solid #dbe2ea;text-align:center;">
                        <div style="font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#64748b;">%s</div>
                        <div style="margin-top:10px;%s">%s</div>
                        <div style="margin-top:10px;font-size:13px;line-height:1.7;color:#64748b;">%s</div>
                      </div>
                      <div style="margin-top:16px;padding:14px 16px;background:#ffffff;border-left:3px solid #dbe2ea;font-size:14px;line-height:1.7;color:#334155;">
                        %s
                      </div>
                      %s
                      <div style="margin-top:18px;font-size:13px;line-height:1.8;color:#64748b;">
                        %s
                      </div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 20px 10px 20px;text-align:left;font-size:12px;line-height:1.8;color:#94a3b8;">
                此邮箱仅用于系统通知，请勿直接回复此邮件。
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`,
		html.EscapeString(data.Title),
		html.EscapeString(data.Preheader),
		html.EscapeString(data.AccentColor),
		html.EscapeString(data.BadgeText),
		html.EscapeString(data.Eyebrow),
		html.EscapeString(data.AccentColor),
		html.EscapeString(data.Eyebrow),
		html.EscapeString(data.Headline),
		html.EscapeString(data.Supporting),
		html.EscapeString(data.HeroLabel),
		heroValueCSS,
		html.EscapeString(data.HeroValue),
		html.EscapeString(data.HeroNote),
		html.EscapeString(data.InfoText),
		actionBlock,
		html.EscapeString(data.FooterText),
	)
}

func LoadMailDeliverySettings(ctx context.Context, repo ConfigRepository) (MailDeliveryConfig, error) {
	if repo == nil {
		item := NormalizeConfigEntryForTest(ConfigEntry{Key: ConfigKeyMailDelivery, Value: map[string]any{}})
		return mailDeliveryConfigFromEntry(item), nil
	}

	items, err := repo.List(ctx)
	if err != nil {
		return MailDeliveryConfig{}, err
	}
	for _, item := range items {
		if item.Key == ConfigKeyMailDelivery {
			return mailDeliveryConfigFromEntry(NormalizeConfigEntryForTest(item)), nil
		}
	}

	item := NormalizeConfigEntryForTest(ConfigEntry{Key: ConfigKeyMailDelivery, Value: map[string]any{}})
	return mailDeliveryConfigFromEntry(item), nil
}

func LoadMailSMTPSettings(ctx context.Context, repo ConfigRepository) (MailSMTPConfig, error) {
	if repo == nil {
		item := NormalizeConfigEntryForTest(ConfigEntry{Key: ConfigKeyMailSMTP, Value: map[string]any{}})
		return mailSMTPConfigFromEntry(item), nil
	}

	items, err := repo.List(ctx)
	if err != nil {
		return MailSMTPConfig{}, err
	}

	var smtpItem *ConfigEntry
	siteIdentity := defaultConfigValueForKey(ConfigKeySiteIdentity)
	for index := range items {
		item := items[index]
		if item.Key == ConfigKeyMailSMTP {
			normalized := NormalizeConfigEntryForTest(item)
			smtpItem = &normalized
			continue
		}
		if item.Key == ConfigKeySiteIdentity {
			siteIdentity = normalizeConfigValue(ConfigKeySiteIdentity, item.Value)
		}
	}

	if smtpItem == nil {
		item := NormalizeConfigEntryForTest(ConfigEntry{Key: ConfigKeyMailSMTP, Value: map[string]any{}})
		smtpItem = &item
	}

	settings := mailSMTPConfigFromEntry(*smtpItem)
	if derivedHost, derivedDKIM, ok := deriveMailTargetsFromAppBaseURL(normalizeString(siteIdentity["appBaseUrl"], "")); ok {
		if shouldUseDerivedMailTarget(settings.Hostname) {
			settings.Hostname = derivedHost
		}
		if shouldUseDerivedMailTarget(settings.DKIMCnameTarget) {
			settings.DKIMCnameTarget = derivedDKIM
		}
	}

	return settings, nil
}

func LoadMailInboundPolicySettings(ctx context.Context, repo ConfigRepository) (MailInboundPolicyConfig, error) {
	if repo == nil {
		item := NormalizeConfigEntryForTest(ConfigEntry{Key: ConfigKeyMailInboundPolicy, Value: map[string]any{}})
		return mailInboundPolicyConfigFromEntry(item), nil
	}

	items, err := repo.List(ctx)
	if err != nil {
		return MailInboundPolicyConfig{}, err
	}
	for _, item := range items {
		if item.Key == ConfigKeyMailInboundPolicy {
			return mailInboundPolicyConfigFromEntry(NormalizeConfigEntryForTest(item)), nil
		}
	}

	item := NormalizeConfigEntryForTest(ConfigEntry{Key: ConfigKeyMailInboundPolicy, Value: map[string]any{}})
	return mailInboundPolicyConfigFromEntry(item), nil
}

func mailDeliveryConfigFromEntry(item ConfigEntry) MailDeliveryConfig {
	return MailDeliveryConfig{
		Enabled:            item.Value["enabled"].(bool),
		Host:               item.Value["host"].(string),
		Port:               item.Value["port"].(int),
		Username:           item.Value["username"].(string),
		Password:           item.Value["password"].(string),
		FromAddress:        item.Value["fromAddress"].(string),
		FromName:           item.Value["fromName"].(string),
		TransportMode:      normalizeMailTransportMode(item.Value["transportMode"]),
		InsecureSkipVerify: item.Value["insecureSkipVerify"].(bool),
	}
}

func mailSMTPConfigFromEntry(item ConfigEntry) MailSMTPConfig {
	return MailSMTPConfig{
		Enabled:         item.Value["enabled"].(bool),
		ListenAddr:      item.Value["listenAddr"].(string),
		Hostname:        item.Value["hostname"].(string),
		DKIMCnameTarget: item.Value["dkimCnameTarget"].(string),
		MaxMessageBytes: item.Value["maxMessageBytes"].(int),
	}
}

func mailInboundPolicyConfigFromEntry(item ConfigEntry) MailInboundPolicyConfig {
	domainOverrides := map[string]MailInboundPolicyDomainConfig{}
	if rawOverrides, ok := item.Value["domainOverrides"].(map[string]any); ok {
		for domainName, overrideValue := range rawOverrides {
			overrideMap, ok := overrideValue.(map[string]any)
			if !ok {
				continue
			}
			domainOverrides[strings.ToLower(strings.TrimSpace(domainName))] = MailInboundPolicyDomainConfig{
				Enabled:               normalizeBool(overrideMap["enabled"], false),
				MaxAttachmentSizeMB:   normalizeInt(overrideMap["maxAttachmentSizeMB"], 15),
				RejectExecutableFiles: normalizeBool(overrideMap["rejectExecutableFiles"], true),
			}
		}
	}

	return MailInboundPolicyConfig{
		AllowCatchAll:             item.Value["allowCatchAll"].(bool),
		RequireExistingMailbox:    item.Value["requireExistingMailbox"].(bool),
		RetainRawDays:             item.Value["retainRawDays"].(int),
		MaxAttachmentSizeMB:       item.Value["maxAttachmentSizeMB"].(int),
		RejectExecutableFiles:     item.Value["rejectExecutableFiles"].(bool),
		EnableSpamScanningPreview: item.Value["enableSpamScanningPreview"].(bool),
		DomainOverrides:           domainOverrides,
	}
}
