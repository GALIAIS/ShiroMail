import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  WorkspaceBadge,
  WorkspaceListRow,
} from "@/components/layout/workspace-ui";
import type { MailDeliveryDiagnosticPayload } from "@/lib/http";
import { formatDateTime } from "../../user/pages/shared";

export type DeliveryTestDiagnosticState = {
  status: "idle" | "success" | "error";
  recipient: string;
  testedAt?: string;
  message?: string;
  diagnostic?: MailDeliveryDiagnosticPayload;
};

type DeliveryTestPanelProps = {
  recipient: string;
  onRecipientChange: (value: string) => void;
  isPending: boolean;
  onSendTest: () => void;
  diagnosticState: DeliveryTestDiagnosticState;
};

export function DeliveryTestPanel({
  recipient,
  onRecipientChange,
  isPending,
  onSendTest,
  diagnosticState,
}: DeliveryTestPanelProps) {
  return (
    <>
      <div className="mt-4 flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/20 p-3 md:flex-row md:items-end">
        <div className="flex-1 space-y-2">
          <div className="text-sm font-medium">测试收件邮箱</div>
          <Input
            aria-label="测试收件邮箱"
            placeholder="默认使用发件邮箱"
            value={recipient}
            onChange={(event) => onRecipientChange(event.target.value)}
          />
        </div>
        <Button disabled={isPending} onClick={onSendTest}>
          {isPending ? "发送中..." : "发送测试邮件"}
        </Button>
      </div>
      {diagnosticState.status !== "idle" ? (
        <div className="mt-4 rounded-xl border border-border/60 bg-card/70 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium">最近一次 SMTP 测试</div>
            <WorkspaceBadge
              variant={
                diagnosticState.status === "success"
                  ? "outline"
                  : "destructive"
              }
            >
              {diagnosticState.status === "success" ? "Success" : "Failed"}
            </WorkspaceBadge>
            {diagnosticState.diagnostic?.code ? (
              <WorkspaceBadge variant="secondary">
                {diagnosticState.diagnostic.code}
              </WorkspaceBadge>
            ) : null}
            {typeof diagnosticState.diagnostic?.retryable === "boolean" ? (
              <WorkspaceBadge
                variant={
                  diagnosticState.diagnostic.retryable
                    ? "outline"
                    : "secondary"
                }
              >
                {diagnosticState.diagnostic.retryable
                  ? "Retryable"
                  : "Check config"}
              </WorkspaceBadge>
            ) : null}
          </div>
          <div className="mt-3 space-y-3">
            <WorkspaceListRow
              title={diagnosticState.message ?? "暂无诊断信息"}
              description={
                diagnosticState.diagnostic?.hint ??
                (diagnosticState.status === "success"
                  ? "如果未收到邮件，请再检查上游 SMTP 日志、垃圾箱或延迟投递情况。"
                  : "后端未返回结构化诊断时，会自动回退到原始错误信息。")
              }
              meta={
                <>
                  <WorkspaceBadge variant="outline">
                    {diagnosticState.recipient || "未指定收件人"}
                  </WorkspaceBadge>
                  {diagnosticState.diagnostic?.stage ? (
                    <WorkspaceBadge variant="secondary">
                      stage: {diagnosticState.diagnostic.stage}
                    </WorkspaceBadge>
                  ) : null}
                  {diagnosticState.testedAt ? (
                    <span>{formatDateTime(diagnosticState.testedAt)}</span>
                  ) : null}
                </>
              }
              titleClassName="whitespace-normal"
              descriptionClassName="whitespace-normal"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
