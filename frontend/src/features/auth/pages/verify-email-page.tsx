import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmEmailVerification, getAuthErrorMessage, resendEmailVerification } from "../api";
import { composePageTitle, usePageTitle } from "../../../hooks/use-page-title";
import { useSiteName } from "../../../hooks/use-site-name";
import { useAuthStore } from "../../../lib/auth-store";
import { getDefaultRouteForRoles } from "../../../lib/auth";

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const setSession = useAuthStore((state) => state.setSession);
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [submitPending, setSubmitPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticket, setTicket] = useState(searchParams.get("ticket") ?? "");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const siteName = useSiteName();
  usePageTitle(composePageTitle("验证邮箱", siteName));


  async function handleSubmit() {
    if (submitPending || resendPending) {
      return;
    }
    setSubmitPending(true);
    setError(null);
    try {
      const session = await confirmEmailVerification({
        verificationTicket: ticket,
        code,
      });
      setSession(session);
      navigate(getDefaultRouteForRoles(session.user.roles), { replace: true });
    } catch (currentError) {
      setError(getAuthErrorMessage(currentError, "邮箱验证码校验失败。"));
    } finally {
      setSubmitPending(false);
    }
  }

  async function handleResend() {
    if (submitPending || resendPending) {
      return;
    }
    setResendPending(true);
    setError(null);
    try {
      const result = await resendEmailVerification({ verificationTicket: ticket });
      setTicket(result.verificationTicket);
      setEmail(result.email);
      setNotice(`验证码已重新发送至 ${result.email}`);
    } catch (currentError) {
      setError(getAuthErrorMessage(currentError, "验证码重发失败。"));
    } finally {
      setResendPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 shadow-sm">
        <p className="text-base font-semibold text-foreground">验证账户邮箱</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          我们已向 `{email || "你的邮箱"}` 发送 6 位验证码。输入验证码后即可继续进入工作台。
        </p>

        <div className="mt-5 space-y-3">
          <Input
            aria-label="邮箱验证码"
            placeholder="输入 6 位验证码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          {notice ? <p className="text-xs text-emerald-600">{notice}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={submitPending || resendPending || !ticket || code.trim().length < 6} onClick={handleSubmit}>
            {submitPending ? "验证中..." : "确认验证"}
          </Button>
          <Button className="w-full" disabled={submitPending || resendPending || !ticket} variant="outline" onClick={handleResend}>
            {resendPending ? "处理中..." : "重新发送验证码"}
          </Button>
        </div>
      </div>
    </div>
  );
}
