import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { createWebhook, fetchWebhooks, toggleWebhook, updateWebhook } from "../api";
import { UserWebhooksPage } from "./webhooks-page";

vi.mock("../api", () => ({
  fetchWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  toggleWebhook: vi.fn(),
}));

describe("UserWebhooksPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(fetchWebhooks).mockResolvedValue([
      {
        id: 1,
        userId: 7,
        name: "primary",
        targetUrl: "https://sandbox.local/webhooks/primary",
        secretPreview: "whsec_123",
        events: ["message.received"],
        enabled: true,
        createdAt: "2026-04-03T10:00:00Z",
        updatedAt: "2026-04-03T10:05:00Z",
      },
    ]);

    vi.mocked(createWebhook).mockResolvedValue({
      id: 2,
      userId: 7,
      name: "secondary",
      targetUrl: "https://sandbox.local/webhooks/secondary",
      secretPreview: "whsec_456",
      events: ["mailbox.released"],
      enabled: true,
      createdAt: "2026-04-03T10:00:00Z",
      updatedAt: "2026-04-03T10:10:00Z",
    });

    vi.mocked(updateWebhook).mockResolvedValue({
      id: 1,
      userId: 7,
      name: "primary-updated",
      targetUrl: "https://sandbox.local/webhooks/primary-updated",
      secretPreview: "whsec_123",
      events: ["message.received", "mailbox.released"],
      enabled: true,
      createdAt: "2026-04-03T10:00:00Z",
      updatedAt: "2026-04-03T10:12:00Z",
    });

    vi.mocked(toggleWebhook).mockResolvedValue({
      id: 1,
      userId: 7,
      name: "primary",
      targetUrl: "https://sandbox.local/webhooks/primary",
      secretPreview: "whsec_123",
      events: ["message.received"],
      enabled: false,
      createdAt: "2026-04-03T10:00:00Z",
      updatedAt: "2026-04-03T10:12:00Z",
    });
  });

  it("creates webhooks inside a dialog instead of rendering the form inline", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UserWebhooksPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect(
      screen.queryByPlaceholderText("https://sandbox.local/webhooks/order"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "创建 Webhook" }));

    const dialog = await screen.findByRole("dialog", { name: "创建 Webhook" });
    const dialogQueries = within(dialog);

    fireEvent.change(dialogQueries.getByPlaceholderText("Webhook 名称"), {
      target: { value: "secondary" },
    });
    fireEvent.change(
      dialogQueries.getByPlaceholderText("https://sandbox.local/webhooks/order"),
      {
        target: { value: "https://sandbox.local/webhooks/secondary" },
      },
    );
    fireEvent.change(
      dialogQueries.getByPlaceholderText("message.received, mailbox.released"),
      {
        target: { value: "mailbox.released" },
      },
    );
    fireEvent.click(dialogQueries.getByRole("button", { name: "创建 Webhook" }));

    await waitFor(() => {
      expect(vi.mocked(createWebhook).mock.calls[0]?.[0]).toEqual({
        name: "secondary",
        targetUrl: "https://sandbox.local/webhooks/secondary",
        events: ["mailbox.released"],
      });
    });
  });

  it("reuses the dialog for editing existing webhooks", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <UserWebhooksPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "编辑" }));

    const dialog = await screen.findByRole("dialog", { name: "编辑 Webhook" });
    const dialogQueries = within(dialog);

    fireEvent.change(dialogQueries.getByPlaceholderText("Webhook 名称"), {
      target: { value: "primary-updated" },
    });
    fireEvent.change(
      dialogQueries.getByPlaceholderText("https://sandbox.local/webhooks/order"),
      {
        target: {
          value: "https://sandbox.local/webhooks/primary-updated",
        },
      },
    );
    fireEvent.change(
      dialogQueries.getByPlaceholderText("message.received, mailbox.released"),
      {
        target: { value: "message.received, mailbox.released" },
      },
    );
    fireEvent.click(dialogQueries.getByRole("button", { name: "保存修改" }));

    await waitFor(() => {
      expect(vi.mocked(updateWebhook).mock.calls[0]?.[0]).toBe(1);
      expect(vi.mocked(updateWebhook).mock.calls[0]?.[1]).toEqual({
        name: "primary-updated",
        targetUrl: "https://sandbox.local/webhooks/primary-updated",
        events: ["message.received", "mailbox.released"],
      });
    });
  });
});
