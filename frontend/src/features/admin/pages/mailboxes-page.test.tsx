import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminMailbox,
  extendAdminMailbox,
  fetchAdminMailboxDomains,
  fetchAdminMailboxMessageDetail,
  fetchAdminMailboxMessageExtractions,
  fetchAdminMailboxMessages,
  fetchAdminMailboxes,
  fetchAdminUsers,
  releaseAdminMailbox,
} from "../api";
import { AdminMailboxesPage } from "./mailboxes-page";

vi.mock("../api", () => ({
  fetchAdminUsers: vi.fn(),
  fetchAdminMailboxDomains: vi.fn(),
  fetchAdminMailboxes: vi.fn(),
  fetchAdminMailboxMessages: vi.fn(),
  fetchAdminMailboxMessageDetail: vi.fn(),
  fetchAdminMailboxMessageExtractions: vi.fn(),
  createAdminMailbox: vi.fn(),
  extendAdminMailbox: vi.fn(),
  releaseAdminMailbox: vi.fn(),
  downloadAdminMailboxMessageRaw: vi.fn(),
  downloadAdminMailboxMessageAttachment: vi.fn(),
}));

describe("AdminMailboxesPage", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();

    vi.mocked(fetchAdminUsers).mockResolvedValue([
      {
        id: 1,
        username: "alice",
        email: "alice@example.com",
        status: "active",
        emailVerified: true,
        roles: ["user"],
        mailboxes: 1,
      },
      {
        id: 2,
        username: "bob",
        email: "bob@example.com",
        status: "active",
        emailVerified: false,
        roles: ["user"],
        mailboxes: 0,
      },
    ]);
    vi.mocked(fetchAdminMailboxDomains).mockResolvedValue([
      {
        id: 1,
        domain: "shiro.local",
        status: "active",
        visibility: "platform_public",
        publicationStatus: "published",
        verificationScore: 100,
        healthStatus: "healthy",
        isDefault: true,
        weight: 100,
        rootDomain: "shiro.local",
        parentDomain: "",
        level: 0,
        kind: "root",
      },
    ]);
    vi.mocked(fetchAdminMailboxes).mockResolvedValue([
      {
        id: 1,
        userId: 1,
        domainId: 1,
        domain: "shiro.local",
        localPart: "alpha",
        address: "alpha@shiro.local",
        ownerUsername: "alice",
        status: "active",
        permanent: false,
        expiresAt: "2026-04-04T10:00:00Z",
        createdAt: "2026-04-03T10:00:00Z",
        updatedAt: "2026-04-03T12:00:00Z",
      },
      {
        id: 2,
        userId: 1,
        domainId: 1,
        domain: "shiro.local",
        localPart: "beta",
        address: "beta@shiro.local",
        ownerUsername: "alice",
        status: "released",
        permanent: false,
        expiresAt: "2026-04-03T10:00:00Z",
        createdAt: "2026-04-02T10:00:00Z",
        updatedAt: "2026-04-02T12:00:00Z",
      },
    ]);
    vi.mocked(fetchAdminMailboxMessages).mockResolvedValue([
      {
        id: 11,
        mailboxId: 1,
        legacyMailboxKey: "",
        legacyMessageKey: "",
        sourceKind: "smtp",
        sourceMessageId: "msg-11",
        mailboxAddress: "alpha@shiro.local",
        fromAddr: "sender@example.com",
        toAddr: "alpha@shiro.local",
        subject: "Admin hello",
        textPreview: "preview body",
        htmlPreview: "",
        hasAttachments: false,
        attachmentCount: 0,
        sizeBytes: 128,
        isRead: false,
        isDeleted: false,
        receivedAt: "2026-04-03T12:30:00Z",
      },
    ]);
    vi.mocked(fetchAdminMailboxMessageDetail).mockResolvedValue({
      id: 11,
      mailboxId: 1,
      legacyMailboxKey: "",
      legacyMessageKey: "",
      sourceKind: "smtp",
      sourceMessageId: "msg-11",
      mailboxAddress: "alpha@shiro.local",
      fromAddr: "sender@example.com",
      toAddr: "alpha@shiro.local",
      subject: "Admin hello",
      textPreview: "preview body",
      htmlPreview: "",
      textBody: "full admin body",
      htmlBody: "",
      headers: {},
      rawStorageKey: "",
      hasAttachments: false,
      sizeBytes: 128,
      isRead: false,
      isDeleted: false,
      receivedAt: "2026-04-03T12:30:00Z",
      attachments: [],
    });
    vi.mocked(fetchAdminMailboxMessageExtractions).mockResolvedValue({
      items: [
        {
          ruleId: 7,
          ruleName: "验证码模板",
          label: "验证码",
          sourceType: "admin_default",
          sourceField: "subject",
          value: "834271",
          values: ["834271"],
        },
      ],
    });
    vi.mocked(createAdminMailbox).mockResolvedValue({
      id: 3,
      userId: 1,
      domainId: 1,
      domain: "shiro.local",
      localPart: "newbox",
      address: "newbox@shiro.local",
      ownerUsername: "alice",
      status: "active",
      permanent: false,
      expiresAt: "2026-04-05T10:00:00Z",
      createdAt: "2026-04-03T10:00:00Z",
      updatedAt: "2026-04-03T10:00:00Z",
    });
    vi.mocked(extendAdminMailbox).mockResolvedValue({
      id: 1,
      userId: 1,
      domainId: 1,
      domain: "shiro.local",
      localPart: "alpha",
      address: "alpha@shiro.local",
      ownerUsername: "alice",
      status: "active",
      permanent: false,
      expiresAt: "2026-04-05T10:00:00Z",
      createdAt: "2026-04-03T10:00:00Z",
      updatedAt: "2026-04-03T13:00:00Z",
    });
    vi.mocked(releaseAdminMailbox).mockResolvedValue({
      id: 1,
      userId: 1,
      domainId: 1,
      domain: "shiro.local",
      localPart: "alpha",
      address: "alpha@shiro.local",
      ownerUsername: "alice",
      status: "released",
      permanent: false,
      expiresAt: "2026-04-04T10:00:00Z",
      createdAt: "2026-04-03T10:00:00Z",
      updatedAt: "2026-04-03T13:00:00Z",
    });
  });

  function renderPage() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AdminMailboxesPage />
      </QueryClientProvider>,
    );
  }

  it("renders admin mailbox management with active mailbox list", async () => {
    renderPage();

    expect(await screen.findByText("邮箱管理")).toBeInTheDocument();
    expect((await screen.findAllByText("alpha@shiro.local")).length).toBeGreaterThan(0);
    expect(screen.queryByText("beta@shiro.local")).not.toBeInTheDocument();
    expect(await screen.findByText(/alice · shiro\.local/)).toBeInTheDocument();
    expect(await screen.findByText("full admin body")).toBeInTheDocument();
    expect(await screen.findByText("验证码")).toBeInTheDocument();
    expect(await screen.findByText("834271")).toBeInTheDocument();
  });

  it("creates mailbox from the admin creation form", async () => {
    renderPage();

    fireEvent.change(await screen.findByPlaceholderText("留空则自动生成"), {
      target: { value: "newbox" },
    });
    fireEvent.click(screen.getByRole("button", { name: "创建邮箱" }));

    await waitFor(() => {
      expect(vi.mocked(createAdminMailbox).mock.calls[0]?.[0]).toMatchObject({
        userId: 1,
        domainId: 1,
        expiresInHours: 24,
        localPart: "newbox",
      });
    });
  });

  it("extends and releases the selected mailbox", async () => {
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "续期 24 小时" }));
    await waitFor(() => {
      expect(vi.mocked(extendAdminMailbox).mock.calls[0]?.[0]).toBe(1);
      expect(vi.mocked(extendAdminMailbox).mock.calls[0]?.[1]).toBe(24);
    });

    fireEvent.click(screen.getByRole("button", { name: "释放邮箱" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认释放" }));

    await waitFor(() => {
      expect(vi.mocked(releaseAdminMailbox).mock.calls[0]?.[0]).toBe(1);
    });
  });
});
