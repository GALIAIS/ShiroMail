package smtp

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net"
	"strings"
	"testing"
	"time"

	"shiro-email/backend/internal/modules/ingest"
	"shiro-email/backend/internal/modules/mailbox"
)

func TestServerAcceptsMessageAndStoresViaDirectIngest(t *testing.T) {
	fixture := newSMTPDirectServiceFixture(t)
	server := NewServer(Config{
		ListenAddr:      "127.0.0.1:0",
		Hostname:        "shiro.local",
		MaxMessageBytes: 1024 * 1024,
	}, fixture.service)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ready := make(chan struct{})
	go func() {
		if err := server.Start(ctx, func() { close(ready) }); err != nil {
			t.Errorf("smtp server start: %v", err)
		}
	}()
	<-ready
	defer server.Drain()

	conn, err := net.Dial("tcp", server.Addr())
	if err != nil {
		t.Fatalf("dial smtp: %v", err)
	}
	defer conn.Close()

	client := newSMTPClient(t, conn)
	client.expectPrefix("220")
	client.sendCommand("EHLO localhost")
	client.expectMultiline("250")
	client.sendCommand("MAIL FROM:<sender@example.com>")
	client.expectPrefix("250")
	client.sendCommand("RCPT TO:<" + fixture.mailboxAddress + ">")
	client.expectPrefix("250")
	client.sendCommand("DATA")
	client.expectPrefix("354")
	client.sendData("From: sender@example.com\r\nTo: " + fixture.mailboxAddress + "\r\nSubject: Welcome\r\n\r\nhello embedded smtp")
	client.expectPrefix("250")
	client.sendCommand("QUIT")
	client.expectPrefix("221")

	items, err := fixture.repo.ListByMailboxID(context.Background(), fixture.mailboxID)
	if err != nil {
		t.Fatalf("list stored messages: %v", err)
	}
	if len(items) != 1 {
		t.Fatalf("expected 1 stored message, got %d", len(items))
	}
	if items[0].Subject != "Welcome" {
		t.Fatalf("expected Welcome subject, got %s", items[0].Subject)
	}
	if items[0].SourceKind != "smtp" {
		t.Fatalf("expected smtp source kind, got %s", items[0].SourceKind)
	}
}

func TestServerRejectsUnknownRecipient(t *testing.T) {
	fixture := newSMTPDirectServiceFixture(t)
	server := NewServer(Config{
		ListenAddr:      "127.0.0.1:0",
		Hostname:        "shiro.local",
		MaxMessageBytes: 1024 * 1024,
	}, fixture.service)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ready := make(chan struct{})
	go func() {
		if err := server.Start(ctx, func() { close(ready) }); err != nil {
			t.Errorf("smtp server start: %v", err)
		}
	}()
	<-ready
	defer server.Drain()

	conn, err := net.Dial("tcp", server.Addr())
	if err != nil {
		t.Fatalf("dial smtp: %v", err)
	}
	defer conn.Close()

	client := newSMTPClient(t, conn)
	client.expectPrefix("220")
	client.sendCommand("HELO localhost")
	client.expectPrefix("250")
	client.sendCommand("MAIL FROM:<sender@example.com>")
	client.expectPrefix("250")
	client.sendCommand("RCPT TO:<missing@example.test>")
	client.expectPrefix("550")
}

func TestServerLogsDetailedRecipientRejection(t *testing.T) {
	fixture := newSMTPDirectServiceFixture(t)
	var logBuffer bytes.Buffer
	previousLogger := slog.Default()
	testLogger := slog.New(slog.NewTextHandler(&logBuffer, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(testLogger)
	defer slog.SetDefault(previousLogger)

	server := NewServer(Config{
		ListenAddr:      "127.0.0.1:0",
		Hostname:        "shiro.local",
		MaxMessageBytes: 1024 * 1024,
	}, fixture.service)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ready := make(chan struct{})
	go func() {
		if err := server.Start(ctx, func() { close(ready) }); err != nil {
			t.Errorf("smtp server start: %v", err)
		}
	}()
	<-ready
	defer server.Drain()

	conn, err := net.Dial("tcp", server.Addr())
	if err != nil {
		t.Fatalf("dial smtp: %v", err)
	}
	defer conn.Close()

	client := newSMTPClient(t, conn)
	client.expectPrefix("220")
	client.sendCommand("MAIL FROM:<sender@example.com>")
	client.expectPrefix("503")
	client.sendCommand("EHLO localhost")
	client.expectMultiline("250")
	client.sendCommand("MAIL FROM:<sender@example.com>")
	client.expectPrefix("250")
	client.sendCommand("RCPT TO:<missing@example.test>")
	client.expectPrefix("550")

	logOutput := logBuffer.String()
	if !strings.Contains(logOutput, "smtp recipient rejected") {
		t.Fatalf("expected smtp recipient rejected log, got %s", logOutput)
	}
	if !strings.Contains(logOutput, "recipient=missing@example.test") {
		t.Fatalf("expected rejected recipient in log, got %s", logOutput)
	}
	if !strings.Contains(logOutput, "mail_from=sender@example.com") {
		t.Fatalf("expected mail from in log, got %s", logOutput)
	}
	if !strings.Contains(logOutput, "reason=recipient_not_found_or_inactive_or_expired") {
		t.Fatalf("expected explicit rejection reason in log, got %s", logOutput)
	}
}

func TestServerAcceptsSequentialMessagesForDifferentMailboxes(t *testing.T) {
	fixture := newSMTPDirectServiceFixture(t)
	second, err := fixture.mailboxes.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "beta",
		Address:   "beta@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create second mailbox: %v", err)
	}

	server := NewServer(Config{
		ListenAddr:      "127.0.0.1:0",
		Hostname:        "shiro.local",
		MaxMessageBytes: 1024 * 1024,
	}, fixture.service)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ready := make(chan struct{})
	go func() {
		if err := server.Start(ctx, func() { close(ready) }); err != nil {
			t.Errorf("smtp server start: %v", err)
		}
	}()
	<-ready
	defer server.Drain()

	conn, err := net.Dial("tcp", server.Addr())
	if err != nil {
		t.Fatalf("dial smtp: %v", err)
	}
	defer conn.Close()

	client := newSMTPClient(t, conn)
	client.expectPrefix("220")
	client.sendCommand("EHLO localhost")
	client.expectMultiline("250")

	sendMessage := func(recipient string, subject string) {
		t.Helper()
		client.sendCommand("MAIL FROM:<sender@example.com>")
		client.expectPrefix("250")
		client.sendCommand("RCPT TO:<" + recipient + ">")
		client.expectPrefix("250")
		client.sendCommand("DATA")
		client.expectPrefix("354")
		client.sendData("From: sender@example.com\r\nTo: " + recipient + "\r\nSubject: " + subject + "\r\n\r\nhello embedded smtp")
		client.expectPrefix("250")
	}

	sendMessage(fixture.mailboxAddress, "First mailbox")
	sendMessage(second.Address, "Second mailbox")
	client.sendCommand("QUIT")
	client.expectPrefix("221")

	firstItems, err := fixture.repo.ListByMailboxID(context.Background(), fixture.mailboxID)
	if err != nil {
		t.Fatalf("list first mailbox messages: %v", err)
	}
	if len(firstItems) != 1 || firstItems[0].Subject != "First mailbox" {
		t.Fatalf("expected first mailbox message, got %#v", firstItems)
	}

	secondItems, err := fixture.repo.ListByMailboxID(context.Background(), second.ID)
	if err != nil {
		t.Fatalf("list second mailbox messages: %v", err)
	}
	if len(secondItems) != 1 || secondItems[0].Subject != "Second mailbox" {
		t.Fatalf("expected second mailbox message, got %#v", secondItems)
	}
}

func TestServerAcceptsMultipleRecipientsInSingleMessage(t *testing.T) {
	fixture := newSMTPDirectServiceFixture(t)
	second, err := fixture.mailboxes.Create(context.Background(), mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "beta",
		Address:   "beta@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create second mailbox: %v", err)
	}

	server := NewServer(Config{
		ListenAddr:      "127.0.0.1:0",
		Hostname:        "shiro.local",
		MaxMessageBytes: 1024 * 1024,
	}, fixture.service)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ready := make(chan struct{})
	go func() {
		if err := server.Start(ctx, func() { close(ready) }); err != nil {
			t.Errorf("smtp server start: %v", err)
		}
	}()
	<-ready
	defer server.Drain()

	conn, err := net.Dial("tcp", server.Addr())
	if err != nil {
		t.Fatalf("dial smtp: %v", err)
	}
	defer conn.Close()

	client := newSMTPClient(t, conn)
	client.expectPrefix("220")
	client.sendCommand("EHLO localhost")
	client.expectMultiline("250")
	client.sendCommand("MAIL FROM:<sender@example.com>")
	client.expectPrefix("250")
	client.sendCommand("RCPT TO:<" + fixture.mailboxAddress + ">")
	client.expectPrefix("250")
	client.sendCommand("RCPT TO:<" + second.Address + ">")
	client.expectPrefix("250")
	client.sendCommand("DATA")
	client.expectPrefix("354")
	client.sendData("From: sender@example.com\r\nTo: " + fixture.mailboxAddress + ", " + second.Address + "\r\nSubject: Broadcast\r\n\r\nhello embedded smtp")
	client.expectPrefix("250")
	client.sendCommand("QUIT")
	client.expectPrefix("221")

	firstItems, err := fixture.repo.ListByMailboxID(context.Background(), fixture.mailboxID)
	if err != nil {
		t.Fatalf("list first mailbox messages: %v", err)
	}
	if len(firstItems) != 1 || firstItems[0].Subject != "Broadcast" {
		t.Fatalf("expected first mailbox broadcast, got %#v", firstItems)
	}

	secondItems, err := fixture.repo.ListByMailboxID(context.Background(), second.ID)
	if err != nil {
		t.Fatalf("list second mailbox messages: %v", err)
	}
	if len(secondItems) != 1 || secondItems[0].Subject != "Broadcast" {
		t.Fatalf("expected second mailbox broadcast, got %#v", secondItems)
	}
}

func TestServerRejectsAttachmentLargerThanInboundPolicyWith552(t *testing.T) {
	fixture := newSMTPDirectServiceFixture(t)
	fixture.service.SetInboundPolicyProvider(func(context.Context, []mailbox.Mailbox) (ingest.InboundPolicy, error) {
		return ingest.InboundPolicy{MaxAttachmentSizeBytes: 8}, nil
	})

	server := NewServer(Config{
		ListenAddr:      "127.0.0.1:0",
		Hostname:        "shiro.local",
		MaxMessageBytes: 1024 * 1024,
	}, fixture.service)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ready := make(chan struct{})
	go func() {
		if err := server.Start(ctx, func() { close(ready) }); err != nil {
			t.Errorf("smtp server start: %v", err)
		}
	}()
	<-ready
	defer server.Drain()

	conn, err := net.Dial("tcp", server.Addr())
	if err != nil {
		t.Fatalf("dial smtp: %v", err)
	}
	defer conn.Close()

	client := newSMTPClient(t, conn)
	client.expectPrefix("220")
	client.sendCommand("EHLO localhost")
	client.expectMultiline("250")
	client.sendCommand("MAIL FROM:<sender@example.com>")
	client.expectPrefix("250")
	client.sendCommand("RCPT TO:<" + fixture.mailboxAddress + ">")
	client.expectPrefix("250")
	client.sendCommand("DATA")
	client.expectPrefix("354")
	client.sendData("From: sender@example.com\r\nTo: " + fixture.mailboxAddress + "\r\nSubject: Too big\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=abc\r\n\r\n--abc\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nhello direct smtp\r\n--abc\r\nContent-Type: text/plain\r\nContent-Disposition: attachment; filename=\"note.txt\"\r\n\r\nattachment body\r\n--abc--\r\n")
	client.expectPrefix("552")
}

func TestServerRejectsExecutableAttachmentWith550(t *testing.T) {
	fixture := newSMTPDirectServiceFixture(t)
	fixture.service.SetInboundPolicyProvider(func(context.Context, []mailbox.Mailbox) (ingest.InboundPolicy, error) {
		return ingest.InboundPolicy{RejectExecutableFiles: true}, nil
	})

	server := NewServer(Config{
		ListenAddr:      "127.0.0.1:0",
		Hostname:        "shiro.local",
		MaxMessageBytes: 1024 * 1024,
	}, fixture.service)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	ready := make(chan struct{})
	go func() {
		if err := server.Start(ctx, func() { close(ready) }); err != nil {
			t.Errorf("smtp server start: %v", err)
		}
	}()
	<-ready
	defer server.Drain()

	conn, err := net.Dial("tcp", server.Addr())
	if err != nil {
		t.Fatalf("dial smtp: %v", err)
	}
	defer conn.Close()

	client := newSMTPClient(t, conn)
	client.expectPrefix("220")
	client.sendCommand("EHLO localhost")
	client.expectMultiline("250")
	client.sendCommand("MAIL FROM:<sender@example.com>")
	client.expectPrefix("250")
	client.sendCommand("RCPT TO:<" + fixture.mailboxAddress + ">")
	client.expectPrefix("250")
	client.sendCommand("DATA")
	client.expectPrefix("354")
	client.sendData("From: sender@example.com\r\nTo: " + fixture.mailboxAddress + "\r\nSubject: Executable\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary=abc\r\n\r\n--abc\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nhello direct smtp\r\n--abc\r\nContent-Type: application/octet-stream\r\nContent-Disposition: attachment; filename=\"run.exe\"\r\n\r\nMZbinary\r\n--abc--\r\n")
	client.expectPrefix("550")
}

func TestServerStartReturnsListenError(t *testing.T) {
	fixture := newSMTPDirectServiceFixture(t)
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("reserve listener: %v", err)
	}
	defer listener.Close()

	server := NewServer(Config{
		ListenAddr: listener.Addr().String(),
		Hostname:   "shiro.local",
	}, fixture.service)

	err = server.Start(context.Background(), nil)
	if err == nil {
		t.Fatal("expected listen error")
	}
	if !strings.Contains(err.Error(), "smtp listen failed") {
		t.Fatalf("expected smtp listen failed error, got %v", err)
	}
}

type smtpFixture struct {
	service        *ingest.DirectService
	repo           *ingest.MemoryMessageRepository
	mailboxes      *mailbox.MemoryRepository
	mailboxID      uint64
	mailboxAddress string
}

func newSMTPDirectServiceFixture(t *testing.T) smtpFixture {
	t.Helper()

	ctx := context.Background()
	mailboxes := mailbox.NewMemoryRepository()
	target, err := mailboxes.Create(ctx, mailbox.Mailbox{
		UserID:    1,
		DomainID:  1,
		Domain:    "example.test",
		LocalPart: "alpha",
		Address:   "alpha@example.test",
		Status:    "active",
		ExpiresAt: time.Now().Add(2 * time.Hour),
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("create mailbox: %v", err)
	}

	repo := ingest.NewMemoryMessageRepository()
	storage, err := ingest.NewLocalFileStorage(t.TempDir())
	if err != nil {
		t.Fatalf("create local file storage: %v", err)
	}

	return smtpFixture{
		service:        ingest.NewDirectService(mailboxes, repo, storage),
		repo:           repo,
		mailboxes:      mailboxes,
		mailboxID:      target.ID,
		mailboxAddress: target.Address,
	}
}

type smtpClient struct {
	t      *testing.T
	conn   net.Conn
	reader *bufio.Reader
}

func newSMTPClient(t *testing.T, conn net.Conn) *smtpClient {
	t.Helper()
	return &smtpClient{
		t:      t,
		conn:   conn,
		reader: bufio.NewReader(conn),
	}
}

func (c *smtpClient) sendCommand(line string) {
	c.t.Helper()
	if _, err := fmt.Fprintf(c.conn, "%s\r\n", line); err != nil {
		c.t.Fatalf("send command %q: %v", line, err)
	}
}

func (c *smtpClient) sendData(body string) {
	c.t.Helper()
	if _, err := fmt.Fprintf(c.conn, "%s\r\n.\r\n", body); err != nil {
		c.t.Fatalf("send data: %v", err)
	}
}

func (c *smtpClient) expectPrefix(prefix string) {
	c.t.Helper()
	line, err := c.reader.ReadString('\n')
	if err != nil {
		c.t.Fatalf("read response: %v", err)
	}
	if !strings.HasPrefix(strings.TrimRight(line, "\r\n"), prefix) {
		c.t.Fatalf("expected prefix %s, got %q", prefix, line)
	}
}

func (c *smtpClient) expectMultiline(prefix string) {
	c.t.Helper()
	for {
		line, err := c.reader.ReadString('\n')
		if err != nil {
			c.t.Fatalf("read multiline response: %v", err)
		}
		trimmed := strings.TrimRight(line, "\r\n")
		if !strings.HasPrefix(trimmed, prefix) {
			c.t.Fatalf("expected prefix %s, got %q", prefix, trimmed)
		}
		if len(trimmed) >= 4 && trimmed[3] == ' ' {
			return
		}
	}
}
