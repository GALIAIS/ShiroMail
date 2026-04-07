import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAutoDismiss } from "@/hooks/use-auto-dismiss";
import { composePageTitle, usePageTitle } from "@/hooks/use-page-title";
import { useSiteName } from "@/hooks/use-site-name";
import { ArrowRight, KeyRound, ShieldCheck, UserRound } from "lucide-react";
import {
  type AuthSettings,
  getAuthErrorMessage,
  fetchAuthSettings,
  login,
  resendEmailVerification,
  register,
  requestPasswordReset,
  resetPassword,
  startOAuthLogin,
  verifyLoginTOTP,
} from "../../features/auth/api";
import { getDefaultRouteForRoles } from "../../lib/auth";
import { useAuthStore } from "../../lib/auth-store";

type LoginModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type AuthMode = "login" | "register" | "forgot" | "reset" | "two-factor";

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setSession = useAuthStore((state) => state.setSession);
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginValue, setLoginValue] = useState("");
  const [password, setPassword] = useState("");
  const [registerUsername, setRegisterUsername] = useState("");
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [forgotLogin, setForgotLogin] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [resetVerificationTicket, setResetVerificationTicket] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [twoFactorTicket, setTwoFactorTicket] = useState("");
  const [pending, setPending] = useState(false);
  const [resetResendPending, setResetResendPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const authSettingsQuery = useQuery({
    queryKey: ["auth-settings"],
    queryFn: fetchAuthSettings,
    staleTime: 60_000,
  });
  useAutoDismiss(error, () => setError(null));
  useAutoDismiss(notice, () => setNotice(null));

  const authSettings = authSettingsQuery.data;
  const siteName = useSiteName();
  const oauthProviders = Object.entries(
    authSettings?.oauthProviders ?? {},
  ) as Array<[string, AuthSettings["oauthProviders"][string]]>;
  const enabledOAuthProviders = oauthProviders.filter(([, provider]) => provider.enabled);

  const registrationMessage = !authSettings?.allowRegistration
    ? t("auth.registrationClosed")
    : authSettings.inviteOnly || authSettings.registrationMode === "invite_only"
      ? t("auth.registrationInviteOnly")
      : t("auth.registrationOpen");
  const canRegister = !!authSettings?.bootstrapAdminRequired || !!authSettings?.allowRegistration;
  const dialogTitle =
    mode === "login"
      ? composePageTitle(t("auth.title"), siteName)
      : mode === "register"
        ? composePageTitle(t("auth.registerTitle"), siteName)
        : mode === "forgot"
          ? t("auth.forgotPasswordTitle")
          : mode === "two-factor"
            ? t("auth.twoFactorTitle")
            : t("auth.forgotPasswordTitle");

  usePageTitle(open ? dialogTitle : null);

  function resetFormState() {
    setMode("login");
    setLoginValue("");
    setPassword("");
    setRegisterUsername("");
    setRegisterEmail("");
    setRegisterPassword("");
    setForgotLogin("");
    setResetEmail("");
    setResetVerificationTicket("");
    setResetCode("");
    setNextPassword("");
    setTwoFactorCode("");
    setTwoFactorTicket("");
    setPending(false);
    setResetResendPending(false);
    setError(null);
    setNotice(null);
  }

  useEffect(() => {
    if (!open) {
      resetFormState();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!authSettings?.bootstrapAdminRequired) {
      return;
    }
    setMode("register");
    setNotice(t("auth.bootstrapAdminRequired"));
    setError(null);
  }, [authSettings?.bootstrapAdminRequired, open, t]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      if (mode === "forgot") {
        const result = await requestPasswordReset({
          login: forgotLogin,
        });
        setResetEmail(result.email);
        setResetVerificationTicket(result.verificationTicket);
        setResetCode("");
        setNotice(t("auth.forgotPasswordSuccess"));
        setMode("reset");
        return;
      }

      if (mode === "reset") {
        await resetPassword({
          verificationTicket: resetVerificationTicket,
          code: resetCode,
          newPassword: nextPassword,
        });
        setNotice(t("auth.resetPasswordSuccess"));
        setMode("login");
        setPassword("");
        setLoginValue(forgotLogin || loginValue);
        setNextPassword("");
        setResetCode("");
        setResetVerificationTicket("");
        setResetEmail("");
        return;
      }

      if (mode === "two-factor") {
        const session = await verifyLoginTOTP({
          challengeTicket: twoFactorTicket,
          code: twoFactorCode,
        });
        setSession(session);
        onOpenChange(false);
        navigate(getDefaultRouteForRoles(session.user.roles));
        return;
      }

      const session =
        mode === "login"
          ? await login({
              login: loginValue,
              password,
            })
          : await register({
              username: registerUsername,
              email: registerEmail,
              password: registerPassword,
            });
      if (session.kind === "verification_required") {
        onOpenChange(false);
        navigate(
          `/auth/verify-email?ticket=${encodeURIComponent(session.challenge.verificationTicket)}&email=${encodeURIComponent(session.challenge.email)}`,
        );
        return;
      }
      if (session.kind === "two_factor_required") {
        setTwoFactorTicket(session.challenge.challengeTicket);
        setTwoFactorCode("");
        setNotice(null);
        setMode("two-factor");
        return;
      }

      setSession(session.session);
      onOpenChange(false);
      navigate(getDefaultRouteForRoles(session.session.user.roles));
    } catch (currentError) {
      setError(
        mode === "login"
          ? getAuthErrorMessage(currentError, t("auth.failed"))
            : mode === "register"
              ? getAuthErrorMessage(currentError, t("auth.registerFailed"))
              : mode === "forgot"
                ? getAuthErrorMessage(currentError, t("auth.forgotPasswordFailed"))
                : mode === "two-factor"
                  ? getAuthErrorMessage(currentError, t("auth.twoFactorFailed"))
                : getAuthErrorMessage(currentError, t("auth.resetPasswordFailed")),
      );
    } finally {
      setPending(false);
    }
  }

  function switchMode(next: AuthMode) {
    setError(null);
    setNotice(null);
    if (next !== "reset") {
      setResetCode("");
      setResetVerificationTicket("");
      setResetEmail("");
    }
    if (next !== "two-factor") {
      setTwoFactorCode("");
      setTwoFactorTicket("");
    }
    setMode(next);
  }

  async function handleOAuthStart(provider: string) {
    try {
      setPending(true);
      setError(null);
      const result = await startOAuthLogin(provider);
      window.location.assign(result.authorizationUrl);
    } catch {
      setError(t("auth.oauthStartFailed"));
      setPending(false);
    }
  }

  async function handleResetResend() {
    if (!resetVerificationTicket || pending || resetResendPending) {
      return;
    }
    try {
      setResetResendPending(true);
      setError(null);
      const result = await resendEmailVerification({
        verificationTicket: resetVerificationTicket,
      });
      setResetVerificationTicket(result.verificationTicket);
      setResetEmail(result.email);
      setNotice(t("auth.resetCodeResent"));
    } catch (currentError) {
      setError(getAuthErrorMessage(currentError, t("auth.resetCodeResendFailed")));
    } finally {
      setResetResendPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden p-0">
        <div className="space-y-5 p-5">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="w-fit rounded-full" variant="outline">
                {t("auth.secureAccess")}
              </Badge>
              <Badge className="w-fit rounded-full" variant="secondary">
                {registrationMessage}
              </Badge>
            </div>
            <div className="space-y-1.5">
              <DialogTitle>
                {dialogTitle}
              </DialogTitle>
              <DialogDescription className="text-xs leading-6">
                {mode === "login"
                  ? t("auth.description")
                  : mode === "register"
                    ? t("auth.registerDescription")
                    : mode === "forgot"
                      ? t("auth.forgotPasswordDescription")
                      : mode === "two-factor"
                        ? t("auth.twoFactorDescription")
                      : t("auth.resetHint")}
              </DialogDescription>
              {authSettings?.requireEmailVerification ? (
                <p className="text-xs leading-6 text-muted-foreground">
                  {t("auth.emailVerificationRequired")}
                </p>
              ) : null}
            </div>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {mode === "login" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="login-account">{t("auth.account")}</Label>
                  <Input
                    autoComplete="username"
                    className="h-9"
                    id="login-account"
                    onChange={(event) => setLoginValue(event.target.value)}
                    placeholder={t("auth.accountPlaceholder")}
                    value={loginValue}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="login-password">{t("auth.password")}</Label>
                  <Input
                    autoComplete="current-password"
                    className="h-9"
                    id="login-password"
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder={t("auth.passwordPlaceholder")}
                    type="password"
                    value={password}
                  />
                </div>
              </>
            ) : mode === "register" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="register-username">
                    {t("auth.username")}
                  </Label>
                  <Input
                    autoComplete="username"
                    className="h-9"
                    id="register-username"
                    onChange={(event) =>
                      setRegisterUsername(event.target.value)
                    }
                    placeholder={t("auth.usernamePlaceholder")}
                    value={registerUsername}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="register-email">{t("auth.email")}</Label>
                  <Input
                    autoComplete="email"
                    className="h-9"
                    id="register-email"
                    onChange={(event) => setRegisterEmail(event.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    type="email"
                    value={registerEmail}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="register-password">
                    {t("auth.password")}
                  </Label>
                  <Input
                    autoComplete="new-password"
                    className="h-9"
                    id="register-password"
                    onChange={(event) =>
                      setRegisterPassword(event.target.value)
                    }
                    placeholder={t("auth.passwordPlaceholder")}
                    type="password"
                    value={registerPassword}
                  />
                </div>
              </>
            ) : mode === "forgot" ? (
              <div className="grid gap-2">
                <Label htmlFor="forgot-login">{t("auth.account")}</Label>
                <Input
                  autoComplete="username"
                  className="h-9"
                  id="forgot-login"
                  onChange={(event) => setForgotLogin(event.target.value)}
                  placeholder={t("auth.accountPlaceholder")}
                  value={forgotLogin}
                />
              </div>
            ) : mode === "two-factor" ? (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="two-factor-code">{t("auth.verificationCode")}</Label>
                  <Input
                    className="h-9"
                    id="two-factor-code"
                    inputMode="numeric"
                    onChange={(event) => setTwoFactorCode(event.target.value)}
                    placeholder={t("auth.verificationCodePlaceholder")}
                    value={twoFactorCode}
                  />
                </div>

                <p className="text-xs leading-6 text-muted-foreground">
                  {t("auth.twoFactorHint")}
                </p>
              </>
            ) : (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="reset-code">{t("auth.verificationCode")}</Label>
                  <Input
                    className="h-9"
                    id="reset-code"
                    inputMode="numeric"
                    onChange={(event) => setResetCode(event.target.value)}
                    placeholder={t("auth.verificationCodePlaceholder")}
                    value={resetCode}
                  />
                </div>

                {resetEmail ? (
                  <p className="text-xs leading-6 text-muted-foreground">
                    {t("auth.resetCodeSentTo", { email: resetEmail })}
                  </p>
                ) : null}

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    disabled={pending || resetResendPending || !resetVerificationTicket}
                    onClick={handleResetResend}
                  >
                    {resetResendPending ? t("auth.pending") : t("auth.resendCode")}
                  </Button>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="reset-password">
                    {t("auth.newPassword")}
                  </Label>
                  <Input
                    autoComplete="new-password"
                    className="h-9"
                    id="reset-password"
                    onChange={(event) => setNextPassword(event.target.value)}
                    placeholder={t("auth.newPasswordPlaceholder")}
                    type="password"
                    value={nextPassword}
                  />
                </div>
              </>
            )}

            {notice ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {notice}
              </p>
            ) : null}
            {error ? <p className="text-xs text-destructive">{error}</p> : null}

            <Button
              className="h-9 w-full"
              disabled={pending}
              size="sm"
              type="submit"
            >
              {pending
                ? mode === "login"
                  ? t("auth.pending")
                  : mode === "forgot"
                    ? t("auth.forgotPasswordPending")
                    : mode === "two-factor"
                      ? t("auth.twoFactorPending")
                    : mode === "reset"
                      ? t("auth.resetPasswordPending")
                      : t("auth.registerPending")
                : mode === "login"
                  ? t("auth.submit")
                  : mode === "register"
                    ? t("auth.registerSubmit")
                    : mode === "forgot"
                      ? t("auth.forgotPasswordSubmit")
                      : mode === "two-factor"
                        ? t("auth.twoFactorSubmit")
                      : t("auth.resetPasswordSubmit")}
              {!pending ? <ArrowRight className="size-4" /> : null}
            </Button>

            {mode === "login" ? (
              <>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => switchMode("forgot")}
                  >
                    {t("auth.forgotPassword")}
                  </Button>
                </div>

                <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">
                        {t("auth.oauthTitle")}
                      </p>
                      <p className="text-xs leading-5 text-muted-foreground">
                        {t("auth.oauthDescription")}
                      </p>
                    </div>
                    <KeyRound className="size-4 text-muted-foreground" />
                  </div>

                  {authSettingsQuery.isLoading ? (
                    <p className="text-xs text-muted-foreground">
                      Loading auth settings...
                    </p>
                  ) : enabledOAuthProviders.length > 0 &&
                    authSettings?.oauthShowOnLogin ? (
                    <div className="grid gap-2">
                      {enabledOAuthProviders.map(([key, provider]) => (
                        <Button
                          className="h-9 justify-start"
                          key={key}
                          disabled={pending}
                          size="sm"
                          type="button"
                          variant="outline"
                          onClick={() => handleOAuthStart(key)}
                        >
                          {t("auth.oauthContinue")} {provider.displayName}
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {t("auth.oauthDisabled")}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium">
                      {t("auth.createAccount")}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {t("auth.createAccountHint")}
                    </p>
                  </div>
                  <Button
                    disabled={!canRegister}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => switchMode("register")}
                  >
                    {t("auth.createAccount")}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/10 px-3 py-2.5">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{t("auth.backToLogin")}</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      {mode === "register"
                        ? t("auth.createAccountHint")
                        : mode === "forgot"
                          ? t("auth.forgotPasswordDescription")
                          : mode === "two-factor"
                            ? t("auth.twoFactorDescription")
                          : t("auth.resetHint")}
                  </p>
                </div>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => switchMode("login")}
                >
                  {t("auth.backToLogin")}
                </Button>
              </div>
            )}
          </form>
        </div>

        <div className="grid gap-3 border-t bg-muted/35 px-5 py-4 sm:grid-cols-2">
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-3">
            <div className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
              <UserRound className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("auth.userTitle")}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("auth.userDescription")}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/80 px-3 py-3">
            <div className="flex size-8 items-center justify-center rounded-lg border border-border/60 bg-muted/40 text-muted-foreground">
              <ShieldCheck className="size-4" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">{t("auth.adminTitle")}</p>
              <p className="text-xs leading-5 text-muted-foreground">
                {t("auth.adminDescription")}
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
