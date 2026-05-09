import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { OptionCombobox } from "@/components/ui/option-combobox";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { getAPIErrorMessage } from "@/lib/http";
import { paginateItems } from "@/lib/pagination";
import { validateRequiredText, validateSelection } from "@/lib/validation";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import {
  createAdminApiKey,
  fetchAdminApiKeys,
  fetchAdminDomains,
  revokeAdminApiKey,
  rotateAdminApiKey,
} from "../api";
import {
  type ApiKeyDomainBindingInput,
  type ApiKeyItem,
} from "../../user/api";
import { formatDateTime } from "../../user/pages/shared";

const DEFAULT_SCOPES = [
  "mailboxes.read",
  "messages.read",
  "domains.read",
  "domains.verify",
];

const API_KEY_SCOPE_OPTIONS = [
  "mailboxes.read",
  "mailboxes.write",
  "messages.read",
  "messages.attachments.read",
  "domains.read",
  "domains.write",
  "domains.verify",
  "domains.publish",
  "domains.unpublish",
  "dns.records.read",
  "dns.records.write",
  "provider.accounts.read",
  "provider.accounts.write",
  "public_pool.use",
  "public_pool.manage",
] as const;

const DOMAIN_ACCESS_MODE_OPTIONS = [
  { value: "mixed", label: "mixed" },
  { value: "private_only", label: "private_only" },
  { value: "public_only", label: "public_only" },
];

const DOMAIN_BINDING_ACCESS_OPTIONS = [
  { value: "read", label: "read" },
  { value: "write", label: "write" },
  { value: "verify", label: "verify" },
  { value: "publish", label: "publish" },
  { value: "manage", label: "manage" },
];

const DEFAULT_RESOURCE_POLICY = {
  domainAccessMode: "mixed",
  allowPlatformPublicDomains: true,
  allowUserPublishedDomains: true,
  allowOwnedPrivateDomains: true,
  allowProviderMutation: false,
  allowProtectedRecordWrite: false,
};

const ADMIN_API_KEYS_PAGE_SIZE = 8;

const EXPIRATION_OPTIONS = [
  { value: "", label: "永不过期" },
  { value: "30", label: "30 天" },
  { value: "90", label: "90 天" },
  { value: "365", label: "1 年" },
  { value: "custom", label: "自定义日期" },
];

type BindingDraft = {
  domainId: string;
  accessLevel: string;
};

type RevealedKeyState = {
  mode: "created" | "rotated";
  name: string;
  secret: string;
};

export function AdminApiKeysPage() {
  const queryClient = useQueryClient();
  const [isCreateDialogOpen, setCreateDialogOpen] = useState(false);
  const [revealedKey, setRevealedKey] = useState<RevealedKeyState | null>(null);
  const [pendingRevokeItem, setPendingRevokeItem] = useState<ApiKeyItem | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
  const [createError, setCreateError] = useState<string | null>(null);
  const [apiKeysPage, setApiKeysPage] = useState(1);
  const [name, setName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>(DEFAULT_SCOPES);
  const [resourcePolicy, setResourcePolicy] = useState(DEFAULT_RESOURCE_POLICY);
  const [bindingDraft, setBindingDraft] = useState<BindingDraft>({
    domainId: "",
    accessLevel: "read",
  });
  const [domainBindings, setDomainBindings] = useState<ApiKeyDomainBindingInput[]>([]);

  const apiKeysQuery = useQuery({
    queryKey: ["admin-api-keys"],
    queryFn: fetchAdminApiKeys,
  });
  const domainsQuery = useQuery({
    queryKey: ["admin-domains"],
    queryFn: fetchAdminDomains,
  });

  const domainOptions = useMemo(
    () =>
      (domainsQuery.data ?? []).map((item) => ({
        value: String(item.id),
        label: item.domain,
        keywords: [item.visibility, item.publicationStatus, item.kind],
      })),
    [domainsQuery.data],
  );

  const createMutation = useMutation({
    mutationFn: createAdminApiKey,
    onSuccess: async (created) => {
      setCreateError(null);
      setName("");
      setSelectedScopes(DEFAULT_SCOPES);
      setResourcePolicy(DEFAULT_RESOURCE_POLICY);
      setBindingDraft({ domainId: "", accessLevel: "read" });
      setDomainBindings([]);
      setCreateDialogOpen(false);
      setCopyState("idle");
      setRevealedKey({
        mode: "created",
        name: created.name,
        secret: created.plainSecret || created.keyPreview,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"], refetchType: "all" });
    },
    onError: (error) => {
      setCreateError(
        getAPIErrorMessage(error, "创建 API Key 失败，请检查权限、域绑定和会话状态后重试。"),
      );
    },
  });

  const rotateMutation = useMutation({
    mutationFn: rotateAdminApiKey,
    onSuccess: async (rotated) => {
      setCopyState("idle");
      setRevealedKey({
        mode: "rotated",
        name: rotated.name,
        secret: rotated.plainSecret || rotated.keyPreview,
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: revokeAdminApiKey,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["admin-api-keys"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"], refetchType: "all" });
    },
  });

  const canAddBinding = bindingDraft.domainId !== "";
  const canSubmit = name.trim() !== "";
  const activeApiKeys = apiKeysQuery.data ?? [];
  const paginatedApiKeys = useMemo(
    () => paginateItems(activeApiKeys, apiKeysPage, ADMIN_API_KEYS_PAGE_SIZE),
    [activeApiKeys, apiKeysPage],
  );

  const handleCopySecret = async () => {
    if (!revealedKey || typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyState("failed");
      return;
    }

    try {
      await navigator.clipboard.writeText(revealedKey.secret);
      setCopyState("done");
    } catch {
      setCopyState("failed");
    }
  };

  function handleAddBinding() {
    const domainError = validateSelection("域名", bindingDraft.domainId, domainOptions.map((item) => item.value));
    if (domainError) {
      setCreateError(domainError);
      return;
    }
    const accessError = validateSelection("绑定权限", bindingDraft.accessLevel, DOMAIN_BINDING_ACCESS_OPTIONS.map((item) => item.value));
    if (accessError) {
      setCreateError(accessError);
      return;
    }
    setCreateError(null);
    setDomainBindings((current) =>
      upsertDomainBinding(current, Number(bindingDraft.domainId), bindingDraft.accessLevel),
    );
  }

  function handleCreateKey() {
    const nameError = validateRequiredText("密钥名称", name, { minLength: 2, maxLength: 80 });
    if (nameError) {
      setCreateError(nameError);
      return;
    }
    if (!selectedScopes.length) {
      setCreateError("至少需要选择一个 scope。");
      return;
    }
    const modeError = validateSelection("域访问模式", resourcePolicy.domainAccessMode, DOMAIN_ACCESS_MODE_OPTIONS.map((item) => item.value));
    if (modeError) {
      setCreateError(modeError);
      return;
    }
    setCreateError(null);
    createMutation.mutate({
      name: name.trim(),
      scopes: [...selectedScopes].sort(),
      resourcePolicy,
      domainBindings,
    });
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
          action={<Button onClick={() => setCreateDialogOpen(true)}>新增 API Key</Button>}
        description="管理员面板仅管理当前管理员自己的 API Key，避免混入普通用户密钥；不添加域绑定时默认可访问当前管理员账号全部可用域名。"
        title="API 密钥"
      >
        <Dialog
          onOpenChange={(open) => {
            setCreateDialogOpen(open);
            if (open) {
              setCreateError(null);
            }
          }}
          open={isCreateDialogOpen}
        >
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
            <DialogHeader>
              <DialogTitle>新增 API Key</DialogTitle>
              <DialogDescription>
                为当前管理员创建新的 API Key，并统一配置 scopes、resource policy 与域名绑定。
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <WorkspaceField label="密钥名称">
                  <Input
                    onChange={(event) => setName(event.target.value)}
                    placeholder="输入密钥名称，如 Admin Worker / Audit Bot"
                    value={name}
                  />
                </WorkspaceField>

                <div className="space-y-3 rounded-xl border border-border/60 bg-card px-4 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Scopes</p>
                    <p className="text-sm text-muted-foreground">
                      为当前管理员分配最小权限集，避免后台脚本持有过宽 scope。
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {API_KEY_SCOPE_OPTIONS.map((scope) => {
                      const checkboxID = `admin-api-key-scope-${scope.replace(/[.]/g, "-")}`;
                      return (
                        <div className="flex items-center gap-2" key={scope}>
                          <Checkbox
                            aria-label={scope}
                            checked={selectedScopes.includes(scope)}
                            id={checkboxID}
                            onCheckedChange={(checked) =>
                              setSelectedScopes((current) =>
                                toggleScope(current, scope, checked === true),
                              )
                            }
                          />
                          <Label className="text-sm" htmlFor={checkboxID}>
                            {scope}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-4 rounded-xl border border-border/60 bg-card px-4 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Resource Policy</p>
                    <p className="text-sm text-muted-foreground">
                      控制这把 key 可访问的域类型，以及是否允许 DNS / Provider 级修改。
                    </p>
                  </div>

                  <WorkspaceField label="域访问模式">
                    <OptionCombobox
                      ariaLabel="域访问模式"
                      emptyLabel="没有匹配的模式"
                      onValueChange={(value) =>
                        setResourcePolicy((current) => ({
                          ...current,
                          domainAccessMode: value || "mixed",
                        }))
                      }
                      options={DOMAIN_ACCESS_MODE_OPTIONS}
                      placeholder="选择访问模式"
                      searchPlaceholder="搜索访问模式"
                      value={resourcePolicy.domainAccessMode}
                    />
                  </WorkspaceField>

                  <div className="grid gap-3">
                    <PolicyCheckbox
                      checked={resourcePolicy.allowOwnedPrivateDomains}
                      label="owned_private"
                      onCheckedChange={(checked) =>
                        setResourcePolicy((current) => ({
                          ...current,
                          allowOwnedPrivateDomains: checked,
                        }))
                      }
                    />
                    <PolicyCheckbox
                      checked={resourcePolicy.allowPlatformPublicDomains}
                      label="platform_public"
                      onCheckedChange={(checked) =>
                        setResourcePolicy((current) => ({
                          ...current,
                          allowPlatformPublicDomains: checked,
                        }))
                      }
                    />
                    <PolicyCheckbox
                      checked={resourcePolicy.allowUserPublishedDomains}
                      label="public_pool"
                      onCheckedChange={(checked) =>
                        setResourcePolicy((current) => ({
                          ...current,
                          allowUserPublishedDomains: checked,
                        }))
                      }
                    />
                    <PolicyCheckbox
                      checked={resourcePolicy.allowProviderMutation}
                      label="provider_mutation"
                      onCheckedChange={(checked) =>
                        setResourcePolicy((current) => ({
                          ...current,
                          allowProviderMutation: checked,
                        }))
                      }
                    />
                    <PolicyCheckbox
                      checked={resourcePolicy.allowProtectedRecordWrite}
                      label="protected_record_write"
                      onCheckedChange={(checked) =>
                        setResourcePolicy((current) => ({
                          ...current,
                          allowProtectedRecordWrite: checked,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4 rounded-xl border border-border/60 bg-card px-4 py-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Domain Bindings</p>
                    <p className="text-sm text-muted-foreground">
                      把 key 限制到指定域名，可用于平台托管的审计、自动验证或发布任务；留空则默认作用于当前管理员账号全部可访问域名。
                    </p>
                  </div>

                  <WorkspaceField label="绑定域名">
                    <OptionCombobox
                      ariaLabel="绑定域名"
                      disabled={!domainOptions.length}
                      emptyLabel="没有可绑定域名"
                      onValueChange={(value) =>
                        setBindingDraft((current) => ({ ...current, domainId: value }))
                      }
                      options={domainOptions}
                      placeholder="选择域名"
                      searchPlaceholder="搜索域名"
                      value={bindingDraft.domainId || undefined}
                    />
                  </WorkspaceField>

                  <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                    <WorkspaceField label="绑定权限">
                      <OptionCombobox
                        ariaLabel="绑定权限"
                        emptyLabel="没有匹配权限"
                        onValueChange={(value) =>
                          setBindingDraft((current) => ({
                            ...current,
                            accessLevel: value || "read",
                          }))
                        }
                        options={DOMAIN_BINDING_ACCESS_OPTIONS}
                        placeholder="选择权限"
                        searchPlaceholder="搜索权限"
                        value={bindingDraft.accessLevel}
                      />
                    </WorkspaceField>

                    <div className="flex items-end">
                      <Button
                        disabled={!canAddBinding}
                        onClick={handleAddBinding}
                        variant="outline"
                      >
                        添加绑定
                      </Button>
                    </div>
                  </div>

                  {domainBindings.length ? (
                    <div className="space-y-2">
                      {domainBindings.map((binding) => {
                        const bindingDomain = (domainsQuery.data ?? []).find(
                          (item) => item.id === binding.nodeId,
                        );
                        return (
                          <WorkspaceListRow
                            description={`${bindingDomain?.visibility ?? "unknown"} · ${bindingDomain?.publicationStatus ?? "unknown"}`}
                            key={`${binding.nodeId}-${binding.accessLevel}`}
                            meta={
                              <>
                                <WorkspaceBadge>{binding.accessLevel}</WorkspaceBadge>
                                <Button
                                  onClick={() =>
                                    setDomainBindings((current) =>
                                      current.filter(
                                        (item) =>
                                          item.nodeId !== binding.nodeId ||
                                          item.accessLevel !== binding.accessLevel,
                                      ),
                                    )
                                  }
                                  size="sm"
                                  variant="ghost"
                                >
                                  移除
                                </Button>
                              </>
                            }
                            title={bindingDomain?.domain ?? `node #${binding.nodeId}`}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <WorkspaceEmpty
                      description="如果不加绑定，这把 key 会按 resource policy 访问整类域资源。"
                      title="未限制到具体域名"
                    />
                  )}
                </div>
              </div>
            </div>

            <DialogFooter>
              {createError ? (
                <NoticeBanner autoHideMs={5000} className="mr-auto" onDismiss={() => setCreateError(null)} variant="error">
                  {createError}
                </NoticeBanner>
              ) : null}
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button
                disabled={!canSubmit || createMutation.isPending}
                onClick={handleCreateKey}
              >
                {createMutation.isPending ? "创建中..." : "创建密钥"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              setRevealedKey(null);
              setCopyState("idle");
            }
          }}
          open={revealedKey !== null}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>
                {revealedKey?.mode === "rotated" ? "已轮换 API 密钥" : "已新增 API 密钥"}
              </DialogTitle>
              <DialogDescription>
                这把密钥当前只会完整展示一次，请立即复制给对应用户或安全存档。
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <WorkspaceField label="密钥名称">
                <Input readOnly value={revealedKey?.name ?? ""} />
              </WorkspaceField>

              <WorkspaceField label="明文密钥">
                <div className="space-y-2">
                  <Input className="font-mono text-[0.82rem]" readOnly value={revealedKey?.secret ?? ""} />
                  <p className="text-xs text-muted-foreground">
                    关闭窗口后列表仍只显示脱敏值，请现在就复制到安全存储。
                  </p>
                </div>
              </WorkspaceField>
            </div>

            <DialogFooter>
              {copyState === "done" ? (
                <NoticeBanner autoHideMs={5000} className="mr-auto text-xs" onDismiss={() => setCopyState("idle")} variant="success">
                  已复制到剪贴板
                </NoticeBanner>
              ) : copyState === "failed" ? (
                <NoticeBanner autoHideMs={5000} className="mr-auto text-xs" onDismiss={() => setCopyState("idle")} variant="error">
                  复制失败，请手动复制
                </NoticeBanner>
              ) : (
                <div className="mr-auto text-xs text-muted-foreground">
                  建议现在就复制到安全存储中
                </div>
              )}
              <Button onClick={handleCopySecret} variant="secondary">
                复制密钥
              </Button>
              <DialogClose asChild>
                <Button variant="outline">关闭</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          onOpenChange={(open) => {
            if (!open) {
              setPendingRevokeItem(null);
            }
          }}
          open={pendingRevokeItem !== null}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>确认撤销 API 密钥</DialogTitle>
              <DialogDescription>
                这会让对应用户的这把 key 立即失效，现有脚本和服务调用会被拒绝。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <WorkspaceField label="密钥名称">
                <Input readOnly value={pendingRevokeItem?.name ?? ""} />
              </WorkspaceField>
              <WorkspaceField label="当前预览">
                <Input className="font-mono text-[0.82rem]" readOnly value={pendingRevokeItem?.keyPreview ?? ""} />
              </WorkspaceField>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">取消</Button>
              </DialogClose>
              <Button
                disabled={revokeMutation.isPending}
                onClick={() => {
                  if (!pendingRevokeItem) {
                    return;
                  }
                  revokeMutation.mutate(pendingRevokeItem.id, {
                    onSuccess: () => {
                      setPendingRevokeItem(null);
                    },
                  });
                }}
                variant="destructive"
              >
                {revokeMutation.isPending ? "撤销中..." : "确认撤销"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {activeApiKeys.length > 0 ? (
          <div className="space-y-3">
            {paginatedApiKeys.items.map((item) => {
              const scopes = item.scopes ?? [];
              const domainBindings = item.domainBindings ?? [];

              return (
                <WorkspaceListRow
                  description={
                    <div className="space-y-2">
                      <div className="font-mono text-[0.82rem]">{item.keyPreview}</div>
                      <div className="flex flex-wrap gap-1.5">
                        {scopes.map((scope) => (
                          <WorkspaceBadge key={scope} variant="outline">
                            {scope}
                          </WorkspaceBadge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[0.8rem]">
                        <span>{item.resourcePolicy.domainAccessMode}</span>
                        <span>绑定 {domainBindings.length}</span>
                        <span>最近使用 {formatDateTime(item.lastUsedAt)}</span>
                        <span>{formatDomainPolicySummary(item)}</span>
                      </div>
                    </div>
                  }
                  key={item.id}
                  meta={
                    <>
                      <WorkspaceBadge>{item.status}</WorkspaceBadge>
                      <span>{formatDateTime(item.rotatedAt ?? item.createdAt)}</span>
                      <Button
                        onClick={() => rotateMutation.mutate(item.id)}
                        size="sm"
                        variant="secondary"
                      >
                        轮换
                      </Button>
                      <Button
                        onClick={() => setPendingRevokeItem(item)}
                        size="sm"
                        variant="outline"
                      >
                        撤销
                      </Button>
                    </>
                  }
                  title={item.name}
                />
              );
            })}
            <PaginationControls
              itemLabel="API Key"
              onPageChange={setApiKeysPage}
              page={paginatedApiKeys.page}
              pageSize={ADMIN_API_KEYS_PAGE_SIZE}
              total={paginatedApiKeys.total}
              totalPages={paginatedApiKeys.totalPages}
            />
          </div>
        ) : (
          <WorkspaceEmpty
            description="这里只显示当前管理员自己创建且仍在生效的 API Key。"
            title="暂无 API Key"
          />
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}

function PolicyCheckbox({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  const checkboxID = `admin-policy-${label}`;

  return (
    <div className="flex items-center gap-2">
      <Checkbox
        aria-label={label}
        checked={checked}
        id={checkboxID}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <Label className="text-sm" htmlFor={checkboxID}>
        {label}
      </Label>
    </div>
  );
}

function toggleScope(current: string[], scope: string, enabled: boolean) {
  if (enabled) {
    return [...new Set([...current, scope])].sort();
  }
  return current.filter((item) => item !== scope);
}

function upsertDomainBinding(
  current: ApiKeyDomainBindingInput[],
  nodeID: number,
  accessLevel: string,
) {
  const nextBinding = {
    nodeId: nodeID,
    accessLevel,
  };
  const existingIndex = current.findIndex(
    (item) => item.nodeId === nodeID && item.accessLevel === accessLevel,
  );
  if (existingIndex >= 0) {
    return current;
  }
  return [...current, nextBinding];
}

function formatDomainPolicySummary(item: ApiKeyItem) {
  const targets: string[] = [];
  if (item.resourcePolicy.allowOwnedPrivateDomains) {
    targets.push("私有域");
  }
  if (item.resourcePolicy.allowPlatformPublicDomains) {
    targets.push("平台公共域");
  }
  if (item.resourcePolicy.allowUserPublishedDomains) {
    targets.push("用户公共池");
  }
  if (targets.length === 0) {
    return "未授予域访问";
  }
  return targets.join(" / ");
}
