import { Button } from "@/components/ui/button";
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
import { MultiOptionCombobox } from "@/components/ui/multi-option-combobox";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { OptionCombobox } from "@/components/ui/option-combobox";
import { WorkspaceField } from "@/components/layout/workspace-ui";
import {
  type ProviderCredentials,
  canSubmitProviderCredentials,
  getProviderAuthModeMeta,
  getProviderCredentialFields,
  getProviderPermissionOptions,
  sanitizeProviderPermissions,
} from "./dns-page.utils";

type ProviderDraft = {
  provider: string;
  ownerType: string;
  displayName: string;
  authType: string;
  status: string;
  permissionValues: string[];
};

type DnsProviderFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  coreFieldsLocked: boolean;
  draft: ProviderDraft;
  onDraftChange: (updater: (current: ProviderDraft) => ProviderDraft) => void;
  credentials: ProviderCredentials;
  onCredentialsChange: (updater: (current: ProviderCredentials) => ProviderCredentials) => void;
  mutationError: string | null;
  onDismissError: () => void;
  isPending: boolean;
  onSubmit: () => void;
  onReset: () => void;
};

export function DnsProviderFormDialog({
  open,
  onOpenChange,
  isEditing,
  coreFieldsLocked,
  draft,
  onDraftChange,
  credentials,
  onCredentialsChange,
  mutationError,
  onDismissError,
  isPending,
  onSubmit,
  onReset,
}: DnsProviderFormDialogProps) {
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "编辑 Provider 账号" : "新增 Provider 账号"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? coreFieldsLocked
                ? "当前 Provider 已绑定域名，可继续更新显示名称、凭据、状态和权限，但不能改服务商类型或鉴权方式。"
                : "当前 Provider 未绑定域名，服务商类型、鉴权方式、凭据与权限都可以直接修改。"
              : "使用逐字段表单录入 DNS 服务商凭据，后续所有操作都通过可视化按钮完成。"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <WorkspaceField label="DNS 服务商">
                <OptionCombobox
                  ariaLabel="DNS 服务商"
                  emptyLabel="没有匹配服务商"
                  onValueChange={(value) => {
                    const nextProvider = value || "cloudflare";
                    onDraftChange((current) => ({
                      ...current,
                      provider: nextProvider,
                      authType: nextProvider === "spaceship" ? "api_key" : "api_token",
                      permissionValues: sanitizeProviderPermissions(
                        nextProvider,
                        current.permissionValues,
                      ),
                    }));
                    onCredentialsChange(() => ({
                      apiToken: "",
                      apiEmail: "",
                      apiKey: "",
                      apiSecret: "",
                    }));
                  }}
                  options={[
                    { value: "cloudflare", label: "Cloudflare" },
                    { value: "spaceship", label: "Spaceship" },
                  ]}
                  placeholder="选择服务商"
                  searchPlaceholder="搜索服务商"
                  disabled={coreFieldsLocked}
                  value={draft.provider}
                />
              </WorkspaceField>
              <WorkspaceField label="Owner">
                <OptionCombobox
                  ariaLabel="Owner Type"
                  emptyLabel="没有匹配 Owner"
                  onValueChange={() => {}}
                  options={[
                    { value: "platform", label: "platform" },
                  ]}
                  placeholder="选择归属"
                  searchPlaceholder="搜索归属"
                  disabled
                  value={draft.ownerType}
                />
              </WorkspaceField>

              <WorkspaceField label="显示名称">
                <Input
                  className="h-10"
                  onChange={(event) =>
                    onDraftChange((current) => ({
                      ...current,
                      displayName: event.target.value,
                    }))
                  }
                  placeholder="例如：Cloudflare 主账号"
                  value={draft.displayName}
                />
              </WorkspaceField>

              <WorkspaceField label="状态">
                <OptionCombobox
                  ariaLabel="Provider Status"
                  emptyLabel="没有匹配状态"
                  onValueChange={(value) =>
                    onDraftChange((current) => ({
                      ...current,
                      status: value || "healthy",
                    }))
                  }
                  options={[
                    { value: "healthy", label: "healthy" },
                    { value: "degraded", label: "degraded" },
                    { value: "pending", label: "pending" },
                  ]}
                  placeholder="选择状态"
                  searchPlaceholder="搜索状态"
                  value={draft.status}
                />
              </WorkspaceField>

              <WorkspaceField label="鉴权方式">
                <OptionCombobox
                  ariaLabel="Provider Auth Type"
                  emptyLabel="没有匹配鉴权方式"
                  onValueChange={(value) => {
                    onDraftChange((current) => ({
                      ...current,
                      authType:
                        value ||
                        (current.provider === "spaceship" ? "api_key" : "api_token"),
                    }));
                    onCredentialsChange(() => ({
                      apiToken: "",
                      apiEmail: "",
                      apiKey: "",
                      apiSecret: "",
                    }));
                  }}
                  options={
                    draft.provider === "spaceship"
                      ? [{ value: "api_key", label: "API Key + API Secret" }]
                      : [
                            { value: "api_token", label: "API Token" },
                            { value: "api_key", label: "Global API Key + Email" },
                          ]
                  }
                  placeholder="选择鉴权方式"
                  searchPlaceholder="搜索鉴权方式"
                  disabled={coreFieldsLocked}
                  value={draft.authType}
                />
              </WorkspaceField>
            </div>
            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4">
              <div className="mb-3 space-y-1">
                <p className="text-sm font-medium">凭据字段</p>
                <p className="text-sm text-muted-foreground">
                  按服务商填写必要字段，不需要再手写 JSON 或 Secret Ref。
                </p>
              </div>

              <div className="mb-4 rounded-xl border border-border/60 bg-background/70 px-4 py-3">
                <p className="text-sm font-medium">
                  {getProviderAuthModeMeta(draft.provider, draft.authType).title}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {getProviderAuthModeMeta(draft.provider, draft.authType).description}
                  {isEditing ? " 留空则沿用当前已保存的凭据。" : ""}
                </p>
              </div>

              <div className="grid gap-4">
                {getProviderCredentialFields(draft.provider, draft.authType).map((field) => (
                  <WorkspaceField key={field.key} label={field.label}>
                    <Input
                      aria-label={field.label}
                      className="h-10"
                      onChange={(event) =>
                        onCredentialsChange((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                      placeholder={field.placeholder}
                      type={field.type}
                      value={credentials[field.key]}
                    />
                  </WorkspaceField>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 bg-card p-4">
              <div className="mb-3 space-y-1">
                <p className="text-sm font-medium">权限</p>
                <p className="text-sm text-muted-foreground">
                  选择这个 Provider 账号已授予的权限，后续操作会按权限范围展示。
                </p>
              </div>

              <MultiOptionCombobox
                ariaLabel="权限"
                emptyLabel="没有可选权限"
                options={getProviderPermissionOptions(draft.provider)}
                placeholder="选择需要的权限"
                searchPlaceholder="继续搜索权限"
                values={draft.permissionValues}
                onValuesChange={(values) =>
                  onDraftChange((current) => ({
                    ...current,
                    permissionValues: sanitizeProviderPermissions(current.provider, values),
                  }))
                }
              />
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">提交后效果</p>
              <p className="mt-2 leading-7">
                平台会直接按这些字段保存凭据，并用于校验连接、读取 Zone、读取
                Records 与应用变更。
              </p>
            </div>
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
            disabled={
              isPending ||
              draft.displayName.trim() === "" ||
              !canSubmitProviderCredentials(
                draft.provider,
                draft.authType,
                credentials,
                isEditing,
              )
            }
            onClick={onSubmit}
          >
            {isPending
              ? "提交中..."
              : isEditing
                ? "保存 Provider 账号"
                : "添加 Provider 账号"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
