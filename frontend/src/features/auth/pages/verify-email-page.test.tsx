import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/lib/auth-store";
import { fetchPublicSiteSettings } from "@/features/home/api";
import { confirmEmailVerification, resendEmailVerification } from "../api";
import { VerifyEmailPage } from "./verify-email-page";

vi.mock("../api", () => ({
  confirmEmailVerification: vi.fn(),
  resendEmailVerification: vi.fn(),
  getAuthErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

vi.mock("@/features/home/api", () => ({
  fetchPublicSiteSettings: vi.fn(),
}));

describe("VerifyEmailPage", () => {
  type ResendResult = {
    status: "verification_required";
    email: string;
    verificationTicket: string;
    expiresInSeconds: number;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      accessToken: null,
      refreshToken: null,
      user: null,
    });
    vi.mocked(confirmEmailVerification).mockResolvedValue({
      accessToken: "token",
      refreshToken: "refresh",
      user: {
        userId: 1,
        username: "verify-user",
        roles: ["user"],
      },
    });
    vi.mocked(resendEmailVerification).mockResolvedValue({
      status: "verification_required",
      email: "verify-user@example.com",
      verificationTicket: "ticket-2",
      expiresInSeconds: 900,
    });
    vi.mocked(fetchPublicSiteSettings).mockResolvedValue({
      identity: {
        siteName: "Shiro Email",
        slogan: "Enterprise temporary mail platform",
        supportEmail: "support@shiro.local",
        appBaseUrl: "http://localhost:5173",
        defaultLanguage: "zh-CN",
        defaultTimeZone: "Asia/Shanghai",
      },
      mailDns: {
        mxTarget: "smtp.shiro.local",
        dkimCnameTarget: "shiro._domainkey.shiro.local",
      },
    });
  });

  function renderPage(initialEntry = "/auth/verify-email?ticket=ticket-1&email=verify-user@example.com&code=123456") {
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
            <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it("prefills the verification code from the email link", async () => {
    renderPage();

    expect(screen.getByLabelText("邮箱验证码")).toHaveValue("123456");
    fireEvent.click(screen.getByRole("button", { name: "确认验证" }));

    await waitFor(() => {
      expect(vi.mocked(confirmEmailVerification)).toHaveBeenCalledWith({
        verificationTicket: "ticket-1",
        code: "123456",
      });
    });
  });

  it("uses the latest ticket after resending verification code", async () => {
    renderPage("/auth/verify-email?ticket=ticket-1&email=verify-user@example.com");

    fireEvent.click(screen.getByRole("button", { name: "重新发送验证码" }));

    await waitFor(() => {
      expect(vi.mocked(resendEmailVerification)).toHaveBeenCalledWith({
        verificationTicket: "ticket-1",
      });
    });

    fireEvent.change(screen.getByLabelText("邮箱验证码"), {
      target: { value: "654321" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认验证" }));

    await waitFor(() => {
      expect(vi.mocked(confirmEmailVerification)).toHaveBeenCalledWith({
        verificationTicket: "ticket-2",
        code: "654321",
      });
    });
  });

  it("only shows resend loading state when resending", async () => {
    let resolveResend: (value: ResendResult) => void = () => {};
    vi.mocked(resendEmailVerification).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveResend = resolve;
        }),
    );

    renderPage("/auth/verify-email?ticket=ticket-1&email=verify-user@example.com");

    fireEvent.click(screen.getByRole("button", { name: "重新发送验证码" }));

    expect(screen.getByRole("button", { name: "处理中..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "确认验证" })).toBeDisabled();

    resolveResend({
      status: "verification_required",
      email: "verify-user@example.com",
      verificationTicket: "ticket-2",
      expiresInSeconds: 900,
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "重新发送验证码" })).toBeEnabled();
    });
  });
});
