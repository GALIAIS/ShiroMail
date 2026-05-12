import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAdminMailExtractorRule,
  deleteAdminMailExtractorRule,
  fetchAdminMailExtractorRules,
  fetchAdminMailboxMessages,
  fetchAdminMailboxes,
} from "../api";
import { AdminExtractorTemplatesPage } from "./extractor-templates-page";

vi.mock("../api", () => ({
  fetchAdminMailExtractorRules: vi.fn(),
  fetchAdminMailboxes: vi.fn(),
  fetchAdminMailboxMessages: vi.fn(),
  createAdminMailExtractorRule: vi.fn(),
  updateAdminMailExtractorRule: vi.fn(),
  deleteAdminMailExtractorRule: vi.fn(),
  testAdminMailExtractorRule: vi.fn(),
}));

describe("AdminExtractorTemplatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fetchAdminMailExtractorRules).mockResolvedValue([
      {
        id: 41,
        sourceType: "admin_default",
        templateKey: "mail-code",
        name: "系统验证码模板",
        description: "后台默认模板",
        label: "验证码",
        enabled: true,
        targetFields: ["subject"],
        pattern: "\\b(\\d{6})\\b",
        flags: "i",
        resultMode: "capture_group",
        captureGroupIndex: 1,
        mailboxIds: [],
        domainIds: [],
        senderContains: "",
        subjectContains: "",
        sortOrder: 100,
      },
    ]);
    vi.mocked(fetchAdminMailboxes).mockResolvedValue([
      {
        id: 5,
        userId: 1,
        domainId: 1,
        domain: "example.test",
        localPart: "ops",
        address: "ops@example.test",
        ownerUsername: "admin",
        status: "active",
        permanent: false,
        expiresAt: "2026-04-07T10:00:00Z",
        createdAt: "2026-04-07T09:00:00Z",
        updatedAt: "2026-04-07T09:30:00Z",
      },
    ]);
    vi.mocked(fetchAdminMailboxMessages).mockResolvedValue([
      {
        id: 51,
        mailboxId: 5,
        legacyMailboxKey: "",
        legacyMessageKey: "",
        sourceKind: "smtp",
        sourceMessageId: "msg-51",
        mailboxAddress: "ops@example.test",
        fromAddr: "sender@example.com",
        toAddr: "ops@example.test",
        subject: "验证码 654321",
        textPreview: "body",
        htmlPreview: "",
        hasAttachments: false,
        attachmentCount: 0,
        sizeBytes: 128,
        isRead: false,
        isDeleted: false,
        receivedAt: "2026-04-07T09:30:00Z",
      },
    ]);
    vi.mocked(createAdminMailExtractorRule).mockResolvedValue({
      id: 52,
      sourceType: "admin_default",
      templateKey: "created-template",
      name: "登录验证码模板",
      description: "",
      label: "登录码",
      enabled: true,
      targetFields: ["subject"],
      pattern: "\\b(\\d{6})\\b",
      flags: "i",
      resultMode: "capture_group",
      captureGroupIndex: 1,
      mailboxIds: [],
      domainIds: [],
      senderContains: "",
      subjectContains: "",
      sortOrder: 100,
    });
    vi.mocked(deleteAdminMailExtractorRule).mockResolvedValue({ ok: true });
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
        <AdminExtractorTemplatesPage />
      </QueryClientProvider>,
    );
  }

  it("renders existing admin extractor templates", async () => {
    renderPage();

    expect(await screen.findByText("系统验证码模板")).toBeInTheDocument();
    expect(await screen.findByText("验证码")).toBeInTheDocument();
  });

  it("creates a template", async () => {
    renderPage();

    fireEvent.change((await screen.findAllByLabelText("模板名称"))[0], { target: { value: "登录验证码模板" } });
    fireEvent.change(screen.getAllByLabelText("正则表达式")[0], {
      target: { value: "\\b(\\d{6})\\b" },
    });

    fireEvent.click(screen.getAllByRole("button", { name: "保存模板" })[0]);
    await waitFor(() => {
      expect(vi.mocked(createAdminMailExtractorRule).mock.calls[0]?.[0]).toMatchObject({
        name: "登录验证码模板",
      });
    });
  });

  it("deletes an existing template", async () => {
    renderPage();

    fireEvent.click((await screen.findAllByText("系统验证码模板"))[0]);
    fireEvent.click((await screen.findAllByRole("button", { name: "删除模板" }))[0]);

    await waitFor(() => {
      expect(deleteAdminMailExtractorRule).toHaveBeenCalledWith(41);
    });
  });

  it("normalizes malformed template payloads instead of crashing", async () => {
    vi.mocked(fetchAdminMailExtractorRules).mockResolvedValueOnce([
      {
        id: 61,
        sourceType: "admin_default",
        templateKey: "broken-template",
        name: "异常模板",
        description: "",
        label: "",
        enabled: true,
        targetFields: null as never,
        pattern: "\\b(\\d{6})\\b",
        flags: null as never,
        resultMode: null as never,
        captureGroupIndex: null as never,
        mailboxIds: null as never,
        domainIds: null as never,
        senderContains: null as never,
        subjectContains: null as never,
        sortOrder: null as never,
      },
    ]);

    renderPage();

    expect(await screen.findByText("异常模板")).toBeInTheDocument();
  });
});
