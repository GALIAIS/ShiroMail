import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { OptionCombobox } from "@/components/ui/option-combobox";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  WorkspaceEmpty,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { decodeMimeHeaderValue } from "@/lib/mail-header";
import { paginateItems } from "@/lib/pagination";
import { useURLPagination } from "@/hooks/use-url-pagination";
import { fetchAdminMessages } from "../api";
import { formatDateTime } from "../../user/pages/shared";

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export function AdminMessagesPage() {
  const messagesQuery = useQuery({ queryKey: ["admin-messages"], queryFn: fetchAdminMessages });
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<"all" | "new" | "seen">("all");
  const { page, pageSize, setPage, setPageSize, resetPage } = useURLPagination({
    defaultPage: 1,
    defaultPageSize: 20,
  });
  const statusOptions = [
    { value: "all", label: "全部状态", keywords: ["all"] },
    { value: "new", label: "new" },
    { value: "seen", label: "seen" },
  ];

  const filtered = useMemo(() => {
    return (messagesQuery.data ?? []).filter((item) => {
      const matchesStatus = status === "all" || item.status === status;
      const haystack = `${decodeMimeHeaderValue(item.subject)} ${decodeMimeHeaderValue(item.fromAddr)} ${item.mailboxAddress}`.toLowerCase();
      const matchesKeyword = keyword.trim() === "" || haystack.includes(keyword.trim().toLowerCase());
      return matchesStatus && matchesKeyword;
    });
  }, [keyword, messagesQuery.data, status]);
  const paginatedMessages = useMemo(
    () => paginateItems(filtered, page, pageSize),
    [filtered, page, pageSize],
  );

  return (
    <WorkspacePage>
      <WorkspacePanel description="按状态和关键字筛选最近进入平台的消息。" title="消息流">
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <WorkspaceField label="搜索">
            <Input
              className="h-9"
              onChange={(event) => {
                setKeyword(event.target.value);
                resetPage();
              }}
              placeholder="搜索主题 / 发件人 / 收件邮箱"
              value={keyword}
            />
          </WorkspaceField>
          <WorkspaceField label="状态">
            <OptionCombobox
              ariaLabel="消息状态"
              emptyLabel="没有匹配的状态"
              value={status}
              onValueChange={(value) => {
                setStatus(value as "all" | "new" | "seen");
                resetPage();
              }}
              options={statusOptions}
              placeholder="全部状态"
              searchPlaceholder="搜索状态"
            />
          </WorkspaceField>
        </div>

        {filtered.length ? (
          <div className="flex flex-col gap-3">
            {paginatedMessages.items.map((item) => (
              <WorkspaceListRow
                description={`${decodeMimeHeaderValue(item.fromAddr)} → ${item.mailboxAddress}`}
                key={item.id}
                meta={
                  <>
                    <span className="rounded-full border border-border/60 px-2 py-1">{item.status}</span>
                    <span>{formatDateTime(item.receivedAt)}</span>
                  </>
                }
                title={decodeMimeHeaderValue(item.subject) || "(无主题)"}
              />
            ))}
            <PaginationControls
              itemLabel="消息"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              page={paginatedMessages.page}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              showPageSizeSelector
              total={paginatedMessages.total}
              totalPages={paginatedMessages.totalPages}
            />
          </div>
        ) : (
          <WorkspaceEmpty description="没有符合当前筛选条件的消息。" title="暂无匹配消息" />
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
