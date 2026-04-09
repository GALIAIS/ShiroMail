import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchPublicSiteSettings } from "@/features/home/api";
import { resendEmailVerification, resetPassword } from "../api";
import { ResetPasswordPage } from "./reset-password-page";

vi.mock("../api", () => ({
  resetPassword: vi.fn(),
  resendEmailVerification: vi.fn(),
  getAuthErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

vi.mock("@/features/home/api", () => ({
  fetchPublicSiteSettings: vi.fn(),
}));

describe("ResetPasswordPage", () => {
  type ResendResult = {
    status: "verification_required";
    email: string;
    verificationTicket: string;
    expiresInSeconds: number;
  };

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.mocked(resetPassword).mockResolvedValue({ status: "ok" });
    vi.mocked(resendEmailVerification).mockResolvedValue({
      status: "verification_required",
      email: "reset-user@example.com",
      verificationTicket: "ticket-2",
      expiresInSeconds: 900,
    });
    vi.mocked(fetchPublicSiteSettings).mockResolvedValue({
      identity: {
        siteName: "Shiro Email",
        slogan: "Enterprise temporary mail platform",
        supportEmail: "support@shiro.local",
        siteIconUrl: "",
        appBaseUrl: "http://localhost:5173",
        defaultLanguage: "zh-CN",
        defaultTimeZone: "Asia/Shanghai",
        ambientThemeEnabled: true,
        ambientThemeIntensity: "balanced",
      },
      mailDns: {
        mxTarget: "smtp.shiro.local",
        dkimCnameTarget: "shiro._domainkey.shiro.local",
      },
    });
  });

  function renderPage(initialEntry = "/auth/reset-password?ticket=ticket-1&email=reset-user@example.com&code=654321") {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Routes>
            <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
            <Route path="/" element={<div>home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("prefills code from the reset password link and submits reset", async () => {
    renderPage();

    expect(screen.getByLabelText("重置验证码")).toHaveValue("654321");
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "BetterSecret456!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    await waitFor(() => {
      expect(vi.mocked(resetPassword)).toHaveBeenCalledWith({
        verificationTicket: "ticket-1",
        code: "654321",
        newPassword: "BetterSecret456!",
      });
    });
  });

  it("resends the code and updates the active verification ticket", async () => {
    renderPage("/auth/reset-password?ticket=ticket-1&email=reset-user@example.com");

    fireEvent.click(screen.getByRole("button", { name: "重新发送验证码" }));

    await waitFor(() => {
      expect(vi.mocked(resendEmailVerification)).toHaveBeenCalledWith({
        verificationTicket: "ticket-1",
      });
    });

    fireEvent.change(screen.getByLabelText("重置验证码"), {
      target: { value: "111222" },
    });
    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "BetterSecret456!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认重置" }));

    await waitFor(() => {
      expect(vi.mocked(resetPassword)).toHaveBeenCalledWith({
        verificationTicket: "ticket-2",
        code: "111222",
        newPassword: "BetterSecret456!",
      });
    });
  });

  it("only shows resend loading state when resending reset code", async () => {
    let resolveResend: (value: ResendResult) => void = () => {};
    vi.mocked(resendEmailVerification).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResend = resolve;
        }),
    );

    renderPage("/auth/reset-password?ticket=ticket-1&email=reset-user@example.com&code=654321");

    fireEvent.change(screen.getByLabelText("新密码"), {
      target: { value: "BetterSecret456!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "重新发送验证码" }));

    expect(screen.getByRole("button", { name: "处理中..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认重置" })).toBeDisabled();

    resolveResend({
      status: "verification_required",
      email: "reset-user@example.com",
      verificationTicket: "ticket-2",
      expiresInSeconds: 900,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重新发送验证码" })).toBeEnabled();
    });
  });
});
