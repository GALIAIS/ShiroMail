import { Card, CardContent } from "@/components/ui/card";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceStatusBadge,
} from "@/components/layout/workspace-ui";
import type { MessageExtractionResult } from "../api";

export type SecuritySummary = {
  spf: string;
  dkim: string;
  dmarc: string;
  replyTo: string;
  returnPath: string;
  messageId: string;
};

export type ReceivedTimelineItem = {
  date: string;
  route: string;
  raw?: string;
  isRawTruncated?: boolean;
};

export function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/60 bg-background/60 shadow-none">
      <CardContent className="space-y-1 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-all">{value}</p>
      </CardContent>
    </Card>
  );
}

function SecurityStatusCard({ label, value }: { label: string; value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    normalized.includes("pass") || normalized.includes("通过")
      ? "success"
      : normalized.includes("fail") || normalized.includes("reject")
        ? "danger"
        : normalized.includes("none") || normalized.includes("unknown") || normalized.includes("未")
          ? "warning"
          : undefined;

  return (
    <Card className="border-border/60 bg-background/60 shadow-none">
      <CardContent className="space-y-2 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <WorkspaceStatusBadge status={value} tone={tone}>
            {value}
          </WorkspaceStatusBadge>
        </div>
      </CardContent>
    </Card>
  );
}

export function SecurityCard({ messageSecuritySummary }: { messageSecuritySummary: SecuritySummary }) {
  return (
    <Card className="border-border/60 bg-background/60 shadow-none">
      <CardContent className="space-y-3 py-4">
        <div className="text-sm font-medium">投递与认证摘要</div>
        <div className="grid gap-3 md:grid-cols-3">
          <SecurityStatusCard label="SPF" value={messageSecuritySummary.spf} />
          <SecurityStatusCard label="DKIM" value={messageSecuritySummary.dkim} />
          <SecurityStatusCard label="DMARC" value={messageSecuritySummary.dmarc} />
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <MetaCard label="Reply-To" value={messageSecuritySummary.replyTo} />
          <MetaCard label="Return-Path" value={messageSecuritySummary.returnPath} />
          <MetaCard label="Message-ID" value={messageSecuritySummary.messageId} />
        </div>
      </CardContent>
    </Card>
  );
}

export function ReceivedPathCard({ receivedTimeline }: { receivedTimeline: ReceivedTimelineItem[] }) {
  return (
    <Card className="border-border/60 bg-background/60 shadow-none">
      <CardContent className="space-y-3 py-4">
        <div className="text-sm font-medium">Received 路径</div>
        {receivedTimeline.length ? (
          <div className="space-y-3">
            {receivedTimeline.map((item, index) => (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3" key={`${item.date}-${index}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <WorkspaceBadge variant="outline">#{index + 1}</WorkspaceBadge>
                  <span className="text-xs text-muted-foreground">{item.date || "时间未知"}</span>
                </div>
                <div className="mt-2 text-sm font-medium">{item.route}</div>
                {item.raw ? (
                  <pre className="mt-2 whitespace-pre-wrap break-all text-xs leading-6 text-muted-foreground">
                    {item.raw}
                  </pre>
                ) : null}
                {item.isRawTruncated ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    该节点原始头已截断，完整内容请查看 Raw 原文。
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <WorkspaceEmpty description="当前邮件没有可解析的 Received 路径。" title="暂无投递路径" />
        )}
      </CardContent>
    </Card>
  );
}

export function ExtractionsCard({ extractionsQuery }: { extractionsQuery: { isLoading: boolean; data?: MessageExtractionResult } }) {
  return (
    <Card className="border-border/60 bg-background/60 shadow-none">
      <CardContent className="space-y-3 py-4">
        <div className="text-sm font-medium">提取结果</div>
        {extractionsQuery.isLoading ? (
          <WorkspaceEmpty description="正在分析这封邮件的提取规则命中情况。" title="正在计算提取结果" />
        ) : extractionsQuery.data?.items.length ? (
          <div className="space-y-3">
            {extractionsQuery.data.items.map((item, index) => (
              <div className="rounded-xl border border-border/60 bg-muted/10 p-3" key={`${item.ruleId}-${item.sourceField}-${index}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <WorkspaceBadge variant="outline">{item.label || item.ruleName}</WorkspaceBadge>
                  <span className="text-xs text-muted-foreground">{item.sourceField}</span>
                </div>
                <div className="mt-2 whitespace-pre-wrap break-all text-sm leading-6">
                  {item.values?.length ? item.values.join("\n") : item.value}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <WorkspaceEmpty description="当前邮件没有命中任何已启用的提取规则。" title="暂无提取结果" />
        )}
      </CardContent>
    </Card>
  );
}
