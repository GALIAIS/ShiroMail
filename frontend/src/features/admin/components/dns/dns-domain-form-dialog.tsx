import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { OptionCombobox, type OptionComboboxOption } from "@/components/ui/option-combobox";
import { WorkspaceField } from "@/components/layout/workspace-ui";

type DomainDraft = {
  domain: string;
  status: string;
  visibility: string;
  publicationStatus: string;
  healthStatus: string;
  providerAccountId: string;
  isDefault: boolean;
  weight: number;
};

type DnsDomainFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  draft: DomainDraft;
  onDraftChange: (updater: (current: DomainDraft) => DomainDraft) => void;
  providerOptions: OptionComboboxOption[];
  mutationError: string | null;
  onDismissError: () => void;
  isPending: boolean;
  onSubmit: () => void;
  onReset: () => void;
};

const statusOptions = [
  { value: "active", label: "active" },
  { value: "paused", label: "paused" },
];
const visibilityOptions = [
  { value: "private", label: "private" },
  { value: "public_pool", label: "public_pool" },
  { value: "platform_public", label: "platform_public" },
];
const publicationOptions = [
  { value: "draft", label: "draft" },
  { value: "pending_review", label: "pending_review" },
  { value: "approved", label: "approved" },
  { value: "rejected", label: "rejected" },
];

export function DnsDomainFormDialog({
  open,
  onOpenChange,
  isEditing,
  draft,
  onDraftChange,
  providerOptions,
  mutationError,
  onDismissError,
  isPending,
  onSubmit,
  onReset,
}: DnsDomainFormDialogProps) {
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen);
        if (nextOpen) {
          onDismissError();
        } else {
          onReset();
        }
      }}
      open={open}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑域名" : "添加域名"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "直接调整域名状态、发布策略和 Provider 绑定；解除绑定后即可删除不再使用的 Provider。"
              : "添加自定义域名后，需要配置 DNS 记录并完成验证。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <WorkspaceField label="名称">
            <Input
              className="h-12 rounded-xl text-base"
              onChange={(event) =>
                onDraftChange((current) => ({
                  ...current,
                  domain: event.target.value,
                }))
              }
              placeholder="example.com"
              value={draft.domain}
            />
          </WorkspaceField>
          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceField label="状态">
              <OptionCombobox
                ariaLabel="域名状态"
                emptyLabel="没有匹配的状态"
                onValueChange={(value) =>
                  onDraftChange((current) => ({ ...current, status: value }))
                }
                options={statusOptions}
                placeholder="选择状态"
                searchPlaceholder="搜索状态"
                value={draft.status}
              />
            </WorkspaceField>

            <WorkspaceField label="可见性">
              <OptionCombobox
                ariaLabel="域名可见性"
                emptyLabel="没有匹配的可见性"
                onValueChange={(value) =>
                  onDraftChange((current) => ({
                    ...current,
                    visibility: value || "private",
                  }))
                }
                options={visibilityOptions}
                placeholder="选择可见性"
                searchPlaceholder="搜索可见性"
                value={draft.visibility}
              />
            </WorkspaceField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceField label="发布状态">
              <OptionCombobox
                ariaLabel="域名发布状态"
                emptyLabel="没有匹配的发布状态"
                onValueChange={(value) =>
                  onDraftChange((current) => ({
                    ...current,
                    publicationStatus: value || "draft",
                  }))
                }
                options={publicationOptions}
                placeholder="选择发布状态"
                searchPlaceholder="搜索发布状态"
                value={draft.publicationStatus}
              />
            </WorkspaceField>

            <WorkspaceField label="DNS 服务商账号">
              <div className="space-y-2">
                <OptionCombobox
                  ariaLabel="DNS 服务商账号"
                  emptyLabel="没有匹配 Provider 账号"
                  onValueChange={(value) =>
                    onDraftChange((current) => ({
                      ...current,
                      providerAccountId: value || "",
                    }))
                  }
                  options={providerOptions}
                  placeholder="选择服务商账号"
                  searchPlaceholder="搜索服务商账号"
                  value={draft.providerAccountId || undefined}
                />
                {draft.providerAccountId ? (
                  <Button
                    className="h-9 px-3"
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() =>
                      onDraftChange((current) => ({
                        ...current,
                        providerAccountId: "",
                      }))
                    }
                  >
                    解除 Provider 绑定
                  </Button>
                ) : null}
              </div>
            </WorkspaceField>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <WorkspaceField label="健康状态">
              <OptionCombobox
                ariaLabel="域名健康状态"
                emptyLabel="没有匹配的健康状态"
                onValueChange={(value) =>
                  onDraftChange((current) => ({
                    ...current,
                    healthStatus: value || "unknown",
                  }))
                }
                options={[
                  { value: "healthy", label: "healthy" },
                  { value: "unknown", label: "unknown" },
                  { value: "degraded", label: "degraded" },
                ]}
                placeholder="选择健康状态"
                searchPlaceholder="搜索健康状态"
                value={draft.healthStatus}
              />
            </WorkspaceField>

            <WorkspaceField label="权重">
              <Input
                className="h-9"
                min={0}
                onChange={(event) =>
                  onDraftChange((current) => ({
                    ...current,
                    weight: Number(event.target.value),
                  }))
                }
                type="number"
                value={draft.weight}
              />
            </WorkspaceField>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={draft.isDefault}
              id="admin-domain-default"
              onCheckedChange={(checked) =>
                onDraftChange((current) => ({
                  ...current,
                  isDefault: checked === true,
                }))
              }
            />
            <Label className="text-sm" htmlFor="admin-domain-default">
              设为默认
            </Label>
          </div>
        </div>

        <DialogFooter>
          {mutationError ? (
            <NoticeBanner autoHideMs={5000} className="mr-auto" onDismiss={onDismissError} variant="error">
              {mutationError}
            </NoticeBanner>
          ) : null}
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button
            disabled={isPending || draft.domain.trim() === ""}
            onClick={onSubmit}
          >
            {isPending ? "提交中..." : isEditing ? "保存变更" : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
