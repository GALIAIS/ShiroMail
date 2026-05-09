import { PaginationControls } from "@/components/ui/pagination-controls";
import { WorkspaceEmpty, WorkspacePanel } from "@/components/layout/workspace-ui";
import { MailboxCard } from "./mailbox-card";
import type { MailboxItem } from "../api";

type PaginatedResult = {
  items: MailboxItem[];
  page: number;
  total: number;
  totalPages: number;
};

type Props = {
  isLoading: boolean;
  hasMailboxes: boolean;
  paginatedMailboxes: PaginatedResult;
  effectiveSelectedMailboxId: number | null;
  onSelectMailbox: (mailboxId: number) => void;
  onPageChange: (page: number) => void;
  pageSize: number;
  formatDate: (value: string) => string;
  formatRemainingHours: (value: string) => string;
};

export function MailboxList({
  isLoading,
  hasMailboxes,
  paginatedMailboxes,
  effectiveSelectedMailboxId,
  onSelectMailbox,
  onPageChange,
  pageSize,
  formatDate,
  formatRemainingHours,
}: Props) {
  return (
    <WorkspacePanel description="点击邮箱卡片切换，右侧自动展示最近收件。" title="当前邮箱">
      {isLoading ? (
        <WorkspaceEmpty description="正在同步邮箱列表，请稍候。" title="正在加载邮箱列表" />
      ) : !hasMailboxes ? (
        <WorkspaceEmpty
          description="当前还没有邮箱，先创建一个临时邮箱开始使用。"
          title="还没有可用邮箱"
        />
      ) : (
        <div className="space-y-3">
          {paginatedMailboxes.items.map((mailbox) => (
            <MailboxCard
              key={mailbox.id}
              mailbox={mailbox}
              active={mailbox.id === effectiveSelectedMailboxId}
              onSelect={onSelectMailbox}
              formatDate={formatDate}
              formatRemainingHours={formatRemainingHours}
            />
          ))}
          <PaginationControls
            itemLabel="邮箱"
            onPageChange={onPageChange}
            page={paginatedMailboxes.page}
            pageSize={pageSize}
            total={paginatedMailboxes.total}
            totalPages={paginatedMailboxes.totalPages}
          />
        </div>
      )}
    </WorkspacePanel>
  );
}
