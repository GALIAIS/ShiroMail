import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronRight, ChevronUp, Copy, RefreshCcw, Trash2 } from "lucide-react";
import i18n from "@/lib/i18n";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { OptionCombobox, type OptionComboboxOption } from "@/components/ui/option-combobox";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceField,
  WorkspaceListRow,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { getAPIErrorMessage } from "@/lib/http";
import { formatDNSRecordValueForDisplay } from "@/lib/dns-record-display";
import { showSuccess } from "@/lib/toast";
import { useAuthStore } from "@/lib/auth-store";
import { readPersistedState, writePersistedState } from "@/lib/persisted-state";
import {
  applyDomainProviderChangeSet,
  createDomain,
  createDomainProvider,
  deleteDomainProvider,
  fetchDomainProviderChangeSets,
  fetchDomainProviderRecords,
  fetchDomainProviderVerifications,
  fetchDomainProviderZones,
  fetchDomainProviders,
  fetchDomains,
  generateSubdomains,
  previewDomainProviderChangeSet,
  updateDomainProvider,
  validateDomainProvider,
  type UserDNSChangeSetItem,
  type UserDomainProviderItem,
  type UserProviderRecordItem,
  type UserVerificationProfileItem,
  type UserProviderZoneItem,
} from "../api";

type ProviderCredentials = {
  apiToken: string;
  apiEmail: string;
  apiKey: string;
  apiSecret: string;
};

const EMPTY_PROVIDER_CREDENTIALS: ProviderCredentials = {
  apiToken: "",
  apiEmail: "",
  apiKey: "",
  apiSecret: "",
};
const DEFAULT_PROVIDER_PERMISSIONS = ["zones.read", "dns.write"];
const PROVIDER_PERMISSION_OPTIONS: Record<"cloudflare" | "spaceship", OptionComboboxOption[]> = {
  cloudflare: [
    { value: "tokens.verify", label: "Token 验证", keywords: ["tokens.verify", "token verify"] },
    { value: "zones.read", label: "Zone 读取", keywords: ["zones.read", "zone read"] },
    { value: "dns.read", label: "DNS 读取", keywords: ["dns.read", "dns read"] },
    { value: "dns.write", label: "DNS 写入", keywords: ["dns.write", "dns write", "dns edit"] },
  ],
  spaceship: [
    { value: "zones.read", label: "Zone 读取", keywords: ["zones.read", "zone read"] },
    { value: "dns.read", label: "DNS 读取", keywords: ["dns.read", "dns read"] },
    { value: "dns.write", label: "DNS 写入", keywords: ["dns.write", "dns write"] },
  ],
};
const PERSISTED_QUERY_STALE_TIME = 60_000;
const PROVIDER_ZONE_FAILURE_COOLDOWN_MS = 45_000;
const USER_DNS_RECORDS_PAGE_SIZE = 8;

function DnsCopyButton({ value }: { value: string }) {
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

function getProviderPermissionOptions(provider: string) {
  return PROVIDER_PERMISSION_OPTIONS[
    provider === "spaceship" ? "spaceship" : "cloudflare"
  ];
}

function sanitizeProviderPermissions(provider: string, permissions: string[]) {
  const supportedValues = new Set(
    getProviderPermissionOptions(provider).map((option) => option.value),
  );

  return permissions.filter((permission, index) => {
    if (!supportedValues.has(permission)) {
      return false;
    }
    return permissions.indexOf(permission) === index;
  });
}

function parsePositiveIntParam(value: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function getUserDomainsCacheKey(userId: string | undefined, suffix: string) {
  return `shiro-email.user-domains.${userId ?? "guest"}.${suffix}`;
}

function getProviderCredentialFields(provider: string, authType: string) {
  if (provider === "spaceship") {
    return [
      { key: "apiKey" as const, label: "API Key", placeholder: "输入 Spaceship API Key", type: "password" },
      { key: "apiSecret" as const, label: "API Secret", placeholder: "输入 Spaceship API Secret", type: "password" },
    ];
  }

  if (authType === "api_key") {
    return [
      {
        key: "apiEmail" as const,
        label: "Account Email",
        placeholder: "输入 Cloudflare 账号邮箱（仅 Global API Key 模式需要）",
        type: "email",
      },
      {
        key: "apiKey" as const,
        label: "Global API Key",
        placeholder: "输入 Cloudflare Global API Key",
        type: "password",
      },
    ];
  }

  return [
    {
      key: "apiToken" as const,
      label: "API Token",
      placeholder: "输入 Cloudflare API Token（推荐）",
      type: "password",
    },
  ];
}

function canSubmitProvider(provider: string, authType: string, credentials: ProviderCredentials, allowEmpty = false) {
  const hasAnyCredential =
    credentials.apiToken.trim() !== "" ||
    credentials.apiEmail.trim() !== "" ||
    credentials.apiKey.trim() !== "" ||
    credentials.apiSecret.trim() !== "";
  if (allowEmpty && !hasAnyCredential) {
    return true;
  }
  if (provider === "spaceship") {
    return credentials.apiKey.trim() !== "" && credentials.apiSecret.trim() !== "";
  }
  if (authType === "api_key") {
    return credentials.apiEmail.trim() !== "" && credentials.apiKey.trim() !== "";
  }
  return credentials.apiToken.trim() !== "";
}

function getProviderAuthModeMeta(provider: string, authType: string) {
  if (provider === "spaceship") {
    return {
      title: "Spaceship API Key + Secret",
      description: "当前模式下需要填写 API Key 与 API Secret，平台会用它们读取 Zone 与 DNS 记录。",
    };
  }

  if (authType === "api_key") {
    return {
      title: "Cloudflare Global API Key + Email",
      description: "当前模式下需要填写账号邮箱和 Global API Key，不再显示 API Token 输入框。",
    };
  }

  return {
    title: "Cloudflare API Token",
    description: "当前模式下只需要 API Token，推荐使用具备 Zone Read / DNS Read / DNS Edit 权限的 Token。",
  };
}

function formatProviderTimestamp(value?: string) {
  if (!value) {
    return "时间未知";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(i18n.language, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function summarizeVerificationStatus(items: UserVerificationProfileItem[]) {
  return items.reduce(
    (summary, item) => {
      if (item.status === "verified") {
        summary.verified += 1;
      } else if (item.status === "drifted") {
        summary.drifted += 1;
      } else {
        summary.pending += 1;
      }
      return summary;
    },
    { verified: 0, drifted: 0, pending: 0 },
  );
}

function describeProviderWorkspaceError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("unsupported dns record type")) {
    return "当前工作区里包含暂不支持的记录类型，请先检查该 Zone 中的记录类型是否受支持。";
  }
  if (normalized.includes("invalid request headers")) {
    return "DNS 服务商拒绝了当前请求头，请检查鉴权方式是否与凭据匹配，例如 Cloudflare 的 API Token / Global API Key 模式是否选对。";
  }
  if (normalized.includes("authentication") || normalized.includes("unauthorized") || normalized.includes("forbidden")) {
    return "DNS 服务商鉴权失败，请检查 API Token、邮箱、API Key 或 Secret 是否正确，并确认账号权限足够。";
  }
  if (normalized.includes("status 400")) {
    return "DNS 服务商拒绝了这次请求，请检查凭据格式、鉴权方式和接口权限是否正确。";
  }
  if (normalized.includes("status 401") || normalized.includes("status 403")) {
    return "DNS 服务商返回未授权，请检查 Provider 凭据是否过期或权限不足。";
  }
  if (normalized.includes("status 404")) {
    return "指定的 Zone 或记录在 DNS 服务商侧不存在，请确认域名已真正接入该 Provider。";
  }
  if (normalized.includes("status 429")) {
    return "DNS 服务商当前触发了频率限制，请稍后再试。";
  }
  if (normalized.includes("status 5")) {
    return "DNS 服务商暂时不可用，请稍后再试。";
  }
  return message;
}

function isProviderRateLimitedError(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("status 429") ||
    normalized.includes("too many requests") ||
    normalized.includes("rate limit")
  );
}

function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const safePageSize = Math.max(pageSize, 1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * safePageSize;

  return {
    items: items.slice(start, start + safePageSize),
    page: safePage,
    total,
    totalPages,
  };
}

function PaginationControls({
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

function SectionToggle({
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

function dedupeProviderRecords(records: UserProviderRecordItem[]) {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = [record.type, record.name, record.value, record.ttl, record.priority, record.proxied].join("|");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function collectRepairRecords(items: UserVerificationProfileItem[]) {
  return dedupeProviderRecords(items.flatMap((item) => item.repairRecords ?? []));
}

function getProviderCredentialChecklist(provider: string, authType: string) {
  const normalizedProvider = provider.trim().toLowerCase();
  const normalizedAuthType = authType.trim().toLowerCase();

  if (normalizedProvider === "spaceship") {
    return [
      "确认已填写 Spaceship 的 API Key。",
      "确认已填写与该 Key 配套的 API Secret。",
      "确认当前 Key 已开通 Zone / DNS 读取权限。",
      "确认目标域名已经真实托管在这个 Spaceship 账号下。",
    ];
  }

  if (normalizedProvider === "cloudflare" && normalizedAuthType === "api_key") {
    return [
      "确认鉴权方式选择的是 api_key，而不是 api_token。",
      "确认已填写 Cloudflare 账号邮箱（Account Email）。",
      "确认已填写该账号的 Global API Key。",
      "确认该账号下确实存在目标 Zone，并且允许读取 DNS。",
    ];
  }

  if (normalizedProvider === "cloudflare") {
    return [
      "确认鉴权方式选择的是 api_token，而不是 api_key。",
      "确认已填写 Cloudflare API Token。",
      "确认该 Token 至少具备 Zone Read、DNS Read 或 DNS Edit 权限。",
      "确认目标域名已经接入到当前 Cloudflare 账号。",
    ];
  }

  return [
    "确认当前 Provider 的鉴权方式与凭据类型一致。",
    "确认凭据没有过期、撤销或被限制来源 IP。",
    "确认目标域名已接入当前 Provider 账号，并具备读取 Zone 的权限。",
  ];
}

export function UserDnsPage() {
  const currentUserId = useAuthStore((state) => state.user?.userId);
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const autoWorkspaceRequestRef = useRef<string | null>(null);
  const pendingWorkspaceRefreshRef = useRef<number | null>(null);
  const userCacheScope = currentUserId === undefined ? undefined : String(currentUserId);
  const domainsCacheKey = getUserDomainsCacheKey(userCacheScope, "domains-cache");
  const providersCacheKey = getUserDomainsCacheKey(userCacheScope, "providers-cache");
  const workspaceCacheKey = getUserDomainsCacheKey(userCacheScope, "workspace-cache");
  const persistedWorkspace = readPersistedState(workspaceCacheKey, {
    activeProviderWorkspace: null as {
      providerId: number;
      providerName: string;
      provider: string;
      authType: string;
      zones: UserProviderZoneItem[];
    } | null,
    activeZoneWorkspace: null as {
      providerId: number;
      zoneId: string;
      zoneName: string;
      records: UserProviderRecordItem[];
      changeSets: UserDNSChangeSetItem[];
      verifications: UserVerificationProfileItem[];
    } | null,
    expandedRootIds: {} as Record<number, boolean>,
    expandedProviderId: null as number | null,
    expandedZoneKey: null as string | null,
    recordsExpanded: false,
    recordsPage: 1,
    zoneConfigMode: {} as Record<string, "manual" | "provider_api">,
    activePreviewChangeSetId: null as number | null,
  });
  const queryClient = useQueryClient();
  const [isCreateProviderDialogOpen, setCreateProviderDialogOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null);
  const [editingProviderHasBoundDomains, setEditingProviderHasBoundDomains] = useState(false);
  const [isCreateRootDialogOpen, setCreateRootDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [rootDomain, setRootDomain] = useState("");
  const [selectedBaseDomainId, setSelectedBaseDomainId] = useState<number | "">("");
  const [selectedProviderId, setSelectedProviderId] = useState<string>("");
  const [prefixInput, setPrefixInput] = useState("mx\nmx.edge\nrelay.cn.hk");
  const [expandedRootIds, setExpandedRootIds] = useState<Record<number, boolean>>(
    persistedWorkspace.expandedRootIds,
  );
  const [expandedProviderId, setExpandedProviderId] = useState<number | null>(
    persistedWorkspace.expandedProviderId,
  );
  const [providerDraft, setProviderDraft] = useState({
    provider: "cloudflare",
    displayName: "",
    authType: "api_token",
    status: "pending",
    permissionValues: DEFAULT_PROVIDER_PERMISSIONS,
  });
  const [providerCredentials, setProviderCredentials] = useState<ProviderCredentials>(EMPTY_PROVIDER_CREDENTIALS);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [providerError, setProviderError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [providerWorkspaceError, setProviderWorkspaceError] = useState<{
    title: string;
    message: string;
    detail?: string;
  } | null>(null);
  const [lastProviderWorkspaceAttempt, setLastProviderWorkspaceAttempt] = useState<
    | { kind: "zones"; providerId: number; providerName: string }
    | { kind: "records"; providerId: number; zoneId: string; zoneName: string }
    | null
  >(null);
  const [activeProviderWorkspace, setActiveProviderWorkspace] = useState<{
    providerId: number;
    providerName: string;
    provider: string;
    authType: string;
    zones: UserProviderZoneItem[];
  } | null>(persistedWorkspace.activeProviderWorkspace);
  const [activeZoneWorkspace, setActiveZoneWorkspace] = useState<{
    providerId: number;
    zoneId: string;
    zoneName: string;
    records: UserProviderRecordItem[];
    changeSets: UserDNSChangeSetItem[];
    verifications: UserVerificationProfileItem[];
  } | null>(persistedWorkspace.activeZoneWorkspace);
  const [expandedZoneKey, setExpandedZoneKey] = useState<string | null>(
    persistedWorkspace.expandedZoneKey,
  );
  const [providerDeleteDialog, setProviderDeleteDialog] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [recordsExpanded, setRecordsExpanded] = useState<boolean>(
    persistedWorkspace.recordsExpanded,
  );
  const [recordsPage, setRecordsPage] = useState<number>(persistedWorkspace.recordsPage);
  const [zoneConfigMode, setZoneConfigMode] = useState<Record<string, "manual" | "provider_api">>(
    persistedWorkspace.zoneConfigMode,
  );
  const [activePreviewChangeSetId, setActivePreviewChangeSetId] = useState<number | null>(
    persistedWorkspace.activePreviewChangeSetId,
  );
  const [zoneFailureCooldowns, setZoneFailureCooldowns] = useState<Record<string, number>>({});

  const domainsQuery = useQuery({
    queryKey: ["user-domains"],
    queryFn: fetchDomains,
    staleTime: PERSISTED_QUERY_STALE_TIME,
    placeholderData: () => readPersistedState(domainsCacheKey, [] as Awaited<ReturnType<typeof fetchDomains>>),
  });
  const providersQuery = useQuery({
    queryKey: ["user-domain-providers"],
    queryFn: fetchDomainProviders,
    staleTime: PERSISTED_QUERY_STALE_TIME,
    placeholderData: () =>
      readPersistedState(
        providersCacheKey,
        [] as Awaited<ReturnType<typeof fetchDomainProviders>>,
      ),
  });
  const providerItems = useMemo(() => providersQuery.data ?? [], [providersQuery.data]);
  const domainItems = useMemo(() => domainsQuery.data ?? [], [domainsQuery.data]);
  const boundProviderIds = useMemo(
    () =>
      new Set(
        domainItems
          .map((item) => item.providerAccountId)
          .filter((providerAccountId): providerAccountId is number => typeof providerAccountId === "number"),
      ),
    [domainItems],
  );
  const isEditingProvider = editingProviderId !== null;
  const providerCoreFieldsLocked = isEditingProvider && editingProviderHasBoundDomains;

  const providerMap = useMemo(() => {
    const map = new Map<number, (typeof providerItems)[number]>();
    providerItems.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [providerItems]);

  const ownedDomains = useMemo(
    () => domainItems.filter((item) => item.ownerUserId !== undefined && item.ownerUserId === currentUserId),
    [currentUserId, domainItems],
  );

  const rootDomains = useMemo(
    () => ownedDomains.filter((item) => item.kind === "root"),
    [ownedDomains],
  );

  const requestedProviderId = parsePositiveIntParam(searchParams.get("providerId"));
  const requestedDomainId = parsePositiveIntParam(searchParams.get("domainId"));
  const requestedDomain = useMemo(
    () =>
      requestedDomainId !== null
        ? ownedDomains.find((item) => item.id === requestedDomainId) ?? null
        : null,
    [ownedDomains, requestedDomainId],
  );
  const requestedProvider = useMemo(
    () =>
      requestedProviderId !== null
        ? providerItems.find((item) => item.id === requestedProviderId) ?? null
        : null,
    [providerItems, requestedProviderId],
  );

  const clearInvalidSearchParams = useCallback((keys: Array<"providerId" | "domainId">) => {
    const nextParams = new URLSearchParams(searchParams);
    let changed = false;

    keys.forEach((key) => {
      if (nextParams.has(key)) {
        nextParams.delete(key);
        changed = true;
      }
    });

    if (!changed) {
      return;
    }

    navigate(
      {
        pathname: location.pathname,
        search: nextParams.toString() ? `?${nextParams.toString()}` : "",
      },
      { replace: true },
    );
  }, [location.pathname, navigate, searchParams]);

  function scheduleWorkspaceRefresh(delayMs = 2500) {
    if (!activeZoneWorkspace) {
      return;
    }

    if (pendingWorkspaceRefreshRef.current !== null) {
      window.clearTimeout(pendingWorkspaceRefreshRef.current);
    }

    pendingWorkspaceRefreshRef.current = window.setTimeout(() => {
      pendingWorkspaceRefreshRef.current = null;
      void refreshUserDomainData().catch((error) => {
        setProviderError(getAPIErrorMessage(error, "DNS 记录已保存，但重新同步工作区失败。"));
      });
    }, delayMs);
  }

  const providerOptions = providerItems.map((item) => ({
    value: String(item.id),
    label: item.displayName,
    keywords: [item.provider, item.status],
  }));
  const resetProviderForm = useCallback(() => {
    setEditingProviderId(null);
    setEditingProviderHasBoundDomains(false);
    setProviderDraft({
      provider: "cloudflare",
      displayName: "",
      authType: "api_token",
      status: "pending",
      permissionValues: DEFAULT_PROVIDER_PERMISSIONS,
    });
    setProviderCredentials(EMPTY_PROVIDER_CREDENTIALS);
  }, []);
  const openCreateProviderDialog = useCallback(() => {
    setActionNotice(null);
    setProviderError(null);
    resetProviderForm();
    setCreateProviderDialogOpen(true);
  }, [resetProviderForm]);
  const openEditProviderDialog = useCallback((provider: UserDomainProviderItem) => {
    setActionNotice(null);
    setProviderError(null);
    setEditingProviderId(provider.id);
    setEditingProviderHasBoundDomains(boundProviderIds.has(provider.id));
    setProviderDraft({
      provider: provider.provider,
      displayName: provider.displayName,
      authType: provider.authType,
      status: provider.status,
      permissionValues: sanitizeProviderPermissions(provider.provider, provider.capabilities),
    });
    setProviderCredentials(EMPTY_PROVIDER_CREDENTIALS);
    setCreateProviderDialogOpen(true);
  }, [boundProviderIds]);

  const providerZoneMutation = useMutation({
    mutationFn: async (provider: { id: number; displayName: string }) => {
      const zones = await fetchDomainProviderZones(provider.id);
      const providerMeta = providerMap.get(provider.id);
      return {
        providerId: provider.id,
        providerName: provider.displayName,
        provider: providerMeta?.provider ?? "unknown",
        authType: providerMeta?.authType ?? "unknown",
        zones,
      };
    },
    onSuccess: (payload) => {
      setProviderError(null);
      setProviderWorkspaceError(null);
      setActionNotice(`已载入 ${payload.providerName} 的 Zone 列表。`);
      setActiveProviderWorkspace(payload);
      setActiveZoneWorkspace(null);
      setExpandedZoneKey(null);
      setLastProviderWorkspaceAttempt({
        kind: "zones",
        providerId: payload.providerId,
        providerName: payload.providerName,
      });
    },
    onError: (error, provider) => {
      const detail = getAPIErrorMessage(error, "拉取 Provider Zones 失败，请先校验凭据。");
      const message = describeProviderWorkspaceError(detail);
      setProviderError(message);
      setProviderWorkspaceError({
        title: `${provider.displayName} · Zone 加载失败`,
        message,
        detail,
      });
      setActiveProviderWorkspace({
        providerId: provider.id,
        providerName: provider.displayName,
        provider: providerMap.get(provider.id)?.provider ?? "unknown",
        authType: providerMap.get(provider.id)?.authType ?? "unknown",
        zones: [],
      });
      setActiveZoneWorkspace(null);
      setExpandedZoneKey(null);
      setLastProviderWorkspaceAttempt({
        kind: "zones",
        providerId: provider.id,
        providerName: provider.displayName,
      });
    },
  });

  const providerZoneDetailMutation = useMutation({
    mutationFn: async (input: { providerId: number; zoneId: string; zoneName: string }) => {
      const zoneKey = `${input.providerId}:${input.zoneId}`;
      const cooldownUntil = zoneFailureCooldowns[zoneKey] ?? 0;
      if (cooldownUntil > Date.now()) {
        const waitSeconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
        throw new Error(`DNS 服务商当前仍在冷却中，请约 ${waitSeconds} 秒后再刷新此 Zone。`);
      }
      const [records, changeSets, verifications] = await Promise.all([
        fetchDomainProviderRecords(input.providerId, input.zoneId),
        fetchDomainProviderChangeSets(input.providerId, input.zoneId),
        fetchDomainProviderVerifications(input.providerId, input.zoneId, input.zoneName),
      ]);
      return { ...input, records, changeSets, verifications };
    },
    onSuccess: (payload) => {
      const zoneKey = `${payload.providerId}:${payload.zoneId}`;
      setZoneFailureCooldowns((current) => {
        if (!(zoneKey in current)) {
          return current;
        }
        const next = { ...current };
        delete next[zoneKey];
        return next;
      });
      setProviderError(null);
      setProviderWorkspaceError(null);
      setActionNotice(`已载入 ${payload.zoneName} 的 DNS 详情。`);
      setActiveZoneWorkspace(payload);
      setActivePreviewChangeSetId(payload.changeSets.find((item) => item.status !== "applied")?.id ?? payload.changeSets[0]?.id ?? null);
      setExpandedZoneKey(`${payload.providerId}:${payload.zoneId}`);
      setLastProviderWorkspaceAttempt({
        kind: "records",
        providerId: payload.providerId,
        zoneId: payload.zoneId,
        zoneName: payload.zoneName,
      });
    },
    onError: (error, input) => {
      const detail = getAPIErrorMessage(error, "拉取 Zone Records 失败，请检查 Provider 连接。");
      const message = describeProviderWorkspaceError(detail);
      if (isProviderRateLimitedError(detail)) {
        const zoneKey = `${input.providerId}:${input.zoneId}`;
        setZoneFailureCooldowns((current) => ({
          ...current,
          [zoneKey]: Date.now() + PROVIDER_ZONE_FAILURE_COOLDOWN_MS,
        }));
      }
      setProviderError(message);
      setProviderWorkspaceError({
        title: `${input.zoneName} · DNS 详情加载失败`,
        message,
        detail,
      });
      setLastProviderWorkspaceAttempt({
        kind: "records",
        providerId: input.providerId,
        zoneId: input.zoneId,
        zoneName: input.zoneName,
      });
    },
  });

  const createProviderMutation = useMutation({
    mutationFn: createDomainProvider,
    onSuccess: async () => {
      setProviderError(null);
      setActionNotice("Provider 账号已添加。");
      resetProviderForm();
      setCreateProviderDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["user-domain-providers"], refetchType: "all" });
    },
    onError: (error) => {
      setProviderError(getAPIErrorMessage(error, "新增 Provider 失败，请检查鉴权信息。"));
    },
  });
  const updateProviderMutation = useMutation({
    mutationFn: ({ providerAccountId, input }: { providerAccountId: number; input: Parameters<typeof updateDomainProvider>[1] }) =>
      updateDomainProvider(providerAccountId, input),
    onSuccess: async () => {
      setProviderError(null);
      setActionNotice("Provider 账号已更新。");
      resetProviderForm();
      setCreateProviderDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["user-domain-providers"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
    },
    onError: (error) => {
      setProviderError(getAPIErrorMessage(error, "更新 Provider 失败，请检查字段和绑定关系。"));
    },
  });

  const validateProviderMutation = useMutation({
    mutationFn: validateDomainProvider,
    onSuccess: async () => {
      setProviderError(null);
      setProviderWorkspaceError(null);
      setActionNotice("Provider 校验完成。");
      await queryClient.invalidateQueries({ queryKey: ["user-domain-providers"], refetchType: "all" });
    },
    onError: (error) => {
      setProviderError(getAPIErrorMessage(error, "校验 Provider 失败，请检查凭据。"));
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: deleteDomainProvider,
    onSuccess: async (_, providerId) => {
      setProviderError(null);
      setProviderWorkspaceError(null);
      setActionNotice("Provider 账号已删除。");
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchDomainProviders>>>(["user-domain-providers"], (current) =>
        (current ?? []).filter((item) => item.id !== providerId),
      );
      if (activeProviderWorkspace?.providerId === providerId) {
        setActiveProviderWorkspace(null);
        setActiveZoneWorkspace(null);
        setExpandedProviderId(null);
        setExpandedZoneKey(null);
        setLastProviderWorkspaceAttempt(null);
        setActivePreviewChangeSetId(null);
      }
      if (selectedProviderId === String(providerId)) {
        setSelectedProviderId("");
      }
      await queryClient.invalidateQueries({ queryKey: ["user-domain-providers"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
    },
    onError: (error) => {
      setProviderError(getAPIErrorMessage(error, "删除 Provider 失败，请先解除域名绑定。"));
    },
  });

  const validatingProviderId = validateProviderMutation.isPending
    ? validateProviderMutation.variables ?? null
    : null;
  const deletingProviderId = deleteProviderMutation.isPending
    ? deleteProviderMutation.variables ?? null
    : null;
  const loadingZonesProviderId = providerZoneMutation.isPending
    ? providerZoneMutation.variables?.id ?? null
    : null;
  const loadingZoneDetailKey = providerZoneDetailMutation.isPending
    ? `${providerZoneDetailMutation.variables?.providerId ?? ""}:${providerZoneDetailMutation.variables?.zoneId ?? ""}`
    : null;
  const isRefreshingDomainData = domainsQuery.isRefetching || providersQuery.isRefetching;

  const createDomainMutation = useMutation({
    mutationFn: createDomain,
    onSuccess: async () => {
      setRootDomain("");
      setSelectedProviderId("");
      setDomainError(null);
      setActionNotice("根域名已添加。");
      setCreateRootDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "添加根域名失败，请检查域名格式。"));
    },
  });

  const generateMutation = useMutation({
    mutationFn: generateSubdomains,
    onSuccess: async () => {
      setDomainError(null);
      setActionNotice("子域名已批量生成。");
      setGenerateDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "批量生成子域名失败。"));
    },
  });

  const previewChangeSetMutation = useMutation({
    mutationFn: async (input: {
      providerId: number;
      zoneId: string;
      zoneName: string;
      records: UserProviderRecordItem[];
    }) =>
      previewDomainProviderChangeSet(input.providerId, input.zoneId, {
        zoneName: input.zoneName,
        records: input.records,
      }),
    onSuccess: (changeSet) => {
      setActionNotice(`已生成 DNS 变更预览：${changeSet.summary}`);
      setProviderError(null);
      setActivePreviewChangeSetId(changeSet.id);
      setActiveZoneWorkspace((current) => {
        if (!current) {
          return current;
        }
        const nextChangeSets = [changeSet, ...current.changeSets.filter((item) => item.id !== changeSet.id)];
        return {
          ...current,
          changeSets: nextChangeSets,
        };
      });
    },
    onError: (error) => {
      setProviderError(getAPIErrorMessage(error, "生成 DNS 自动修复预览失败。"));
    },
  });

  const applyChangeSetMutation = useMutation({
    mutationFn: applyDomainProviderChangeSet,
    onSuccess: (changeSet) => {
      setActionNotice(`已通过 Provider API 应用变更：${changeSet.summary}`);
      setProviderError(null);
      setActivePreviewChangeSetId(changeSet.id);
      setActiveZoneWorkspace((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          changeSets: current.changeSets.map((item) => (item.id === changeSet.id ? changeSet : item)),
        };
      });
    },
    onError: (error) => {
      setProviderError(getAPIErrorMessage(error, "应用 DNS 自动修复失败。"));
    },
  });

  const saveRecommendedRecordsMutation = useMutation({
    mutationFn: async (input: {
      providerId: number;
      zoneId: string;
      zoneName: string;
      records: UserProviderRecordItem[];
    }) => {
      const preview = await previewDomainProviderChangeSet(input.providerId, input.zoneId, {
        zoneName: input.zoneName,
        records: input.records,
      });
      return applyDomainProviderChangeSet(preview.id);
    },
    onSuccess: async (changeSet, variables) => {
      const verifications = await fetchDomainProviderVerifications(
        variables.providerId,
        variables.zoneId,
        variables.zoneName,
      );
      setActionNotice(`已保存到 DNS 服务商：${changeSet.summary}`);
      setProviderError(null);
      setActivePreviewChangeSetId(changeSet.id);
      setActiveZoneWorkspace((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          records: dedupeProviderRecords(variables.records),
          changeSets: [
            changeSet,
            ...current.changeSets.filter((item: UserDNSChangeSetItem) => item.id !== changeSet.id),
          ],
          verifications,
        };
      });
      scheduleWorkspaceRefresh();
    },
    onError: (error) => {
      setProviderError(getAPIErrorMessage(error, "保存 DNS 自动修复失败。"));
    },
  });

  function retryLastProviderWorkspaceAttempt() {
    if (!lastProviderWorkspaceAttempt) {
      return;
    }
    setActionNotice(null);
    if (lastProviderWorkspaceAttempt.kind === "zones") {
      providerZoneMutation.mutate({
        id: lastProviderWorkspaceAttempt.providerId,
        displayName: lastProviderWorkspaceAttempt.providerName,
      });
      return;
    }
    providerZoneDetailMutation.mutate({
      providerId: lastProviderWorkspaceAttempt.providerId,
      zoneId: lastProviderWorkspaceAttempt.zoneId,
      zoneName: lastProviderWorkspaceAttempt.zoneName,
    });
  }

  async function resolveLiveOwnedProvider(providerId: number) {
    const result = await providersQuery.refetch();
    const liveProviders = result.data ?? providersQuery.data ?? [];
    const provider = liveProviders.find((item) => item.id === providerId) ?? null;

    if (provider) {
      return provider;
    }

    queryClient.setQueryData<Awaited<ReturnType<typeof fetchDomainProviders>>>(
      ["user-domain-providers"],
      liveProviders,
    );

    if (activeProviderWorkspace?.providerId === providerId) {
      setActiveProviderWorkspace(null);
      setActiveZoneWorkspace(null);
      setExpandedProviderId(null);
      setExpandedZoneKey(null);
      setLastProviderWorkspaceAttempt(null);
      setActivePreviewChangeSetId(null);
    }


    setActionNotice(null);
    setProviderWorkspaceError(null);
    setProviderError("Provider 账号已不存在，已自动刷新你的 Provider 列表。");
    return null;
  }

  async function validateActiveProviderWorkspace() {
    if (!activeProviderWorkspace) {
      return;
    }
    setActionNotice(null);
    const liveProvider = await resolveLiveOwnedProvider(activeProviderWorkspace.providerId);
    if (!liveProvider) {
      return;
    }
    validateProviderMutation.mutate(liveProvider.id);
  }

  function toggleProviderExpanded(providerId: number) {
    setExpandedProviderId((current) => (current === providerId ? null : providerId));
  }

  function toggleZoneExpanded(providerId: number, zoneId: string) {
    const key = `${providerId}:${zoneId}`;
    setExpandedZoneKey((current) => (current === key ? null : key));
  }

  const recommendedRepairRecords = useMemo(
    () => (activeZoneWorkspace ? collectRepairRecords(activeZoneWorkspace.verifications) : []),
    [activeZoneWorkspace],
  );
  const paginatedZoneRecords = useMemo(
    () =>
      paginateItems(
        activeZoneWorkspace?.records ?? [],
        recordsPage,
        USER_DNS_RECORDS_PAGE_SIZE,
      ),
    [activeZoneWorkspace?.records, recordsPage],
  );
  const activePreviewChangeSet = useMemo(
    () =>
      activeZoneWorkspace?.changeSets.find((item) => item.id === activePreviewChangeSetId) ??
      activeZoneWorkspace?.changeSets.find((item) => item.status !== "applied") ??
      activeZoneWorkspace?.changeSets[0] ??
      null,
    [activePreviewChangeSetId, activeZoneWorkspace],
  );

  useEffect(() => {
    writePersistedState(domainsCacheKey, domainsQuery.data ?? []);
  }, [domainsCacheKey, domainsQuery.data]);

  useEffect(() => {
    writePersistedState(providersCacheKey, providersQuery.data ?? []);
  }, [providersCacheKey, providersQuery.data]);

  useEffect(() => {
    writePersistedState(workspaceCacheKey, {
      activeProviderWorkspace,
      activeZoneWorkspace,
      expandedRootIds,
      expandedProviderId,
      expandedZoneKey,
      recordsExpanded,
      recordsPage,
      zoneConfigMode,
      activePreviewChangeSetId,
    });
  }, [
    activePreviewChangeSetId,
    activeProviderWorkspace,
    activeZoneWorkspace,
    expandedProviderId,
    expandedRootIds,
    expandedZoneKey,
    recordsExpanded,
    recordsPage,
    workspaceCacheKey,
    zoneConfigMode,
  ]);

  useEffect(() => {
    setRecordsPage(1);
  }, [activeZoneWorkspace?.providerId, activeZoneWorkspace?.zoneId]);

  useEffect(() => {
    return () => {
      if (pendingWorkspaceRefreshRef.current !== null) {
        window.clearTimeout(pendingWorkspaceRefreshRef.current);
      }
    };
  }, []);

  const hasPendingVerifications = useMemo(
    () => (activeZoneWorkspace?.verifications ?? []).some((p) => p.status !== "verified"),
    [activeZoneWorkspace?.verifications],
  );
  const [isAutoRefreshing, setIsAutoRefreshing] = useState(false);

  useEffect(() => {
    if (!hasPendingVerifications || !activeZoneWorkspace) {
      setIsAutoRefreshing(false);
      return;
    }
    const intervalId = window.setInterval(async () => {
      try {
        setIsAutoRefreshing(true);
        const verifications = await fetchDomainProviderVerifications(
          activeZoneWorkspace.providerId,
          activeZoneWorkspace.zoneId,
          activeZoneWorkspace.zoneName,
        );
        setActiveZoneWorkspace((current) =>
          current ? { ...current, verifications } : current,
        );
      } catch {
        // Silently ignore polling errors
      } finally {
        setIsAutoRefreshing(false);
      }
    }, 30_000);
    return () => {
      window.clearInterval(intervalId);
      setIsAutoRefreshing(false);
    };
  }, [hasPendingVerifications, activeZoneWorkspace?.providerId, activeZoneWorkspace?.zoneId, activeZoneWorkspace?.zoneName]);

  const requestedDomainUsesActiveWorkspace = useCallback((domain: {
    providerAccountId?: number | null;
    rootDomain: string;
    domain: string;
  }) => {
    return Boolean(
      activeZoneWorkspace &&
        domain.providerAccountId === activeZoneWorkspace.providerId &&
        (activeZoneWorkspace.zoneName === domain.rootDomain ||
          activeZoneWorkspace.zoneName === domain.domain),
    );
  }, [activeZoneWorkspace]);

  const syncWorkspaceForRequestedDomain = useCallback(async (domain: (typeof ownedDomains)[number]) => {
    setProviderError(null);
    setProviderWorkspaceError(null);

    if (!domain.providerAccountId) {
      setDomainError(`域名 ${domain.domain} 尚未绑定 DNS 服务商，请先回域名管理完成绑定。`);
      setActiveZoneWorkspace(null);
      setExpandedZoneKey(null);
      setActivePreviewChangeSetId(null);
      return;
    }

    const providerMeta = providerMap.get(domain.providerAccountId);
    const providerName = domain.providerDisplayName ?? providerMeta?.displayName ?? domain.provider ?? "Provider";

    try {
      const zones =
        activeProviderWorkspace?.providerId === domain.providerAccountId
          ? activeProviderWorkspace.zones
          : await fetchDomainProviderZones(domain.providerAccountId);

      setActiveProviderWorkspace({
        providerId: domain.providerAccountId,
        providerName,
        provider: providerMeta?.provider ?? domain.provider ?? "unknown",
        authType: providerMeta?.authType ?? "unknown",
        zones,
      });
      setExpandedProviderId(domain.providerAccountId);

      const targetZone =
        zones.find((zone) => zone.name === domain.rootDomain) ??
        zones.find((zone) => zone.name === domain.domain) ??
        null;

      if (!targetZone) {
        setDomainError(
          `已载入 ${providerName} 的 Zone 列表，但没有匹配到 ${domain.rootDomain} 或 ${domain.domain}。请先确认该域名真实托管在当前 Provider 账号下。`,
        );
        setActiveZoneWorkspace(null);
        setExpandedZoneKey(null);
        setActivePreviewChangeSetId(null);
        return;
      }

      const [records, changeSets] = await Promise.all([
        fetchDomainProviderRecords(domain.providerAccountId, targetZone.id),
        fetchDomainProviderChangeSets(domain.providerAccountId, targetZone.id),
      ]);
      const verifications = await fetchDomainProviderVerifications(
        domain.providerAccountId,
        targetZone.id,
        targetZone.name,
      );

      setDomainError(null);
      setActionNotice(`已按域名 ${domain.domain} 定位到 Zone ${targetZone.name}。`);
      setActiveZoneWorkspace({
        providerId: domain.providerAccountId,
        zoneId: targetZone.id,
        zoneName: targetZone.name,
        records,
        changeSets,
        verifications,
      });
      setExpandedZoneKey(`${domain.providerAccountId}:${targetZone.id}`);
      setActivePreviewChangeSetId(
        changeSets.find((item) => item.status !== "applied")?.id ?? changeSets[0]?.id ?? null,
      );
    } catch (error) {
      setDomainError(getAPIErrorMessage(error, "暂时无法加载该域名的 DNS 工作区，请先检查 Provider 连接。"));
    }
  }, [activeProviderWorkspace, providerMap]);

  const refreshUserDomainData = useCallback(async () => {
    setActionNotice(null);
    const [, providersResult] = await Promise.all([domainsQuery.refetch(), providersQuery.refetch()]);
    const liveProviders = providersResult.data ?? providerItems;
    const liveProviderIds = new Set(liveProviders.map((item) => item.id));

    if (activeProviderWorkspace && liveProviderIds.has(activeProviderWorkspace.providerId)) {
      const zones = await fetchDomainProviderZones(activeProviderWorkspace.providerId);
      setActiveProviderWorkspace((current) =>
        current
          ? {
              ...current,
              zones,
            }
          : current,
      );
    } else if (activeProviderWorkspace) {
      setActiveProviderWorkspace(null);
      setActiveZoneWorkspace(null);
      setExpandedProviderId(null);
      setExpandedZoneKey(null);
      setLastProviderWorkspaceAttempt(null);
      setActivePreviewChangeSetId(null);
    }

    if (activeZoneWorkspace && liveProviderIds.has(activeZoneWorkspace.providerId)) {
      const [records, changeSets] = await Promise.all([
        fetchDomainProviderRecords(activeZoneWorkspace.providerId, activeZoneWorkspace.zoneId),
        fetchDomainProviderChangeSets(activeZoneWorkspace.providerId, activeZoneWorkspace.zoneId),
      ]);
      const verifications = await fetchDomainProviderVerifications(
        activeZoneWorkspace.providerId,
        activeZoneWorkspace.zoneId,
        activeZoneWorkspace.zoneName,
      );

      setActiveZoneWorkspace({
        ...activeZoneWorkspace,
        records,
        changeSets,
        verifications,
      });
      setActivePreviewChangeSetId(
        changeSets.find((item) => item.status !== "applied")?.id ?? changeSets[0]?.id ?? null,
      );
    } else if (activeZoneWorkspace) {
      setActiveZoneWorkspace(null);
      setExpandedZoneKey(null);
      setLastProviderWorkspaceAttempt(null);
      setActivePreviewChangeSetId(null);
    }
  }, [activeProviderWorkspace, activeZoneWorkspace, domainsQuery, providerItems, providersQuery]);

  useEffect(() => {
    if (!requestedDomain && !requestedProvider) {
      autoWorkspaceRequestRef.current = null;
    }

    const invalidKeys: Array<"providerId" | "domainId"> = [];

    if (searchParams.has("domainId") && requestedDomainId !== null && !requestedDomain) {
      invalidKeys.push("domainId");
    }
    if (searchParams.has("providerId") && requestedProviderId !== null && !requestedProvider) {
      invalidKeys.push("providerId");
    }

    if (invalidKeys.length > 0) {
      autoWorkspaceRequestRef.current = null;
      clearInvalidSearchParams(invalidKeys);
      return;
    }

    if (requestedDomain) {
      const targetRoot =
        requestedDomain.kind === "root"
          ? requestedDomain
          : rootDomains.find((item) => item.domain === requestedDomain.rootDomain) ?? null;
      if (targetRoot) {
        setExpandedRootIds((current) => ({ ...current, [targetRoot.id]: true }));
      }

      if (!requestedDomain.providerAccountId) {
        autoWorkspaceRequestRef.current = `domain:${requestedDomain.id}:unbound`;
        setDomainError(`域名 ${requestedDomain.domain} 尚未绑定 DNS 服务商，请先回域名管理完成绑定。`);
        return;
      }

      const requestKey = `domain:${requestedDomain.id}:${requestedDomain.providerAccountId}:${requestedDomain.rootDomain}:${requestedDomain.domain}`;
      if (
        !requestedDomainUsesActiveWorkspace(requestedDomain) &&
        !providerZoneMutation.isPending &&
        !providerZoneDetailMutation.isPending &&
        autoWorkspaceRequestRef.current !== requestKey
      ) {
        autoWorkspaceRequestRef.current = requestKey;
        void syncWorkspaceForRequestedDomain(requestedDomain);
        return;
      }

      autoWorkspaceRequestRef.current = requestKey;
    }

    const targetProvider =
      requestedProvider ??
      (requestedDomain?.providerAccountId
        ? providerItems.find((item) => item.id === requestedDomain.providerAccountId) ?? null
        : null);

    if (!targetProvider) {
      return;
    }

    const requestKey = `provider:${targetProvider.id}`;
    setExpandedProviderId(targetProvider.id);
    if (
      activeProviderWorkspace?.providerId === targetProvider.id ||
      providerZoneMutation.isPending ||
      autoWorkspaceRequestRef.current === requestKey
    ) {
      return;
    }

    autoWorkspaceRequestRef.current = requestKey;
    providerZoneMutation.mutate({
      id: targetProvider.id,
      displayName: targetProvider.displayName,
    });
  }, [
    activeProviderWorkspace?.providerId,
    activeZoneWorkspace,
    clearInvalidSearchParams,
    location.pathname,
    providerZoneDetailMutation.isPending,
    providerZoneMutation,
    requestedDomain,
    requestedDomainId,
    requestedDomainUsesActiveWorkspace,
    requestedProvider,
    requestedProviderId,
    rootDomains,
    searchParams,
    syncWorkspaceForRequestedDomain,
    providerItems,
  ]);

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/dashboard/domains">域名管理</Link>
            </Button>
            <Button onClick={openCreateProviderDialog} variant="outline">
              新增 Provider
            </Button>
            <Button onClick={() => void refreshUserDomainData()} variant="outline">
              <RefreshCcw className={isRefreshingDomainData ? "size-4 animate-spin" : "size-4"} />
              刷新
            </Button>
          </div>
        }
        description="单独处理 Zone、Records、验证状态与 Change Set，不再和域名资产管理混在同一页。"
        title="DNS 配置"
      >
        <AlertDialog
          open={providerDeleteDialog !== null}
          onOpenChange={(open) => {
            if (!open) {
              setProviderDeleteDialog(null);
            }
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>删除 DNS 服务商账号？</AlertDialogTitle>
              <AlertDialogDescription>
                {providerDeleteDialog
                  ? `确认删除 Provider ${providerDeleteDialog.name}？删除后将无法继续读取 Zone，也无法继续通过该账号管理 DNS。`
                  : ""}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (!providerDeleteDialog) {
                    return;
                  }
                  const liveProvider = await resolveLiveOwnedProvider(providerDeleteDialog.id);
                  if (!liveProvider) {
                    setProviderDeleteDialog(null);
                    return;
                  }
                  deleteProviderMutation.mutate(liveProvider.id);
                  setProviderDeleteDialog(null);
                }}
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {providerError ? (
          <NoticeBanner autoHideMs={5000} onDismiss={() => setProviderError(null)} variant="error">
            {providerError}
          </NoticeBanner>
        ) : null}
        {domainError ? (
          <NoticeBanner autoHideMs={5000} onDismiss={() => setDomainError(null)} variant="error">
            {domainError}
          </NoticeBanner>
        ) : null}
        {actionNotice ? (
          <NoticeBanner autoHideMs={5000} onDismiss={() => setActionNotice(null)} variant="success">
            {actionNotice}
          </NoticeBanner>
        ) : null}
        {(requestedProvider || requestedDomain || activeZoneWorkspace) ? (
          <Card className="border-border/60 bg-card/85 shadow-none">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">当前上下文</div>
                <p className="text-xs text-muted-foreground">
                  {requestedDomain
                    ? `已按域名 ${requestedDomain.domain} 定位 DNS 工作区。`
                    : requestedProvider
                      ? `已按 Provider ${requestedProvider.displayName} 定位 DNS 工作区。`
                      : `当前查看 ${activeZoneWorkspace?.zoneName ?? activeProviderWorkspace?.providerName ?? "DNS 工作区"}。`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {requestedDomain ? <WorkspaceBadge variant="outline">域名：{requestedDomain.domain}</WorkspaceBadge> : null}
                {requestedProvider ? <WorkspaceBadge variant="outline">Provider：{requestedProvider.displayName}</WorkspaceBadge> : null}
                {activeZoneWorkspace ? <WorkspaceBadge variant="outline">Zone：{activeZoneWorkspace.zoneName}</WorkspaceBadge> : null}
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Card className="border-border/60 bg-card/85 shadow-none">
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="text-sm font-medium">操作提示</div>
                <p className="text-xs text-muted-foreground">
                  先展开 Provider，再进入目标 Zone 查看记录和验证结果；根域记录通常用 `@`，子域记录只填前缀即可。
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <WorkspaceBadge variant="outline">1. 选择 Provider</WorkspaceBadge>
                <WorkspaceBadge variant="outline">2. 查看验证</WorkspaceBadge>
                <WorkspaceBadge variant="outline">3. 应用修复</WorkspaceBadge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog
          onOpenChange={(open) => {
            setCreateProviderDialogOpen(open);
            if (!open) {
              resetProviderForm();
            }
          }}
          open={isCreateProviderDialogOpen}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{isEditingProvider ? "编辑 Provider" : "新增 Provider"}</DialogTitle>
              <DialogDescription>
                {isEditingProvider
                  ? providerCoreFieldsLocked
                    ? "当前 Provider 已绑定域名，可继续更新显示名称、凭据、状态和权限，但不能改服务商类型或鉴权方式。"
                    : "当前 Provider 未绑定域名，服务商类型、鉴权方式、凭据与权限都可以直接修改。"
                  : "为你的私有域名添加 DNS Provider 账号，后续根域名可直接绑定。"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 md:grid-cols-2">
              <WorkspaceField label="Provider">
                <OptionCombobox
                  ariaLabel="Provider"
                  emptyLabel="没有可选 Provider"
                  options={[{ value: "cloudflare", label: "Cloudflare" }, { value: "spaceship", label: "Spaceship" }]}
                  placeholder="选择 Provider"
                  searchPlaceholder="搜索 Provider"
                  disabled={providerCoreFieldsLocked}
                  value={providerDraft.provider}
                  onValueChange={(value) => {
                    const nextProvider = value || "cloudflare";
                    setProviderDraft((current) => ({
                      ...current,
                      provider: nextProvider,
                      authType: nextProvider === "spaceship" ? "api_key" : "api_token",
                      permissionValues: sanitizeProviderPermissions(
                        nextProvider,
                        current.permissionValues,
                      ),
                    }));
                    setProviderCredentials(EMPTY_PROVIDER_CREDENTIALS);
                  }}
                />
              </WorkspaceField>
              <WorkspaceField label="显示名称">
                <Input value={providerDraft.displayName} onChange={(event) => setProviderDraft((current) => ({ ...current, displayName: event.target.value }))} placeholder="例如 My Cloudflare" />
              </WorkspaceField>
              <WorkspaceField label="鉴权方式">
                <OptionCombobox
                  ariaLabel="鉴权方式"
                  emptyLabel="没有可选鉴权方式"
                  options={
                    providerDraft.provider === "spaceship"
                      ? [{ value: "api_key", label: "API Key + API Secret" }]
                      : [
                          { value: "api_token", label: "API Token" },
                          { value: "api_key", label: "Global API Key + Email" },
                        ]
                  }
                  placeholder="选择鉴权方式"
                  searchPlaceholder="搜索鉴权方式"
                  disabled={providerCoreFieldsLocked}
                  value={providerDraft.authType}
                  onValueChange={(value) => {
                    setProviderDraft((current) => ({
                      ...current,
                      authType: value || (current.provider === "spaceship" ? "api_key" : "api_token"),
                    }));
                    setProviderCredentials(EMPTY_PROVIDER_CREDENTIALS);
                  }}
                />
              </WorkspaceField>
              <WorkspaceField label="权限">
                <MultiOptionCombobox
                  ariaLabel="权限"
                  emptyLabel="没有可选权限"
                  options={getProviderPermissionOptions(providerDraft.provider)}
                  placeholder="选择需要的权限"
                  searchPlaceholder="继续搜索权限"
                  values={providerDraft.permissionValues}
                  onValuesChange={(values) =>
                    setProviderDraft((current) => ({
                      ...current,
                      permissionValues: sanitizeProviderPermissions(current.provider, values),
                    }))
                  }
                />
              </WorkspaceField>
            </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                <div className="text-sm font-medium">{getProviderAuthModeMeta(providerDraft.provider, providerDraft.authType).title}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {getProviderAuthModeMeta(providerDraft.provider, providerDraft.authType).description}
                  {isEditingProvider ? " 留空则沿用当前已保存的凭据。" : ""}
                </div>
              </div>
            <div className="grid gap-4 md:grid-cols-2">
              {getProviderCredentialFields(providerDraft.provider, providerDraft.authType).map((field) => (
                <WorkspaceField key={field.key} label={field.label}>
                  <Input
                    aria-label={field.label}
                    type={field.type}
                    placeholder={field.placeholder}
                    value={providerCredentials[field.key]}
                    onChange={(event) => setProviderCredentials((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                </WorkspaceField>
              ))}
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
              <Button
                disabled={
                  !providerDraft.displayName.trim() ||
                  !canSubmitProvider(providerDraft.provider, providerDraft.authType, providerCredentials, isEditingProvider) ||
                  createProviderMutation.isPending ||
                  updateProviderMutation.isPending
                }
                onClick={() => {
                  const input = {
                    provider: providerDraft.provider,
                    displayName: providerDraft.displayName.trim(),
                    authType: providerDraft.authType,
                    credentials: {
                      apiToken: providerCredentials.apiToken.trim(),
                      apiEmail: providerCredentials.apiEmail.trim(),
                      apiKey: providerCredentials.apiKey.trim(),
                      apiSecret: providerCredentials.apiSecret.trim(),
                    },
                    status: providerDraft.status,
                    capabilities: sanitizeProviderPermissions(
                      providerDraft.provider,
                      providerDraft.permissionValues,
                    ),
                  };

                  if (editingProviderId !== null) {
                    updateProviderMutation.mutate({ providerAccountId: editingProviderId, input });
                    return;
                  }

                  createProviderMutation.mutate(input);
                }}
              >
                {createProviderMutation.isPending || updateProviderMutation.isPending
                  ? "创建中..."
                  : isEditingProvider
                    ? "保存 Provider"
                    : "创建 Provider"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog onOpenChange={setCreateRootDialogOpen} open={isCreateRootDialogOpen}>
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>添加根域名</DialogTitle>
              <DialogDescription>录入新的私有根域名，并可直接绑定到已添加的 Provider。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <WorkspaceField label="根域名">
                <Input onChange={(event) => setRootDomain(event.target.value)} placeholder="example.com" value={rootDomain} />
              </WorkspaceField>
              <WorkspaceField label="绑定 Provider">
                <OptionCombobox
                  ariaLabel="绑定 Provider"
                  emptyLabel="没有可用 Provider"
                  options={providerOptions}
                  placeholder="可选，选择一个 Provider"
                  searchPlaceholder="搜索 Provider"
                  value={selectedProviderId || undefined}
                  onValueChange={(value) => setSelectedProviderId(value || "")}
                />
              </WorkspaceField>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
              <Button
                disabled={!rootDomain.trim()}
                onClick={() => createDomainMutation.mutate({
                  domain: rootDomain,
                  status: "active",
                  visibility: "private",
                  publicationStatus: "draft",
                  verificationScore: 0,
                  healthStatus: "unknown",
                  providerAccountId: selectedProviderId ? Number(selectedProviderId) : undefined,
                  weight: 100,
                })}
              >添加根域名</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog onOpenChange={setGenerateDialogOpen} open={isGenerateDialogOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>批量生成子域名</DialogTitle>
              <DialogDescription>从已有根域名批量生成多级子域名，适合 MX、relay、edge 等前缀。</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <WorkspaceField label="选择根域名">
                <OptionCombobox
                  ariaLabel="选择根域名"
                  emptyLabel="没有可选根域名"
                  options={rootDomains.map((item) => ({ value: String(item.id), label: item.domain, keywords: [item.providerDisplayName || ""] }))}
                  placeholder="选择根域名"
                  searchPlaceholder="搜索根域名"
                  value={selectedBaseDomainId === "" ? undefined : String(selectedBaseDomainId)}
                  onValueChange={(value) => setSelectedBaseDomainId(value ? Number(value) : "")}
                />
              </WorkspaceField>
              <WorkspaceField label="多级前缀">
                <Textarea rows={6} onChange={(event) => setPrefixInput(event.target.value)} value={prefixInput} placeholder={"一行一个前缀，例如：\nmx\nmx.edge\nrelay.cn.hk"} />
              </WorkspaceField>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">取消</Button></DialogClose>
              <Button
                disabled={selectedBaseDomainId === ""}
                onClick={() => generateMutation.mutate({
                  baseDomainId: Number(selectedBaseDomainId),
                  prefixes: prefixInput.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
                  status: "active",
                  visibility: "private",
                  publicationStatus: "draft",
                  verificationScore: 0,
                  healthStatus: "unknown",
                  weight: 90,
                })}
              >批量生成子域名</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>




        <div className="space-y-4">
          <Card className="border-border/60 bg-card/85 shadow-none">
            <CardContent className="space-y-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">Provider 账号</div>
                  <p className="text-xs text-muted-foreground">你的私有 DNS Provider 列表，根域名可以直接绑定到这些账号。</p>
                </div>
                <WorkspaceBadge>{(providersQuery.data ?? []).length} 个</WorkspaceBadge>
              </div>
              {(providersQuery.data ?? []).length ? (
                <div className="space-y-2">
                  {(providersQuery.data ?? []).map((provider) => (
                    <div key={provider.id} className="rounded-xl border border-border/60 bg-background/50">
                      <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                          onClick={() => toggleProviderExpanded(provider.id)}
                        >
                          <div className="mt-0.5 flex size-6 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground">
                            {expandedProviderId === provider.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">{provider.displayName}</span>
                              <WorkspaceBadge variant="outline">{provider.provider}</WorkspaceBadge>
                              <WorkspaceBadge variant="outline">{provider.status}</WorkspaceBadge>
                            </div>
                            <p className="text-xs text-muted-foreground">{provider.authType} · {(provider.capabilities ?? []).join(" / ") || "未配置权限"}</p>
                            {activeProviderWorkspace?.providerId === provider.id ? (
                              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                <span>已载入 {activeProviderWorkspace.zones.length} 个 Zone</span>
                                {activeZoneWorkspace?.providerId === provider.id ? (
                                  <>
                                    <span>·</span>
                                    <span>{activeZoneWorkspace.records.length} 条记录</span>
                                    <span>·</span>
                                    <span>{activeZoneWorkspace.changeSets.length} 个变更集</span>
                                  </>
                                ) : null}
                              </div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground">折叠后仅保留账号摘要，需要时再展开查看 Zone 与记录。</div>
                            )}
                          </div>
                        </button>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={validatingProviderId === provider.id}
                            onClick={async () => {
                              const liveProvider = await resolveLiveOwnedProvider(provider.id);
                              if (!liveProvider) {
                                return;
                              }
                              validateProviderMutation.mutate(liveProvider.id);
                            }}
                          >
                            <RefreshCcw className="size-4" />
                            {validatingProviderId === provider.id ? "校验中..." : "校验"}
                          </Button>
                          <Button
                            aria-label={`${provider.displayName} 编辑`}
                            size="sm"
                            variant="ghost"
                            disabled={deletingProviderId === provider.id}
                            onClick={() => openEditProviderDialog(provider)}
                          >
                            编辑
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={
                              loadingZonesProviderId === provider.id ||
                              providerZoneDetailMutation.isPending
                            }
                            onClick={async () => {
                              const liveProvider = await resolveLiveOwnedProvider(provider.id);
                              if (!liveProvider) {
                                return;
                              }
                              setExpandedProviderId(liveProvider.id);
                              providerZoneMutation.mutate({
                                id: liveProvider.id,
                                displayName: liveProvider.displayName,
                              });
                            }}
                          >
                            {loadingZonesProviderId === provider.id ? "载入中..." : "查看 Zones"}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={deletingProviderId === provider.id}
                            onClick={() => {
                              setActionNotice(null);
                              setProviderDeleteDialog({
                                id: provider.id,
                                name: provider.displayName,
                              });
                            }}
                          >
                            <Trash2 className="size-4" />
                            {deletingProviderId === provider.id ? "删除中..." : "删除"}
                          </Button>
                        </div>
                      </div>
                      {expandedProviderId === provider.id ? (
                        <div className="border-t border-border/60 px-4 py-3">
                          {activeProviderWorkspace?.providerId === provider.id ? (
                            <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <div className="text-sm font-medium">{activeProviderWorkspace.providerName} · Zones</div>
                                  <p className="text-xs text-muted-foreground">当前 Provider 返回的可用 Zone，以及每个 Zone 的真实 Records / 验证状态。</p>
                                </div>
                                <WorkspaceBadge variant="outline">{activeProviderWorkspace.zones.length} 个 Zone</WorkspaceBadge>
                              </div>

                              {providerWorkspaceError ? (
                                <NoticeBanner
                                  autoHideMs={5000}
                                  onDismiss={() => setProviderWorkspaceError(null)}
                                  pauseOnHover
                                  variant="warning"
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="font-medium">{providerWorkspaceError.title}</div>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={providerZoneMutation.isPending || providerZoneDetailMutation.isPending}
                                      onClick={retryLastProviderWorkspaceAttempt}
                                    >
                                      重试
                                    </Button>
                                  </div>
                                  <p className="mt-1 leading-6">{providerWorkspaceError.message}</p>
                                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-background/60 p-3 text-xs text-foreground/90 dark:bg-background/20">
                                    <div className="font-medium">建议检查</div>
                                    <ul className="mt-2 space-y-1.5">
                                      {getProviderCredentialChecklist(activeProviderWorkspace.provider, activeProviderWorkspace.authType).map((item) => (
                                        <li key={item} className="flex gap-2">
                                          <span className="mt-[2px] text-amber-600 dark:text-amber-300">•</span>
                                          <span>{item}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                  {providerWorkspaceError.detail && providerWorkspaceError.detail !== providerWorkspaceError.message ? (
                                    <p className="mt-2 text-xs text-amber-800/80 dark:text-amber-200/80">
                                      原始返回：{providerWorkspaceError.detail}
                                    </p>
                                  ) : null}
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" disabled={validateProviderMutation.isPending} onClick={validateActiveProviderWorkspace}>
                                      {validateProviderMutation.isPending ? "校验中..." : "先校验 Provider"}
                                    </Button>
                                  </div>
                                </NoticeBanner>
                              ) : null}

                              {activeProviderWorkspace.zones.length ? (
                                <div className="space-y-2">
                                  {activeProviderWorkspace.zones.map((zone) => {
                                    const zoneKey = `${activeProviderWorkspace.providerId}:${zone.id}`;
                                    const isExpanded = expandedZoneKey === zoneKey;
                                    const isLoaded =
                                      activeZoneWorkspace?.providerId === activeProviderWorkspace.providerId &&
                                      activeZoneWorkspace.zoneId === zone.id;
                                    const isLoadingThisZone = loadingZoneDetailKey === zoneKey;
                                    const cooldownUntil = zoneFailureCooldowns[zoneKey] ?? 0;
                                    const cooldownSeconds =
                                      cooldownUntil > Date.now()
                                        ? Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000))
                                        : 0;

                                    return (
                                      <div key={zoneKey} className="rounded-xl border border-border/60 bg-card/45">
                                        <div className="flex flex-col gap-3 px-3.5 py-3 md:flex-row md:items-start md:justify-between">
                                          <button
                                            type="button"
                                            className="flex min-w-0 flex-1 items-start gap-3 text-left"
                                            onClick={() => toggleZoneExpanded(activeProviderWorkspace.providerId, zone.id)}
                                          >
                                            <div className="mt-0.5 flex size-5 items-center justify-center rounded-md border border-border/60 bg-background/80 text-muted-foreground">
                                              {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                                            </div>
                                            <div className="min-w-0 space-y-1">
                                              <div className="truncate font-medium">{zone.name}</div>
                                              <div className="text-xs text-muted-foreground">Zone ID: {zone.id}</div>
                                              {isLoaded ? (
                                                <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                                                  <span>{activeZoneWorkspace.records.length} 条记录</span>
                                                  <span>·</span>
                                                  <span>{activeZoneWorkspace.changeSets.length} 个变更集</span>
                                                  <span>·</span>
                                                  <span>{activeZoneWorkspace.verifications.length} 条验证</span>
                                                </div>
                                              ) : (
                                                <div className="text-[11px] text-muted-foreground">按需展开查看真实记录、验证和变更集。</div>
                                              )}
                                            </div>
                                          </button>
                                          <div className="flex flex-wrap items-center gap-2 text-[0.82rem] text-muted-foreground md:justify-end">
                                            <WorkspaceBadge variant="outline">{zone.status}</WorkspaceBadge>
                                            {cooldownSeconds > 0 ? (
                                              <WorkspaceBadge variant="outline">冷却 {cooldownSeconds}s</WorkspaceBadge>
                                            ) : null}
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={isLoadingThisZone || cooldownSeconds > 0}
                                              onClick={() => {
                                                setExpandedZoneKey(zoneKey);
                                                providerZoneDetailMutation.mutate({
                                                  providerId: activeProviderWorkspace.providerId,
                                                  zoneId: zone.id,
                                                  zoneName: zone.name,
                                                });
                                              }}
                                            >
                                              {isLoadingThisZone
                                                ? "载入中..."
                                                : cooldownSeconds > 0
                                                  ? `冷却 ${cooldownSeconds}s`
                                                  : "查看记录"}
                                            </Button>
                                          </div>
                                        </div>

                                        {isExpanded ? (
                                          <div className="border-t border-border/60 px-3.5 py-3">
                                            {isLoaded ? (
                                              <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                  <div>
                                                    <div className="text-sm font-medium">{activeZoneWorkspace.zoneName} · DNS 详情</div>
                                                    <p className="text-xs text-muted-foreground">这里展示真实 Records、最近 Change Set 历史和自动验证结果。</p>
                                                  </div>
                                                  <div className="flex flex-wrap gap-2">
                                                    <WorkspaceBadge variant="outline">{activeZoneWorkspace.records.length} 条记录</WorkspaceBadge>
                                                    <WorkspaceBadge variant="outline">{activeZoneWorkspace.changeSets.length} 个变更集</WorkspaceBadge>
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      onClick={() => {
                                                        setProviderWorkspaceError(null);
                                                        providerZoneDetailMutation.mutate({
                                                          providerId: activeZoneWorkspace.providerId,
                                                          zoneId: activeZoneWorkspace.zoneId,
                                                          zoneName: activeZoneWorkspace.zoneName,
                                                        });
                                                      }}
                                                    >
                                                      <RefreshCcw className={loadingZoneDetailKey === `${activeZoneWorkspace.providerId}:${activeZoneWorkspace.zoneId}` ? "size-4 animate-spin" : "size-4"} />
                                                      刷新当前 Zone
                                                    </Button>
                                                  </div>
                                                </div>

                                                <div className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-3">
                                                  <SectionToggle
                                                    expanded={recordsExpanded}
                                                    title="DNS Records"
                                                    description="按需展开查看当前 Zone 的真实 DNS 记录，长值会完整换行显示。"
                                                    meta={
                                                      <>
                                                        <WorkspaceBadge variant="outline">
                                                          {activeZoneWorkspace.records.length} 条记录
                                                        </WorkspaceBadge>
                                                        <WorkspaceBadge variant="outline">
                                                          第 {paginatedZoneRecords.page} / {paginatedZoneRecords.totalPages} 页
                                                        </WorkspaceBadge>
                                                      </>
                                                    }
                                                    onToggle={() => setRecordsExpanded((current) => !current)}
                                                  />

                                                  {recordsExpanded ? (
                                                    activeZoneWorkspace.records.length ? (
                                                      <>
                                                        <div className="overflow-x-auto rounded-xl border border-border/60">
                                                          <table className="min-w-[720px] border-collapse text-left text-sm">
                                                            <thead className="bg-background/80 text-muted-foreground">
                                                              <tr>
                                                                <th className="px-3 py-2 font-medium">类型</th>
                                                                <th className="px-3 py-2 font-medium">名称</th>
                                                                <th className="px-3 py-2 font-medium">值</th>
                                                                <th className="px-3 py-2 font-medium">TTL</th>
                                                              </tr>
                                                            </thead>
                                                            <tbody>
                                                              {paginatedZoneRecords.items.map((record, index) => (
                                                                <tr
                                                                  className="group/row border-t border-border/60 bg-card/50"
                                                                  key={`${record.id ?? record.name}-${(paginatedZoneRecords.page - 1) * USER_DNS_RECORDS_PAGE_SIZE + index}`}
                                                                >
                                                                  <td className="px-3 py-3">
                                                                    <WorkspaceBadge variant="outline">{record.type}</WorkspaceBadge>
                                                                  </td>
                                                                  <td className="px-3 py-3 font-medium">{record.name}</td>
                                                                  <td className="px-3 py-3 font-mono text-xs break-all whitespace-normal">
                                                                    <span className="inline-flex items-center gap-1.5">
                                                                      <span>
                                                                        {formatDNSRecordValueForDisplay(
                                                                          record.type,
                                                                          record.value,
                                                                          activeProviderWorkspace?.provider,
                                                                        )}
                                                                      </span>
                                                                      <DnsCopyButton value={record.value} />
                                                                    </span>
                                                                  </td>
                                                                  <td className="px-3 py-3 text-xs text-muted-foreground">{record.ttl}</td>
                                                                </tr>
                                                              ))}
                                                            </tbody>
                                                          </table>
                                                        </div>
                                                        <PaginationControls
                                                          itemLabel="Record"
                                                          page={paginatedZoneRecords.page}
                                                          pageSize={USER_DNS_RECORDS_PAGE_SIZE}
                                                          total={paginatedZoneRecords.total}
                                                          totalPages={paginatedZoneRecords.totalPages}
                                                          onPageChange={setRecordsPage}
                                                        />
                                                      </>
                                                    ) : (
                                                      <WorkspaceEmpty title="暂无 Records" description="当前 Zone 还没有可读取的 DNS Records。" />
                                                    )
                                                  ) : null}
                                                </div>

                                                <div className="grid gap-3 lg:grid-cols-2">
                                                  <div className="space-y-2 rounded-xl border border-border/60 bg-card/50 p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                      <div className="text-sm font-medium">自动验证</div>
                                                      {(() => {
                                                        const summary = summarizeVerificationStatus(activeZoneWorkspace.verifications);
                                                        return (
                                                          <div className="flex items-center gap-2">
                                                            <WorkspaceBadge variant="outline">通过 {summary.verified}</WorkspaceBadge>
                                                            <WorkspaceBadge variant="outline">漂移 {summary.drifted}</WorkspaceBadge>
                                                            <WorkspaceBadge variant="outline">待处理 {summary.pending}</WorkspaceBadge>
                                                            {isAutoRefreshing ? (
                                                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                                                <RefreshCcw className="size-3 animate-spin" />
                                                                {t("dns.autoRefreshing")}
                                                              </span>
                                                            ) : hasPendingVerifications ? (
                                                              <span className="text-xs text-muted-foreground">{t("dns.autoRefreshing")}</span>
                                                            ) : null}
                                                          </div>
                                                        );
                                                      })()}
                                                    </div>
                                                    {activeZoneWorkspace.verifications.length ? (
                                                      activeZoneWorkspace.verifications.map((item) => (
                                                        <WorkspaceListRow
                                                          key={item.verificationType}
                                                          title={item.verificationType}
                                                          description={item.summary}
                                                          meta={
                                                            <>
                                                              <WorkspaceBadge variant={item.status === "verified" ? "secondary" : "outline"}>{item.status}</WorkspaceBadge>
                                                              <span>{formatProviderTimestamp(item.lastCheckedAt)}</span>
                                                            </>
                                                          }
                                                        />
                                                      ))
                                                    ) : (
                                                      <WorkspaceEmpty title="暂无验证结果" description="当前 Zone 还没有可展示的自动验证结果。" />
                                                    )}
                                                  </div>

                                                  <div className="space-y-2 rounded-xl border border-border/60 bg-card/50 p-3">
                                                    <div className="text-sm font-medium">最近 Change Set</div>
                                                    {activeZoneWorkspace.changeSets.length ? (
                                                      activeZoneWorkspace.changeSets.slice(0, 5).map((item) => (
                                                        <WorkspaceListRow
                                                          key={item.id}
                                                          title={`#${item.id} · ${item.summary}`}
                                                          description={`${item.operations.length} 条操作 · ${item.provider}`}
                                                          meta={
                                                            <>
                                                              <WorkspaceBadge variant="outline">{item.status}</WorkspaceBadge>
                                                              <span>{formatProviderTimestamp(item.appliedAt ?? item.createdAt)}</span>
                                                            </>
                                                          }
                                                        />
                                                      ))
                                                    ) : (
                                                      <WorkspaceEmpty title="暂无变更集" description="这个 Zone 还没有保存过 DNS 变更记录。" />
                                                    )}
                                                  </div>
                                                </div>

                                                <div className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-3">
                                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div>
                                                      <div className="text-sm font-medium">DNS 配置方式</div>
                                                      <p className="text-xs text-muted-foreground">你可以手动配置建议记录，或直接调用已绑定 Provider 的官方 API 自动配置 / 修复记录。</p>
                                                    </div>
                                                    <div className="inline-flex rounded-lg border border-border/60 bg-background/80 p-1">
                                                      {[
                                                        { value: "manual" as const, label: "手动配置" },
                                                        { value: "provider_api" as const, label: "自动配置" },
                                                      ].map((option) => {
                                                        const zoneKey = `${activeZoneWorkspace.providerId}:${activeZoneWorkspace.zoneId}`;
                                                        const selectedMode = zoneConfigMode[zoneKey] ?? "manual";
                                                        return (
                                                          <button
                                                            key={option.value}
                                                            type="button"
                                                            className={`rounded-md px-3 py-1.5 text-xs transition ${
                                                              selectedMode === option.value
                                                                ? "bg-foreground text-background"
                                                                : "text-muted-foreground hover:text-foreground"
                                                            }`}
                                                            onClick={() =>
                                                              setZoneConfigMode((current) => ({
                                                                ...current,
                                                                [zoneKey]: option.value,
                                                              }))
                                                            }
                                                          >
                                                            {option.label}
                                                          </button>
                                                        );
                                                      })}
                                                    </div>
                                                  </div>

                                                  {(zoneConfigMode[`${activeZoneWorkspace.providerId}:${activeZoneWorkspace.zoneId}`] ?? "manual") === "manual" ? (
                                                    <div className="space-y-3">
                                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="text-sm font-medium">建议手动记录</div>
                                                        <WorkspaceBadge variant="outline">{recommendedRepairRecords.length} 条建议</WorkspaceBadge>
                                                      </div>
                                                      {recommendedRepairRecords.length ? (
                                                        <div className="overflow-x-auto rounded-xl border border-border/60">
                                                          <table className="min-w-[760px] border-collapse text-left text-sm">
                                                            <thead className="bg-background/80 text-muted-foreground">
                                                              <tr>
                                                                <th className="px-3 py-2 font-medium">类型</th>
                                                                <th className="px-3 py-2 font-medium">主机记录</th>
                                                                <th className="px-3 py-2 font-medium">记录值</th>
                                                                <th className="px-3 py-2 font-medium">TTL</th>
                                                                <th className="px-3 py-2 font-medium">优先级</th>
                                                              </tr>
                                                            </thead>
                                                            <tbody>
                                                              {recommendedRepairRecords.map((record, index) => (
                                                                <tr className="group/row border-t border-border/60 bg-background/70" key={`${record.type}-${record.name}-${index}`}>
                                                                  <td className="px-3 py-3"><WorkspaceBadge variant="outline">{record.type}</WorkspaceBadge></td>
                                                                  <td className="px-3 py-3 font-medium">{record.name}</td>
                                                                  <td className="px-3 py-3 font-mono text-xs break-all whitespace-normal">
                                                                    <span className="inline-flex items-center gap-1.5">
                                                                      <span>
                                                                        {formatDNSRecordValueForDisplay(
                                                                          record.type,
                                                                          record.value,
                                                                          activeProviderWorkspace?.provider,
                                                                        )}
                                                                      </span>
                                                                      <DnsCopyButton value={record.value} />
                                                                    </span>
                                                                  </td>
                                                                  <td className="px-3 py-3 text-xs text-muted-foreground">{record.ttl || "自动"}</td>
                                                                  <td className="px-3 py-3 text-xs text-muted-foreground">{record.priority || "-"}</td>
                                                                </tr>
                                                              ))}
                                                            </tbody>
                                                          </table>
                                                        </div>
                                                      ) : (
                                                        <WorkspaceEmpty title="当前无需手动修复" description="自动验证没有发现需要补的记录，或者这个 Zone 还没有产生 repair records。" />
                                                      )}
                                                    </div>
                                                  ) : (
                                                    <div className="space-y-3">
                                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div>
                                                          <div className="text-sm font-medium">Provider API 自动修复</div>
                                                          <p className="text-xs text-muted-foreground">系统会基于验证结果里的 repair records 生成自动配置预览，再调用官方 DNS Provider API 执行。</p>
                                                        </div>
                                                        <div className="flex flex-wrap gap-2">
                                                          <Button
                                                            size="sm"
                                                            disabled={recommendedRepairRecords.length === 0 || saveRecommendedRecordsMutation.isPending}
                                                            onClick={() =>
                                                              saveRecommendedRecordsMutation.mutate({
                                                                providerId: activeZoneWorkspace.providerId,
                                                                zoneId: activeZoneWorkspace.zoneId,
                                                                zoneName: activeZoneWorkspace.zoneName,
                                                                records: recommendedRepairRecords,
                                                              })
                                                            }
                                                          >
                                                            {saveRecommendedRecordsMutation.isPending ? "保存中..." : "保存到服务商"}
                                                          </Button>
                                                          <Button
                                                            size="sm"
                                                            variant="outline"
                                                            disabled={recommendedRepairRecords.length === 0 || previewChangeSetMutation.isPending || saveRecommendedRecordsMutation.isPending}
                                                            onClick={() =>
                                                              previewChangeSetMutation.mutate({
                                                                providerId: activeZoneWorkspace.providerId,
                                                                zoneId: activeZoneWorkspace.zoneId,
                                                                zoneName: activeZoneWorkspace.zoneName,
                                                                records: recommendedRepairRecords,
                                                              })
                                                            }
                                                          >
                                                            {previewChangeSetMutation.isPending ? "生成中..." : "预览自动配置"}
                                                          </Button>
                                                          <Button
                                                            size="sm"
                                                            variant="secondary"
                                                            disabled={!activePreviewChangeSet || activePreviewChangeSet.status === "applied" || applyChangeSetMutation.isPending || saveRecommendedRecordsMutation.isPending}
                                                            onClick={() => {
                                                              if (!activePreviewChangeSet) {
                                                                return;
                                                              }
                                                              applyChangeSetMutation.mutate(activePreviewChangeSet.id);
                                                            }}
                                                          >
                                                            {applyChangeSetMutation.isPending ? "应用中..." : "一键应用"}
                                                          </Button>
                                                        </div>
                                                      </div>

                                                      {recommendedRepairRecords.length === 0 ? (
                                                        <WorkspaceEmpty title="没有可自动修复的记录" description="先让系统跑出 verification repair records，或手动核对当前 Zone 配置。" />
                                                      ) : null}

                                                      {activePreviewChangeSet ? (
                                                        <div className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-3">
                                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                                            <div>
                                                              <div className="text-sm font-medium">变更预览 #{activePreviewChangeSet.id}</div>
                                                              <p className="text-xs text-muted-foreground">{activePreviewChangeSet.summary}</p>
                                                            </div>
                                                            <div className="flex flex-wrap gap-2">
                                                              <WorkspaceBadge variant="outline">{activePreviewChangeSet.status}</WorkspaceBadge>
                                                              <WorkspaceBadge variant="outline">{activePreviewChangeSet.operations.length} 条操作</WorkspaceBadge>
                                                            </div>
                                                          </div>
                                                          <div className="space-y-2">
                                                            {activePreviewChangeSet.operations.length ? (
                                                              activePreviewChangeSet.operations.map((operation) => (
                                                                <WorkspaceListRow
                                                                  key={operation.id}
                                                                  title={`${operation.operation.toUpperCase()} · ${operation.recordType} · ${operation.recordName}`}
                                                                  description={
                                                                    operation.after?.value ??
                                                                    operation.before?.value ??
                                                                    "无记录值"
                                                                  }
                                                                  descriptionClassName="font-mono text-xs break-all whitespace-normal"
                                                                  meta={
                                                                    <>
                                                                      <WorkspaceBadge variant="outline">{operation.status}</WorkspaceBadge>
                                                                      <span>{activePreviewChangeSet.provider}</span>
                                                                    </>
                                                                  }
                                                                />
                                                              ))
                                                            ) : (
                                                              <WorkspaceEmpty title="没有变更" description="当前建议记录与 Provider 现状一致，无需自动修复。" />
                                                            )}
                                                          </div>
                                                        </div>
                                                      ) : (
                                                        <WorkspaceEmpty title="还没有自动配置预览" description="点击“预览自动配置”后，这里会展示即将调用官方 Provider API 执行的操作。" />
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            ) : (
                                              <WorkspaceEmpty title="尚未加载 Zone 详情" description="点击“查看记录”后，这里会展开当前 Zone 的记录、验证与变更集。" />
                                            )}
                                          </div>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <WorkspaceEmpty title="暂无 Zone" description="这个 Provider 当前没有返回可用 Zone，先检查账号权限或接入的域名。" />
                              )}
                            </div>
                          ) : (
                            <WorkspaceEmpty title="尚未加载工作区" description="点“查看 Zones”后，这里会展开当前 Provider 的 Zone、记录和验证工作区。" />
                          )}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <WorkspaceEmpty title="还没有 Provider" description="先添加一个 Cloudflare 或 Spaceship 账号，再绑定根域名。" />
              )}
            </CardContent>
          </Card>

          <NoticeBanner variant="info">
            待验证域名、绑定状态和“配置 DNS”入口已移动到 `域名管理` 页面；这里现在只保留 DNS 服务商、Zone、Records 和变更工作区。
          </NoticeBanner>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
