import { Button } from "@/components/ui/button";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceListRow,
  WorkspaceStatusBadge,
} from "@/components/layout/workspace-ui";
import { cn } from "@/lib/utils";
import type { DNSChangeSetItem } from "../../api";
import { PaginationControls, SectionToggle } from "./dns-shared-ui";
import {
  ADMIN_CHANGESETS_PAGE_SIZE,
  describeChangeSetOperations,
  formatChangeSetTimestamp,
} from "./dns-page.utils";

type DnsChangesetHistoryProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
  sortedHistory: DNSChangeSetItem[];
  paginatedItems: DNSChangeSetItem[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  selectedChangeSetID: number | null;
  isWorkspaceBusy: boolean;
  onReview: (item: DNSChangeSetItem) => void;
  onRestore: (item: DNSChangeSetItem) => void;
};

export function DnsChangesetHistory({
  expanded,
  onToggleExpanded,
  sortedHistory,
  paginatedItems,
  page,
  totalPages,
  total,
  onPageChange,
  selectedChangeSetID,
  isWorkspaceBusy,
  onReview,
  onRestore,
}: DnsChangesetHistoryProps) {
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/80 p-3">
      <SectionToggle
        description="当前 Zone 最近的 preview / apply 历史。"
        expanded={expanded}
        meta={<WorkspaceBadge variant="outline">{sortedHistory.length} 条历史</WorkspaceBadge>}
        title="Change Set 历史"
        onToggle={onToggleExpanded}
      />
      {expanded && sortedHistory.length ? (
        <div className="space-y-2">
          {paginatedItems.map((item) => (
            <WorkspaceListRow
              className={cn(
                selectedChangeSetID === item.id
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : undefined,
              )}
              key={item.id}
              title={`#${item.id} · ${item.summary}`}
              description={`${item.provider} · ${item.zoneName} · ${describeChangeSetOperations(item)}`}
              meta={
                <>
                  <WorkspaceStatusBadge status={item.status}>{item.status}</WorkspaceStatusBadge>
                  <span>{item.appliedAt ? "已应用" : "待应用"}</span>
                  <span>
                    {item.appliedAt
                      ? `应用于 ${formatChangeSetTimestamp(item.appliedAt)}`
                      : `生成于 ${formatChangeSetTimestamp(item.createdAt)}`}
                  </span>
                  {item.operations.length ? (
                    <span>{item.operations.length} 条操作</span>
                  ) : (
                    <span>无操作</span>
                  )}
                  <Button
                    disabled={isWorkspaceBusy}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => onReview(item)}
                  >
                    回看
                  </Button>
                  <Button
                    disabled={
                      isWorkspaceBusy ||
                      !item.operations.some((operation) => operation.after)
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => onRestore(item)}
                  >
                    恢复到编辑器
                  </Button>
                </>
              }
            />
          ))}
          <PaginationControls
            itemLabel="Change Set"
            page={page}
            pageSize={ADMIN_CHANGESETS_PAGE_SIZE}
            total={total}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </div>
      ) : expanded ? (
        <WorkspaceEmpty
          title="暂无 Change Set 历史"
          description="当前 Zone 还没有 preview / apply 记录。"
        />
      ) : null}
    </div>
  );
}
