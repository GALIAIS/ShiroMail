import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DNSRecordTypeCombobox } from "@/components/ui/dns-record-type-combobox";
import { Input } from "@/components/ui/input";
import { NoticeBanner } from "@/components/ui/notice-banner";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceListRow,
  WorkspaceStatusBadge,
} from "@/components/layout/workspace-ui";
import type { DNSChangeSetItem } from "../../api";
import { PaginationControls, SectionToggle } from "./dns-shared-ui";
import {
  ADMIN_CHANGESET_EDITOR_PAGE_SIZE,
  type EditableProviderRecord,
  createEditableProviderRecord,
  describeChangeSetOperations,
  formatChangeSetTimestamp,
} from "./dns-page.utils";

type DnsChangesetEditorProps = {
  expanded: boolean;
  onToggleExpanded: () => void;
  desiredRecordsDraft: EditableProviderRecord[];
  onDesiredRecordsDraftChange: (updater: (current: EditableProviderRecord[]) => EditableProviderRecord[]) => void;
  paginatedItems: EditableProviderRecord[];
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
  zoneName: string;
  currentRecords: Array<{
    id?: string;
    type: string;
    name: string;
    value: string;
    ttl: number;
    priority: number;
    proxied: boolean;
  }>;
  isWorkspaceBusy: boolean;
  changeSetError: string | null;
  onDismissError: () => void;
  changeSetNotice: string | null;
  onDismissNotice: () => void;
  changeSetPreview: DNSChangeSetItem | null;
  onSave: () => void;
  onPreview: () => void;
  onApply: () => void;
  isSaving: boolean;
  isPreviewing: boolean;
  isApplying: boolean;
};

export function DnsChangesetEditor({
  expanded,
  onToggleExpanded,
  desiredRecordsDraft,
  onDesiredRecordsDraftChange,
  paginatedItems,
  page,
  totalPages,
  total,
  onPageChange,
  zoneName,
  currentRecords,
  isWorkspaceBusy,
  changeSetError,
  onDismissError,
  changeSetNotice,
  onDismissNotice,
  changeSetPreview,
  onSave,
  onPreview,
  onApply,
  isSaving,
  isPreviewing,
  isApplying,
}: DnsChangesetEditorProps) {
  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-muted/20 p-3">
      <SectionToggle
        description="逐行编辑目标记录，先生成 preview，再按 change-set 应用。"
        expanded={expanded}
        meta={<WorkspaceBadge variant="outline">{desiredRecordsDraft.length} 条目标记录</WorkspaceBadge>}
        title="DNS Change Set"
        onToggle={onToggleExpanded}
      />

      {expanded ? (
        <>
          <div className="space-y-3">
            <div className="grid gap-2">
              {paginatedItems.map((record, index) => (
                <div
                  key={record.localId}
                  className="rounded-xl border border-border/60 bg-background/80 p-3"
                >
                  <div className="grid gap-3 xl:grid-cols-[110px_1.2fr_1.8fr_90px_90px_auto_auto]">
                    <DNSRecordTypeCombobox
                      disabled={isWorkspaceBusy}
                      value={record.type}
                      onValueChange={(nextValue) =>
                        onDesiredRecordsDraftChange((current) =>
                          current.map((item) =>
                            item.localId === record.localId
                              ? { ...item, type: nextValue }
                              : item,
                          ),
                        )
                      }
                    />
                    <Input
                      aria-label="记录名称"
                      className="h-9"
                      disabled={isWorkspaceBusy}
                      onChange={(event) =>
                        onDesiredRecordsDraftChange((current) =>
                          current.map((item) =>
                            item.localId === record.localId
                              ? { ...item, name: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="@ / _dmarc"
                      value={record.name}
                    />
                    <Input
                      aria-label="记录值"
                      className="h-9"
                      disabled={isWorkspaceBusy}
                      onChange={(event) =>
                        onDesiredRecordsDraftChange((current) =>
                          current.map((item) =>
                            item.localId === record.localId
                              ? { ...item, value: event.target.value }
                              : item,
                          ),
                        )
                      }
                      placeholder="记录值"
                      value={record.value}
                    />
                    <Input
                      aria-label="TTL"
                      className="h-9"
                      disabled={isWorkspaceBusy}
                      min={60}
                      onChange={(event) =>
                        onDesiredRecordsDraftChange((current) =>
                          current.map((item) =>
                            item.localId === record.localId
                              ? { ...item, ttl: Number(event.target.value || 0) }
                              : item,
                          ),
                        )
                      }
                      type="number"
                      value={record.ttl}
                    />
                    <Input
                      aria-label="优先级"
                      className="h-9"
                      disabled={isWorkspaceBusy}
                      min={0}
                      onChange={(event) =>
                        onDesiredRecordsDraftChange((current) =>
                          current.map((item) =>
                            item.localId === record.localId
                              ? { ...item, priority: Number(event.target.value || 0) }
                              : item,
                          ),
                        )
                      }
                      type="number"
                      value={record.priority}
                    />
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Checkbox
                        aria-label="是否代理"
                        checked={record.proxied}
                        disabled={isWorkspaceBusy}
                        onCheckedChange={(checked) =>
                          onDesiredRecordsDraftChange((current) =>
                            current.map((item) =>
                              item.localId === record.localId
                                ? { ...item, proxied: checked === true }
                                : item,
                            ),
                          )
                        }
                      />
                      代理
                    </label>
                    <Button
                      aria-label="删除记录"
                      className="h-9"
                      disabled={isWorkspaceBusy}
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        onDesiredRecordsDraftChange((current) =>
                          current.filter((item) => item.localId !== record.localId),
                        )
                      }
                    >
                      删除
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    记录 #{(page - 1) * ADMIN_CHANGESET_EDITOR_PAGE_SIZE + index + 1}
                  </p>
                </div>
              ))}
            </div>
            <PaginationControls
              itemLabel="目标记录"
              page={page}
              pageSize={ADMIN_CHANGESET_EDITOR_PAGE_SIZE}
              total={total}
              totalPages={totalPages}
              onPageChange={onPageChange}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                aria-label="新增记录"
                disabled={isWorkspaceBusy}
                size="sm"
                variant="outline"
                onClick={() =>
                  onDesiredRecordsDraftChange((current) => {
                    const next = [
                      ...current,
                      createEditableProviderRecord({
                        name: zoneName,
                      }),
                    ];
                    onPageChange(
                      Math.max(1, Math.ceil(next.length / ADMIN_CHANGESET_EDITOR_PAGE_SIZE)),
                    );
                    return next;
                  })
                }
              >
                <Plus className="size-4" />
                新增记录
              </Button>
              <Button
                disabled={isWorkspaceBusy}
                size="sm"
                variant="ghost"
                onClick={() => {
                  onDesiredRecordsDraftChange(() =>
                    currentRecords.map((r) => createEditableProviderRecord(r)),
                  );
                  onPageChange(1);
                }}
              >
                重置为当前记录
              </Button>
            </div>
          </div>

          {changeSetError ? (
            <NoticeBanner autoHideMs={5000} className="text-xs" onDismiss={onDismissError} variant="error">
              {changeSetError}
            </NoticeBanner>
          ) : null}
          {changeSetNotice ? (
            <NoticeBanner autoHideMs={5000} className="text-xs" onDismiss={onDismissNotice} variant="success">
              {changeSetNotice}
            </NoticeBanner>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              disabled={isWorkspaceBusy}
              onClick={onSave}
            >
              {isSaving ? "保存中..." : "保存到服务商"}
            </Button>

            <Button
              disabled={isWorkspaceBusy}
              variant="outline"
              onClick={onPreview}
            >
              {isPreviewing ? "生成中..." : "预览自动配置"}
            </Button>

            <Button
              disabled={!changeSetPreview || isWorkspaceBusy}
              variant="secondary"
              onClick={onApply}
            >
              {isApplying ? "应用中..." : "应用自动配置"}
            </Button>
          </div>

          {changeSetPreview ? (
            <ChangeSetPreviewPanel changeSet={changeSetPreview} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ChangeSetPreviewPanel({ changeSet }: { changeSet: DNSChangeSetItem }) {
  return (
    <div className="space-y-2 rounded-xl border border-border/60 bg-background/80 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <WorkspaceBadge variant="outline">当前预览</WorkspaceBadge>
        <WorkspaceStatusBadge status={changeSet.status}>
          {changeSet.status}
        </WorkspaceStatusBadge>
        <span>{describeChangeSetOperations(changeSet)}</span>
        <span>生成于 {formatChangeSetTimestamp(changeSet.createdAt)}</span>
        {changeSet.appliedAt ? (
          <span>应用于 {formatChangeSetTimestamp(changeSet.appliedAt)}</span>
        ) : (
          <span>待应用</span>
        )}
      </div>

      {changeSet.operations.length ? (
        <div className="space-y-2">
          {changeSet.operations.map((operation) => (
            <WorkspaceListRow
              key={operation.id}
              title={`${operation.operation} · ${operation.recordType} · ${operation.recordName}`}
              description={
                operation.after?.value ??
                operation.before?.value ??
                `${operation.recordType} ${operation.recordName}`
              }
              descriptionClassName="font-mono text-xs break-all whitespace-normal"
              meta={
                <>
                  <WorkspaceStatusBadge status={operation.status}>
                    {operation.status}
                  </WorkspaceStatusBadge>
                  {operation.after?.ttl ? (
                    <span>TTL {operation.after.ttl}</span>
                  ) : null}
                  {operation.before?.ttl &&
                  !operation.after?.ttl ? (
                    <span>TTL {operation.before.ttl}</span>
                  ) : null}
                </>
              }
            />
          ))}
        </div>
      ) : (
        <WorkspaceEmpty
          title="无变更"
          description="当前目标 Records 与上游记录已经一致。"
        />
      )}
    </div>
  );
}
