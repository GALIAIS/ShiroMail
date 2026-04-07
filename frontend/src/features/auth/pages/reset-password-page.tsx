import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAuthErrorMessage, resendEmailVerification, resetPassword } from "../api";
import { composePageTitle, usePageTitle } from "../../../hooks/use-page-title";
import { useSiteName } from "../../../hooks/use-site-name";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ticket, setTicket] = useState(searchParams.get("ticket") ?? "");
  const [email, setEmail] = useState(searchParams.get("email") ?? "");
  const [code, setCode] = useState(searchParams.get("code") ?? "");
  const [nextPassword, setNextPassword] = useState("");
  const [submitPending, setSubmitPending] = useState(false);
  const [resendPending, setResendPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const siteName = useSiteName();
  usePageTitle(composePageTitle("重置密码", siteName));

  async function handleSubmit() {
    if (submitPending || resendPending) {
      return;
    }
    setSubmitPending(true);
    setError(null);
    setNotice(null);
    try {
      await resetPassword({
        verificationTicket: ticket,
        code,
        newPassword: nextPassword,
      });
      setNotice("密码已重置，请返回首页重新登录。");
      window.setTimeout(() => navigate("/", { replace: true }), 1200);
    } catch (currentError) {
      setError(getAuthErrorMessage(currentError, "重置失败，请检查验证码后重试。"));
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
    setNotice(null);
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
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card p-6">
        <div className="space-y-2">
          <p className="text-base font-semibold text-foreground">重置密码</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {email
              ? `我们已向 ${email} 发送验证码。你也可以直接使用邮件中的按钮打开这个页面。`
              : "输入验证码与新密码后即可完成密码重置。"}
          </p>
        </div>

        <div className="mt-5 space-y-3">
          <Input
            aria-label="重置验证码"
            inputMode="numeric"
            placeholder="输入 6 位验证码"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <Input
            aria-label="新密码"
            autoComplete="new-password"
            placeholder="输入新的登录密码"
            type="password"
            value={nextPassword}
            onChange={(event) => setNextPassword(event.target.value)}
          />

          {notice ? <p className="text-xs text-emerald-600">{notice}</p> : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}

          <Button
            className="w-full"
            disabled={submitPending || resendPending || !ticket || code.trim().length < 6 || nextPassword.trim().length < 8}
            onClick={handleSubmit}
          >
            {submitPending ? "处理中..." : "确认重置"}
          </Button>
          <Button className="w-full" disabled={submitPending || resendPending || !ticket} variant="outline" onClick={handleResend}>
            {resendPending ? "处理中..." : "重新发送验证码"}
          </Button>

          <div className="pt-1 text-center text-xs text-muted-foreground">
            <Link className="underline underline-offset-4" to="/">
              返回首页登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
