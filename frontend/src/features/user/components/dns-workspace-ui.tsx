import { type ReactNode, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  WorkspaceBadge,
  WorkspaceSurface,
} from "@/components/layout/workspace-ui";
import { showSuccess } from "@/lib/toast";

export function DnsCopyButton({ value }: { value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      showSuccess(t("dns.copied"));
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // silently fail
    }
  }, [value, t]);

  return (
    <Button
      aria-label={t("dns.copied")}
      className={copied ? "opacity-100" : "opacity-0 group-hover/row:opacity-100 transition-opacity"}
      onClick={handleCopy}
      size="icon-sm"
      variant="ghost"
    >
      <Copy className="size-3.5" />
    </Button>
  );
}

export function PaginationControls({
  page,
  totalPages,
  total,
  pageSize,
  itemLabel,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        第 {page} / {totalPages} 页 · 共 {total} 条{itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          disabled={page <= 1}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          disabled={page >= totalPages}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

export function SectionToggle({
  expanded,
  title,
  description,
  meta,
  onToggle,
}: {
  expanded: boolean;
  title: string;
  description: string;
  meta?: ReactNode;
  onToggle: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {meta}
        <Button size="sm" type="button" variant="ghost" onClick={onToggle}>
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {expanded ? "收起" : "展开"}
        </Button>
      </div>
    </div>
  );
}

export function DnsContextSurface({
  domain,
  provider,
  zone,
  workspaceName,
}: {
  domain?: string;
  provider?: string;
  zone?: string;
  workspaceName?: string;
}) {
  const description = domain
    ? `已按域名 ${domain} 定位 DNS 工作区。`
    : provider
      ? `已按 Provider ${provider} 定位 DNS 工作区。`
      : `当前查看 ${zone ?? workspaceName ?? "DNS 工作区"}。`;

  return (
    <WorkspaceSurface className="flex flex-col gap-3 bg-card/82 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 space-y-1">
        <div className="text-sm font-medium">当前上下文</div>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {domain ? <WorkspaceBadge variant="outline">域名：{domain}</WorkspaceBadge> : null}
        {provider ? <WorkspaceBadge variant="outline">Provider：{provider}</WorkspaceBadge> : null}
        {zone ? <WorkspaceBadge variant="outline">Zone：{zone}</WorkspaceBadge> : null}
      </div>
    </WorkspaceSurface>
  );
}

export function DnsOperationGuide() {
  return (
    <WorkspaceSurface className="bg-card/82">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="text-sm font-medium">操作提示</div>
          <p className="text-xs leading-5 text-muted-foreground">
            先展开 Provider，再进入目标 Zone 查看记录和验证结果；根域记录通常用 `@`，子域记录只填前缀即可。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <WorkspaceBadge variant="outline">1. 选择 Provider</WorkspaceBadge>
          <WorkspaceBadge variant="outline">2. 查看验证</WorkspaceBadge>
          <WorkspaceBadge variant="outline">3. 应用修复</WorkspaceBadge>
        </div>
      </div>
    </WorkspaceSurface>
  );
}
