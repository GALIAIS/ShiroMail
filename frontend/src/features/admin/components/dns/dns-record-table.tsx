import { Copy } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceListRow,
} from "@/components/layout/workspace-ui";
import { Button } from "@/components/ui/button";
import { formatDNSRecordValueForDisplay } from "@/lib/dns-record-display";
import { showSuccess } from "@/lib/toast";
import type { ProviderRecordItem } from "../../api";
import { PaginationControls, SectionToggle } from "./dns-shared-ui";
import { ADMIN_RECORDS_PAGE_SIZE } from "./dns-page.utils";

function CopyValueButton({ value }: { value: string }) {
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
      className={copied ? "opacity-100" : "opacity-0 group-hover:opacity-100 transition-opacity"}
      onClick={handleCopy}
      size="icon-sm"
      variant="ghost"
    >
      <Copy className="size-3.5" />
    </Button>
  );
}

type DnsRecordTableProps = {
  records: ProviderRecordItem[];
  paginatedItems: ProviderRecordItem[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  currentRecordProviderType: string | null;
};

export function DnsRecordTable({
  records,
  paginatedItems,
  page,
  totalPages,
  total,
  onPageChange,
  expanded,
  onToggleExpanded,
  currentRecordProviderType,
}: DnsRecordTableProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-background/80 p-3">
      <SectionToggle
        description={`共 ${records.length} 条 DNS Records`}
        expanded={expanded}
        meta={
          <WorkspaceBadge variant="outline">
            第 {page} / {totalPages} 页
          </WorkspaceBadge>
        }
        title="DNS Records"
        onToggle={onToggleExpanded}
      />

      {expanded && records.length ? (
        <div className="space-y-2">
          {paginatedItems.map((record) => (
            <WorkspaceListRow
              key={record.id}
              className="group"
              title={`${record.type} · ${record.name}`}
              description={
                <span className="inline-flex items-center gap-1.5">
                  <span>
                    {formatDNSRecordValueForDisplay(
                      record.type,
                      record.value,
                      currentRecordProviderType,
                    )}
                  </span>
                  <CopyValueButton value={record.value} />
                </span>
              }
              descriptionClassName="font-mono text-xs break-all whitespace-normal"
              meta={
                <>
                  <WorkspaceBadge>TTL {record.ttl}</WorkspaceBadge>
                  {record.priority > 0 ? (
                    <span>prio {record.priority}</span>
                  ) : null}
                  <span>
                    {record.proxied ? "proxied" : "dns only"}
                  </span>
                </>
              }
            />
          ))}
          <PaginationControls
            itemLabel="Record"
            page={page}
            pageSize={ADMIN_RECORDS_PAGE_SIZE}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      ) : expanded ? (
        <WorkspaceEmpty
          title="暂无 Records"
          description="当前 Zone 还没有可读取的 DNS Records。"
        />
      ) : null}
    </div>
  );
}
