import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { WorkspaceEmpty, WorkspacePanel } from "@/components/layout/workspace-ui";
import { cn } from "@/lib/utils";
import { paginateItems } from "@/lib/pagination";
import { MailboxCard } from "./mailbox-card";
import { MailboxTagBadge, MailboxTagManager } from "./mailbox-tag-manager";
import { fetchMailboxTags, type MailboxItem } from "../api";

type Props = {
  isLoading: boolean;
  hasMailboxes: boolean;
  mailboxes: MailboxItem[];
  effectiveSelectedMailboxId: number | null;
  onSelectMailbox: (mailboxId: number) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  page: number;
  pageSize: number;
  pageSizeOptions: number[];
  formatDate: (value: string) => string;
  formatRemainingHours: (value: string) => string;
};

export function MailboxList({
  isLoading,
  hasMailboxes,
  mailboxes,
  effectiveSelectedMailboxId,
  onSelectMailbox,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageSizeOptions,
  formatDate,
  formatRemainingHours,
}: Props) {
  const { t } = useTranslation();
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);

  const { data: tagsData } = useQuery({
    queryKey: ["mailbox-tags"],
    queryFn: fetchMailboxTags,
  });

  const tags = tagsData?.tags ?? [];
  const bindings = tagsData?.bindings ?? [];

  // Filter mailboxes by selected tag before pagination
  const filteredMailboxes = selectedTagId
    ? mailboxes.filter((mb) =>
        bindings.some((b) => b.mailboxId === mb.id && b.tagId === selectedTagId)
      )
    : mailboxes;

  const paginatedMailboxes = paginateItems(filteredMailboxes, page, pageSize);

  // Build a lookup: mailboxId -> bound tags
  function getMailboxTags(mailboxId: number) {
    const tagIds = bindings
      .filter((b) => b.mailboxId === mailboxId)
      .map((b) => b.tagId);
    return tags.filter((tag) => tagIds.includes(tag.id));
  }

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
          {/* Tag filter bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                selectedTagId === null
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setSelectedTagId(null)}
            >
              {t("tags.filterAll")}
            </button>
            {tags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  selectedTagId === tag.id
                    ? "border-transparent text-white"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
                style={selectedTagId === tag.id ? { backgroundColor: tag.color } : undefined}
                onClick={() => setSelectedTagId(tag.id)}
              >
                <MailboxTagBadge
                  tag={tag}
                  className={cn(
                    "pointer-events-none bg-transparent p-0 text-inherit shadow-none",
                    selectedTagId === tag.id ? "text-white" : ""
                  )}
                />
              </button>
            ))}
            <MailboxTagManager />
          </div>

          {paginatedMailboxes.items.length === 0 ? (
            <WorkspaceEmpty
              description="没有匹配此标签的邮箱。"
              title="无匹配邮箱"
            />
          ) : (
            <>
              {paginatedMailboxes.items.map((mailbox) => (
                <MailboxCard
                  key={mailbox.id}
                  mailbox={mailbox}
                  active={mailbox.id === effectiveSelectedMailboxId}
                  onSelect={onSelectMailbox}
                  formatDate={formatDate}
                  formatRemainingHours={formatRemainingHours}
                  tags={getMailboxTags(mailbox.id)}
                />
              ))}
              <PaginationControls
                itemLabel="邮箱"
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
                page={paginatedMailboxes.page}
                pageSize={pageSize}
                pageSizeOptions={pageSizeOptions}
                showPageSizeSelector
                total={paginatedMailboxes.total}
                totalPages={paginatedMailboxes.totalPages}
              />
            </>
          )}
        </div>
      )}
    </WorkspacePanel>
  );
}
