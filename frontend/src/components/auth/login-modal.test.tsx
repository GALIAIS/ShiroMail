import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAuthSettings,
  login,
  register,
  resendEmailVerification,
  requestPasswordReset,
  resetPassword,
  startOAuthLogin,
  verifyLoginTOTP,
} from "../../features/auth/api";
import { fetchPublicSiteSettings } from "../../features/home/api";
import { LoginModal } from "./login-modal";

vi.mock("../../features/auth/api", () => ({
  fetchAuthSettings: vi.fn(),
  login: vi.fn(),
  register: vi.fn(),
  resendEmailVerification: vi.fn(),
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  startOAuthLogin: vi.fn(),
  verifyLoginTOTP: vi.fn(),
}));

vi.mock("../../features/home/api", () => ({
  fetchPublicSiteSettings: vi.fn(),
}));

describe("LoginModal", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();

    vi.mocked(fetchAuthSettings).mockResolvedValue({
      registrationMode: "invite_only",
      allowRegistration: true,
      requireEmailVerification: true,
      inviteOnly: true,
      passwordMinLength: 8,
      allowMultiSession: true,
      refreshTokenDays: 7,
      oauthShowOnLogin: true,
      oauthProviders: {
        google: {
          enabled: true,
          displayName: "Google",
          redirectUrl: "",
          authorizationUrl: "https://accounts.google.com/test-auth",
          scopes: ["openid", "email"],
          usePkce: true,
          allowAutoRegister: true,
        },
        github: {
          enabled: false,
          displayName: "GitHub",
          redirectUrl: "",
          authorizationUrl: "",
          scopes: ["read:user"],
          usePkce: true,
          allowAutoRegister: true,
        },
      },
    });
    vi.mocked(login).mockRejectedValue(new Error("not used in this test"));
    vi.mocked(register).mockResolvedValue({
      kind: "session",
      session: {
        accessToken: "token",
        refreshToken: "refresh",
        user: {
          userId: 7,
          username: "new-user",
          roles: ["user"],
        },
      },
    });
    vi.mocked(requestPasswordReset).mockResolvedValue({
      status: "ok",
      email: "new-user@example.com",
      verificationTicket: "ticket-123",
      expiresInSeconds: 900,
    });
    vi.mocked(resendEmailVerification).mockResolvedValue({
      status: "verification_required",
      email: "new-user@example.com",
      verificationTicket: "ticket-456",
      expiresInSeconds: 900,
    });
    vi.mocked(resetPassword).mockResolvedValue({
      status: "ok",
    });
    vi.mocked(startOAuthLogin).mockResolvedValue({
      provider: "google",
      authorizationUrl: "https://accounts.google.com/test-auth",
    });
    vi.mocked(verifyLoginTOTP).mockResolvedValue({
      accessToken: "token-2fa",
      refreshToken: "refresh-2fa",
      user: {
        userId: 7,
        username: "new-user",
        roles: ["user"],
      },
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
        mxTarget: "mail.shiro.local",
        dkimCnameTarget: "shiro._domainkey.shiro.local",
      },
    });
  });

  function renderModal() {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <LoginModal onOpenChange={() => {}} open />
        </QueryClientProvider>
      </MemoryRouter>,
    );
  }

  it("renders auth policy and enabled oauth providers from auth settings", async () => {
    renderModal();

    expect(
      await screen.findByText("Registration currently requires an invite"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "New accounts must complete email verification before activation",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create account" }),
    ).toBeEnabled();
  });

  it("starts oauth login when clicking provider button", async () => {
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { assign: assignSpy },
      writable: true,
    });

    renderModal();

    fireEvent.click(
      await screen.findByRole("button", { name: "Continue with Google" }),
    );

    await waitFor(() => {
      expect(vi.mocked(startOAuthLogin)).toHaveBeenCalledWith("google");
      expect(assignSpy).toHaveBeenCalledWith(
        "https://accounts.google.com/test-auth",
      );
    });
  });

  it("switches to register mode and submits register request", async () => {
    renderModal();

    await screen.findByText("Registration currently requires an invite");
    const createAccountButton = screen.getByRole("button", {
      name: "Create account",
    });
    await waitFor(() => {
      expect(createAccountButton).toBeEnabled();
    });
    fireEvent.click(createAccountButton);

    await screen.findByText("Create account · Shiro Email");

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "new-user" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Secret123!" },
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Create account and enter workspace",
      }),
    );

    await waitFor(() => {
      expect(vi.mocked(register)).toHaveBeenCalledWith({
        username: "new-user",
        email: "new-user@example.com",
        password: "Secret123!",
      });
    });
  });

  it("requests an email reset code and submits a password reset", async () => {
    renderModal();

    await screen.findByText("Registration currently requires an invite");
    fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));

    await screen.findByText("Reset your password");

    fireEvent.change(screen.getByLabelText("Account"), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await waitFor(() => {
      expect(vi.mocked(requestPasswordReset)).toHaveBeenCalledWith({
        login: "new-user@example.com",
      });
    });

    expect(
      await screen.findByText(
        "A verification code has been sent to your account email. Enter it with a new password to finish the reset.",
      ),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "BetterSecret456!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(vi.mocked(resetPassword)).toHaveBeenCalledWith({
        verificationTicket: "ticket-123",
        code: "123456",
        newPassword: "BetterSecret456!",
      });
    });
  });

  it("resends reset verification code from reset mode", async () => {
    renderModal();

    await screen.findByText("Registration currently requires an invite");
    fireEvent.click(screen.getByRole("button", { name: "Forgot password" }));
    fireEvent.change(screen.getByLabelText("Account"), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Send verification code" }),
    );

    await screen.findByText("Verification code sent to new-user@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

    await waitFor(() => {
      expect(vi.mocked(resendEmailVerification)).toHaveBeenCalledWith({
        verificationTicket: "ticket-123",
      });
      expect(vi.mocked(resetPassword)).not.toHaveBeenCalled();
    });
  });

  it("shows a second-step totp form when login requires two factor", async () => {
    vi.mocked(login).mockResolvedValue({
      kind: "two_factor_required",
      challenge: {
        status: "two_factor_required",
        challengeTicket: "mfa-ticket",
        expiresInSeconds: 300,
      },
    });

    renderModal();

    await screen.findByText("Registration currently requires an invite");
    fireEvent.change(screen.getByLabelText("Account"), {
      target: { value: "new-user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Secret123!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Two-factor verification")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Verification code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and continue" }));

    await waitFor(() => {
      expect(vi.mocked(verifyLoginTOTP)).toHaveBeenCalledWith({
        challengeTicket: "mfa-ticket",
        code: "123456",
      });
    });
  });

  it("clears login form state after closing and reopening", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    const { rerender } = render(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <LoginModal onOpenChange={() => {}} open />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    await screen.findByText("Registration currently requires an invite");
    fireEvent.change(screen.getByLabelText("Account"), {
      target: { value: "admin@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Secret123!" },
    });

    rerender(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <LoginModal onOpenChange={() => {}} open={false} />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    rerender(
      <MemoryRouter>
        <QueryClientProvider client={queryClient}>
          <LoginModal onOpenChange={() => {}} open />
        </QueryClientProvider>
      </MemoryRouter>,
    );

    expect((await screen.findByLabelText("Account"))).toHaveValue("");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
