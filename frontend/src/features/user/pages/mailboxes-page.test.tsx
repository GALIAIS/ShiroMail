import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCustomMailbox,
  downloadMailboxMessageAttachment,
  downloadMailboxMessageRaw,
  extendMailbox,
  fetchDashboard,
  fetchMailboxMessageDetail,
  fetchMailboxMessageExtractions,
  fetchMailboxMessages,
  releaseMailbox,
} from "../api";
import { UserMailboxPage } from "./mailboxes-page";

vi.mock("../api", () => ({
  fetchDashboard: vi.fn(),
  fetchMailboxMessages: vi.fn(),
  fetchMailboxMessageDetail: vi.fn(),
  fetchMailboxMessageExtractions: vi.fn(),
  createCustomMailbox: vi.fn(),
  extendMailbox: vi.fn(),
  releaseMailbox: vi.fn(),
  downloadMailboxMessageRaw: vi.fn(),
  downloadMailboxMessageAttachment: vi.fn(),
}));

describe("UserMailboxPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fetchDashboard).mockResolvedValue({
      totalMailboxCount: 1,
      activeMailboxCount: 1,
      availableDomains: [
        {
          id: 1,
          domain: "example.test",
          status: "active",
          visibility: "private",
          publicationStatus: "draft",
          verificationScore: 0,
          healthStatus: "healthy",
          isDefault: true,
          weight: 100,
          rootDomain: "example.test",
          parentDomain: "",
          level: 0,
          kind: "root",
        },
      ],
      mailboxes: [
        {
          id: 7,
          userId: 1,
          domainId: 1,
          domain: "example.test",
          localPart: "alpha",
          address: "alpha@example.test",
          status: "active",
          expiresAt: "2026-04-03T10:00:00Z",
          retentionDays: 0,
          createdAt: "2026-04-02T10:00:00Z",
          updatedAt: "2026-04-02T10:00:00Z",
        },
      ],
    });

    vi.mocked(fetchMailboxMessages).mockResolvedValue([
      {
        id: 99,
        mailboxId: 7,
        legacyMailboxKey: "",
        legacyMessageKey: "",
        sourceKind: "smtp",
        sourceMessageId: "msg-99",
        mailboxAddress: "alpha@example.test",
        fromAddr: "sender@example.com",
        toAddr: "alpha@example.test",
        subject: "Welcome aboard",
        textPreview: "hello preview",
        htmlPreview: "",
        hasAttachments: true,
        attachmentCount: 1,
        sizeBytes: 128,
        isRead: false,
        isDeleted: false,
        receivedAt: "2026-04-02T10:00:00Z",
      },
    ]);
    vi.mocked(fetchMailboxMessageDetail).mockResolvedValue({
      id: 99,
      mailboxId: 7,
      legacyMailboxKey: "",
      legacyMessageKey: "",
      sourceKind: "smtp",
      sourceMessageId: "msg-99",
      mailboxAddress: "alpha@example.test",
      fromAddr: "sender@example.com",
      toAddr: "alpha@example.test",
      subject: "Welcome aboard",
      textPreview: "hello preview",
      htmlPreview: "",
      textBody: "hello full body",
      htmlBody: "",
      headers: {
        Subject: ["Welcome aboard"],
        From: ["sender@example.com"],
      },
      rawStorageKey: "raw/2026/04/02/message.eml",
      hasAttachments: true,
      sizeBytes: 128,
      isRead: false,
      isDeleted: false,
      receivedAt: "2026-04-02T10:00:00Z",
      attachments: [
        {
          fileName: "note.txt",
          contentType: "text/plain",
          storageKey: "attachments/01-note.txt",
          sizeBytes: 15,
        },
      ],
    });
    vi.mocked(fetchMailboxMessageExtractions).mockResolvedValue({
      items: [
        {
          ruleId: 3,
          ruleName: "验证码",
          label: "验证码",
          sourceType: "user",
          sourceField: "subject",
          value: "123456",
          values: ["123456"],
        },
      ],
    });

    vi.mocked(createCustomMailbox).mockResolvedValue({
      id: 8,
      userId: 1,
      domainId: 1,
      domain: "example.test",
      localPart: "beta",
      address: "beta@example.test",
      status: "active",
      expiresAt: "2026-04-03T10:00:00Z",
      createdAt: "2026-04-02T10:00:00Z",
      updatedAt: "2026-04-02T10:00:00Z",
    });
    vi.mocked(extendMailbox).mockResolvedValue({
      id: 7,
      userId: 1,
      domainId: 1,
      domain: "example.test",
      localPart: "alpha",
      address: "alpha@example.test",
      status: "active",
      expiresAt: "2026-04-04T10:00:00Z",
      createdAt: "2026-04-02T10:00:00Z",
      updatedAt: "2026-04-02T10:00:00Z",
    });
    vi.mocked(releaseMailbox).mockResolvedValue({
      id: 7,
      userId: 1,
      domainId: 1,
      domain: "example.test",
      localPart: "alpha",
      address: "alpha@example.test",
      status: "released",
      expiresAt: "2026-04-03T10:00:00Z",
      createdAt: "2026-04-02T10:00:00Z",
      updatedAt: "2026-04-02T10:00:00Z",
    });
    vi.mocked(downloadMailboxMessageRaw).mockResolvedValue();
    vi.mocked(downloadMailboxMessageAttachment).mockResolvedValue();
  });

  it("renders message detail and triggers raw plus attachment downloads", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UserMailboxPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Welcome aboard")).toBeInTheDocument();
    expect(await screen.findByText("hello full body")).toBeInTheDocument();
    expect(await screen.findByText("123456")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下载原文" }));
    await waitFor(() => {
      expect(downloadMailboxMessageRaw).toHaveBeenCalledWith(7, 99);
    });

    fireEvent.click(screen.getByRole("button", { name: "下载附件" }));
    await waitFor(() => {
      expect(downloadMailboxMessageAttachment).toHaveBeenCalledWith(7, 99, 0);
    });
  });

  it("handles legacy null headers and attachments without crashing", async () => {
    vi.mocked(fetchMailboxMessages).mockResolvedValueOnce([
      {
        id: 100,
        mailboxId: 7,
        legacyMailboxKey: "",
        legacyMessageKey: "",
        sourceKind: "smtp",
        sourceMessageId: "msg-100",
        mailboxAddress: "alpha@example.test",
        fromAddr: "sender@example.com",
        toAddr: "alpha@example.test",
        subject: "Null-safe message",
        textPreview: "fallback preview",
        htmlPreview: "",
        hasAttachments: false,
        attachmentCount: 0,
        sizeBytes: 0,
        isRead: false,
        isDeleted: false,
        receivedAt: "2026-04-02T10:00:00Z",
      },
    ]);
    vi.mocked(fetchMailboxMessageDetail).mockResolvedValueOnce({
      id: 100,
      mailboxId: 7,
      legacyMailboxKey: "",
      legacyMessageKey: "",
      sourceKind: "smtp",
      sourceMessageId: "msg-100",
      mailboxAddress: "alpha@example.test",
      fromAddr: "sender@example.com",
      toAddr: "alpha@example.test",
      subject: "Null-safe message",
      textPreview: "fallback preview",
      htmlPreview: "",
      textBody: "fallback body",
      htmlBody: "",
      headers: null as unknown as Record<string, string[]>,
      rawStorageKey: "",
      hasAttachments: false,
      sizeBytes: 0,
      isRead: false,
      isDeleted: false,
      receivedAt: "2026-04-02T10:00:00Z",
      attachments: null as unknown as [],
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UserMailboxPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByText("Null-safe message")).toBeInTheDocument();
    expect(await screen.findByText("这封邮件没有附件。")).toBeInTheDocument();
  });

  it("prefills domain selection from the route query", async () => {
    vi.mocked(fetchDashboard).mockResolvedValueOnce({
      totalMailboxCount: 0,
      activeMailboxCount: 0,
      availableDomains: [
        {
          id: 1,
          domain: "example.test",
          status: "active",
          visibility: "private",
          publicationStatus: "draft",
          verificationScore: 0,
          healthStatus: "healthy",
          isDefault: true,
          weight: 100,
          rootDomain: "example.test",
          parentDomain: "",
          level: 0,
          kind: "root",
        },
        {
          id: 2,
          domain: "mail.example.test",
          status: "active",
          visibility: "private",
          publicationStatus: "draft",
          verificationScore: 0,
          healthStatus: "healthy",
          isDefault: false,
          weight: 90,
          rootDomain: "example.test",
          parentDomain: "example.test",
          level: 1,
          kind: "subdomain",
        },
      ],
      mailboxes: [],
    });
    vi.mocked(fetchMailboxMessages).mockResolvedValueOnce([]);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <MemoryRouter initialEntries={["/dashboard/mailboxes?domainId=2"]}>
        <QueryClientProvider client={queryClient}>
          <UserMailboxPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    const selectedDomainInputs = await screen.findAllByDisplayValue("mail.example.test");
    expect(selectedDomainInputs.length).toBeGreaterThan(0);
  });

  it("removes released mailboxes from the user view immediately", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UserMailboxPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect((await screen.findAllByText("alpha@example.test")).length).toBeGreaterThan(0);

    fireEvent.click((await screen.findAllByRole("button", { name: "释放邮箱" }))[0]);
    fireEvent.click(await screen.findByRole("button", { name: "确认释放" }));

    await waitFor(() => {
      expect(vi.mocked(releaseMailbox).mock.calls[0]?.[0]).toBe(7);
    });

    expect((await screen.findAllByText("还没有可用邮箱")).length).toBeGreaterThan(0);
  });
});
