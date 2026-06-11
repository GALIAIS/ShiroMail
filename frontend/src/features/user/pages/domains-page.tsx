import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronRight, CircleX, Globe, LoaderCircle, RefreshCcw, Trash2 } from "lucide-react";
import i18n from "@/lib/i18n";
import { useURLPagination } from "@/hooks/use-url-pagination";
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
import { NoticeBanner } from "@/components/ui/notice-banner";
import { OptionCombobox } from "@/components/ui/option-combobox";
import { PaginationControls } from "@/components/ui/pagination-controls";
import { Textarea } from "@/components/ui/textarea";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceField,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceStatusBadge,
} from "@/components/layout/workspace-ui";
import { getAPIErrorMessage } from "@/lib/http";
import { useAuthStore } from "@/lib/auth-store";
import { paginateItems } from "@/lib/pagination";
import { readPersistedState, writePersistedState } from "@/lib/persisted-state";
import { cn } from "@/lib/utils";
import { validateRequiredText, validateSelection } from "@/lib/validation";
import {
  createDomain,
  deleteDomain,
  fetchDomainProviders,
  fetchDomains,
  generateSubdomains,
  requestDomainPublicPool,
  type DomainVerificationResult,
  updateDomainProviderBinding,
  verifyDomain,
  withdrawDomainPublicPool,
} from "../api";

function getUserDomainsCacheKey(userId: string | undefined, suffix: string) {
  return `shiro-email.user-domains.${userId ?? "guest"}.${suffix}`;
}

const PERSISTED_QUERY_STALE_TIME = 60_000;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

type DomainStatusGroup = "unbound" | "pending" | "verified";

function getDomainStatusGroup(domain: {
  providerAccountId?: number | null;
  healthStatus: string;
  verificationScore: number;
}) {
  if (domain.providerAccountId == null) {
    return "unbound" satisfies DomainStatusGroup;
  }
  if (domain.healthStatus === "healthy" || domain.verificationScore >= 100) {
    return "verified" satisfies DomainStatusGroup;
  }
  return "pending" satisfies DomainStatusGroup;
}

function getDomainStatusMeta(group: DomainStatusGroup) {
  if (group === "verified") {
    return {
      label: "已验证",
      iconClassName: "text-emerald-500",
      cardClassName: "border-emerald-500/20 bg-emerald-500/5",
      description: "DNS 和验证状态已经基本就绪，可直接继续创建邮箱。",
    };
  }
  if (group === "pending") {
    return {
      label: "待验证",
      iconClassName: "text-rose-400",
      cardClassName: "border-rose-500/20 bg-rose-500/5",
      description: "已经绑定了 DNS 服务商，但仍需进入 DNS 配置完成校验。",
    };
  }
  return {
    label: "未绑定 DNS",
    iconClassName: "text-amber-500",
    cardClassName: "border-amber-500/20 bg-amber-500/5",
    description: "还没绑定 DNS 服务商，先完成绑定后再进入 Zone 工作区。",
  };
}

function isRootDomainInput(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\.+$/g, "");
  if (!normalized || normalized.includes("..")) {
    return false;
  }
  return normalized.split(".").length <= 2;
}

function normalizeRootDomainInput(value: string) {
  return value.trim().toLowerCase().replace(/\.+$/g, "");
}

function normalizeSubdomainPrefixes(value: string) {
  return Array.from(
    new Set(
      value
        .split(/\r?\n/)
        .map((item) => item.trim().toLowerCase().replace(/^\.+|\.+$/g, ""))
        .filter(Boolean),
    ),
  );
}

function isValidSubdomainPrefix(value: string) {
  return value
    .split(".")
    .every((segment) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(segment));
}

function DomainStatusIcon({
  verified,
  className,
}: {
  verified: boolean;
  className?: string;
}) {
  if (verified) {
    return <Check className={cn("size-4", className)} />;
  }
  return <CircleX className={cn("size-4", className)} />;
}

function getUserDomainDnsLink(domainId: number, providerId?: number | null) {
  const params = new URLSearchParams();
  params.set("domainId", String(domainId));
  if (providerId) {
    params.set("providerId", String(providerId));
  }
  return `/dashboard/dns?${params.toString()}`;
}

function formatVerificationTypeLabel(value: string) {
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    mx: "MX",
    inbound_mx: "收件 MX",
    spf: "SPF",
    dkim: "DKIM",
    dmarc: "DMARC",
    txt: "TXT",
    cname: "CNAME",
    a: "A",
    aaaa: "AAAA",
  };
  return labels[normalized] ?? value.replace(/_/g, " ").toUpperCase();
}

function formatVerificationStatusLabel(status: string) {
  if (status === "verified") {
    return "已通过";
  }
  if (status === "drifted") {
    return "记录漂移";
  }
  if (status === "missing") {
    return "记录缺失";
  }
  return "待处理";
}

function formatDnsRecord(record: {
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority: number;
}) {
  const segments = [record.type, record.name, record.value];
  if (record.priority > 0) {
    segments.push(`prio ${record.priority}`);
  }
  if (record.ttl > 0) {
    segments.push(`ttl ${record.ttl}`);
  }
  return segments.join(" · ");
}

function formatVerificationTimestamp(value?: string) {
  if (!value) {
    return "尚未检查";
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

function DomainVerificationDetails({
  result,
  dnsLink,
}: {
  result?: DomainVerificationResult;
  dnsLink: string;
}) {
  if (!result) {
    return null;
  }

  const pendingProfiles = result.profiles.filter((item) => item.status !== "verified");
  const latestCheckedAt = result.profiles
    .map((item) => item.lastCheckedAt)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);
  const propagationLabel = result.passed
    ? "传播已通过"
    : pendingProfiles.length && result.verifiedCount > 0
      ? "传播部分通过"
      : "传播未通过";

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-4",
        result.passed ? "border-emerald-500/25 bg-emerald-500/5" : "border-rose-500/20 bg-rose-500/5",
      )}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold">{result.passed ? "最近一次验证已通过" : "最近一次验证未通过"}</div>
            <WorkspaceBadge variant="outline">
              {result.verifiedCount} / {result.totalCount}
            </WorkspaceBadge>
            {result.zoneName ? <WorkspaceBadge variant="outline">Zone {result.zoneName}</WorkspaceBadge> : null}
          </div>
          <p className="text-sm text-muted-foreground">{result.summary}</p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to={dnsLink}>前往 DNS 配置</Link>
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">传播状态</div>
          <div className="mt-1 text-sm font-medium">{propagationLabel}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">待修复项</div>
          <div className="mt-1 text-sm font-medium">{pendingProfiles.length} 项</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-background/70 px-3 py-2.5">
          <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">最近检查</div>
          <div className="mt-1 text-sm font-medium">{formatVerificationTimestamp(latestCheckedAt)}</div>
        </div>
      </div>

      {!result.passed && pendingProfiles.length ? (
        <div className="mt-4 space-y-3">
          {pendingProfiles.map((profile) => (
            <div key={profile.verificationType} className="rounded-lg border border-border/60 bg-background/80 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <WorkspaceBadge variant="outline">{formatVerificationTypeLabel(profile.verificationType)}</WorkspaceBadge>
                <WorkspaceStatusBadge status={profile.status}>{formatVerificationStatusLabel(profile.status)}</WorkspaceStatusBadge>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{profile.summary}</p>
              {profile.repairRecords.length ? (
                <div className="mt-3 space-y-1.5">
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">建议修复记录</div>
                  {profile.repairRecords.slice(0, 3).map((record, index) => (
                    <div
                      key={`${profile.verificationType}-${record.type}-${record.name}-${index}`}
                      className="rounded-md border border-border/60 bg-card/70 px-3 py-2 text-sm break-all"
                    >
                      {formatDnsRecord(record)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UserDomainsPage() {
  const currentUserId = useAuthStore((state) => state.user?.userId);
  const userCacheScope = currentUserId === undefined ? undefined : String(currentUserId);
  const domainsCacheKey = getUserDomainsCacheKey(userCacheScope, "domains-cache");
  const uiCacheKey = getUserDomainsCacheKey(userCacheScope, "domains-ui");
  const persistedUI = readPersistedState(uiCacheKey, {
    expandedRootIds: {} as Record<number, boolean>,
    verificationResults: {} as Record<number, DomainVerificationResult>,
  });

  const queryClient = useQueryClient();
  const [isCreateRootDialogOpen, setCreateRootDialogOpen] = useState(false);
  const [isGenerateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [isBindProviderDialogOpen, setBindProviderDialogOpen] = useState(false);
  const [rootDomain, setRootDomain] = useState("");
  const [selectedBaseDomainId, setSelectedBaseDomainId] = useState<number | "">("");
  const [bindingDomain, setBindingDomain] = useState<Awaited<ReturnType<typeof fetchDomains>>[number] | null>(null);
  const [selectedProviderAccountId, setSelectedProviderAccountId] = useState<string>("");
  const [prefixInput, setPrefixInput] = useState("mx\nmx.edge\nrelay.cn.hk");
  const [expandedRootIds, setExpandedRootIds] = useState<Record<number, boolean>>(persistedUI.expandedRootIds);
  const [verificationResults, setVerificationResults] = useState<Record<number, DomainVerificationResult>>(
    persistedUI.verificationResults,
  );
  const [verifyingDomainId, setVerifyingDomainId] = useState<number | null>(null);
  const [creatingDomainWithVerification, setCreatingDomainWithVerification] = useState(false);
  const [generatingDomainsWithVerification, setGeneratingDomainsWithVerification] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [deleteDomainDialog, setDeleteDomainDialog] = useState<{
    id: number;
    domain: string;
    label: string;
  } | null>(null);
  const [withdrawDomainDialog, setWithdrawDomainDialog] = useState<{
    id: number;
    domain: string;
    label: string;
  } | null>(null);
  const { page: rootDomainsPage, pageSize, setPage: setRootDomainsPage, setPageSize } = useURLPagination({ defaultPage: 1, defaultPageSize: 20 });

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
  });

  const effectiveOwnedDomains = useMemo(
    () =>
      (domainsQuery.data ?? [])
        .map((item) => {
          const verifiedDomain = verificationResults[item.id]?.domain;
          return verifiedDomain ? { ...item, ...verifiedDomain } : item;
        })
        .filter((item) => item.ownerUserId !== undefined && item.ownerUserId === currentUserId),
    [currentUserId, domainsQuery.data, verificationResults],
  );

  const ownedDomains = useMemo(
    () => effectiveOwnedDomains,
    [effectiveOwnedDomains],
  );

  const rootDomains = useMemo(
    () => ownedDomains.filter((item) => item.kind === "root"),
    [ownedDomains],
  );

  const childDomainsByRoot = useMemo(() => {
    const map = new Map<string, typeof ownedDomains>();
    ownedDomains
      .filter((item) => item.kind !== "root")
      .forEach((item) => {
        const key = item.rootDomain;
        const current = map.get(key) ?? [];
        current.push(item);
        map.set(key, current);
      });
    return map;
  }, [ownedDomains]);

  const groupedRootDomains = useMemo(() => {
    const groups: Record<DomainStatusGroup, typeof rootDomains> = {
      unbound: [],
      pending: [],
      verified: [],
    };

    rootDomains.forEach((domain) => {
      groups[getDomainStatusGroup(domain)].push(domain);
    });

    return groups;
  }, [rootDomains]);
  const paginatedRootDomains = useMemo(
    () => paginateItems(rootDomains, rootDomainsPage, pageSize),
    [rootDomains, rootDomainsPage, pageSize],
  );
  const groupedPaginatedRootDomains = useMemo(() => {
    const groups: Record<DomainStatusGroup, typeof rootDomains> = {
      unbound: [],
      pending: [],
      verified: [],
    };

    paginatedRootDomains.items.forEach((domain) => {
      groups[getDomainStatusGroup(domain)].push(domain);
    });

    return groups;
  }, [paginatedRootDomains.items]);

  const domainSummary = useMemo(
    () => ({
      roots: rootDomains.length,
      children: ownedDomains.length - rootDomains.length,
      providers: providersQuery.data?.length ?? 0,
      verified: rootDomains.filter((item) => getDomainStatusGroup(item) === "verified").length,
      pending: rootDomains.filter((item) => getDomainStatusGroup(item) === "pending").length,
      unbound: rootDomains.filter((item) => getDomainStatusGroup(item) === "unbound").length,
    }),
    [ownedDomains.length, providersQuery.data?.length, rootDomains],
  );

  async function applyUserVerificationResult(result: DomainVerificationResult, announce = true) {
    setDomainError(null);
    if (announce) {
      setActionNotice(result.summary);
    }
    setVerificationResults((current) => ({ ...current, [result.domain.id]: result }));
    if (!result.passed) {
      const rootId =
        result.domain.kind === "root"
          ? result.domain.id
          : (domainsQuery.data ?? []).find((item) => item.kind === "root" && item.domain === result.domain.rootDomain)?.id;
      if (rootId) {
        setExpandedRootIds((current) => ({ ...current, [rootId]: true }));
      }
    }
    queryClient.setQueryData<Awaited<ReturnType<typeof fetchDomains>>>(["user-domains"], (current) =>
      (current ?? []).map((item) => (item.id === result.domain.id ? result.domain : item)),
    );
  }

  async function autoVerifyUserDomains(items: Awaited<ReturnType<typeof fetchDomains>>) {
    const candidates = items.filter((item) => item.providerAccountId != null);
    if (!candidates.length) {
      return [];
    }
    const results = await Promise.all(candidates.map((item) => verifyDomain(item.id)));
    for (const result of results) {
      await applyUserVerificationResult(result, false);
    }
    await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
    await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    return results;
  }

  function clearUserVerificationResults(domainIds: number[]) {
    if (!domainIds.length) {
      return;
    }
    setVerificationResults((current) => {
      let changed = false;
      const next = { ...current };
      for (const domainId of domainIds) {
        if (domainId in next) {
          delete next[domainId];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  const createDomainMutation = useMutation({
    mutationFn: createDomain,
    onSuccess: async (created) => {
      setCreatingDomainWithVerification(true);
      setRootDomain("");
      setDomainError(null);
      let notice = "根域名已添加。";
      try {
        clearUserVerificationResults([created.id]);
        const results = await autoVerifyUserDomains([created]);
        if (results.length === 1) {
          notice = `根域名已添加，${results[0].passed ? "DNS 验证通过" : "DNS 验证未通过" }。`;
        }
      } finally {
        setCreatingDomainWithVerification(false);
      }
      setActionNotice(notice);
      setCreateRootDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "添加根域名失败，请检查域名格式。"));
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: deleteDomain,
    onSuccess: async (_, domainId) => {
      setDomainError(null);
      setActionNotice("域名已删除。");
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchDomains>>>(["user-domains"], (current) =>
        (current ?? []).filter((item) => item.id !== domainId),
      );
      setExpandedRootIds((current) => {
        if (!(domainId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[domainId];
        return next;
      });
      setVerificationResults((current) => {
        if (!(domainId in current)) {
          return current;
        }
        const next = { ...current };
        delete next[domainId];
        return next;
      });
      if (selectedBaseDomainId === domainId) {
        setSelectedBaseDomainId("");
      }
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "删除域名失败，请先清理子域名。"));
    },
  });

  const generateMutation = useMutation({
    mutationFn: generateSubdomains,
    onSuccess: async (createdItems) => {
      setGeneratingDomainsWithVerification(true);
      setDomainError(null);
      let notice = "子域名已批量生成。";
      try {
        clearUserVerificationResults(createdItems.map((item) => item.id));
        const results = await autoVerifyUserDomains(createdItems);
        if (results.length) {
          const passedCount = results.filter((item) => item.passed).length;
          notice = `子域名已批量生成，已自动验证 ${results.length} 个，${passedCount} 个通过。`;
        }
      } finally {
        setGeneratingDomainsWithVerification(false);
      }
      setActionNotice(notice);
      setGenerateDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "批量生成子域名失败。"));
    },
  });
  const bindProviderMutation = useMutation({
    mutationFn: ({ domainId, providerAccountId }: { domainId: number; providerAccountId?: number }) =>
      updateDomainProviderBinding(domainId, providerAccountId),
    onSuccess: async (updated) => {
      setDomainError(null);
      setActionNotice(updated.providerAccountId ? "DNS 服务商已绑定。" : "DNS 服务商绑定已移除。");
      setBindProviderDialogOpen(false);
      setBindingDomain(null);
      setSelectedProviderAccountId("");
      setVerificationResults((current) => {
        if (!(updated.id in current)) {
          return current;
        }
        const next = { ...current };
        delete next[updated.id];
        return next;
      });
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchDomains>>>(["user-domains"], (current) =>
        (current ?? []).map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "绑定 DNS 服务商失败，请检查域名和 Provider 权限后重试。"));
    },
  });

  const publishMutation = useMutation({
    mutationFn: requestDomainPublicPool,
    onSuccess: async () => {
      setDomainError(null);
      setActionNotice("已提交公共池申请。");
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "加入公共池失败。"));
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: withdrawDomainPublicPool,
    onSuccess: async () => {
      setDomainError(null);
      setActionNotice("公共池状态已更新。");
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "更新公共池状态失败。"));
    },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: verifyDomain,
    onMutate: async (domainId) => {
      setVerifyingDomainId(domainId);
    },
    onSuccess: async (result) => {
      await applyUserVerificationResult(result);
      await queryClient.invalidateQueries({ queryKey: ["user-domains"], refetchType: "all" });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"], refetchType: "all" });
    },
    onError: (error) => {
      setDomainError(getAPIErrorMessage(error, "验证域名失败，请先检查 DNS 绑定和记录传播。"));
    },
    onSettled: () => {
      setVerifyingDomainId(null);
    },
  });

  useEffect(() => {
    writePersistedState(domainsCacheKey, domainsQuery.data ?? []);
  }, [domainsCacheKey, domainsQuery.data]);

  useEffect(() => {
    const activeIds = new Set((domainsQuery.data ?? []).map((item) => item.id));
    setExpandedRootIds((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => activeIds.has(Number(key))));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
    setVerificationResults((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => activeIds.has(Number(key))),
      ) as Record<number, DomainVerificationResult>;
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [domainsQuery.data]);

  useEffect(() => {
    writePersistedState(uiCacheKey, { expandedRootIds, verificationResults });
  }, [expandedRootIds, uiCacheKey, verificationResults]);

  async function refreshUserDomainData() {
    setActionNotice(null);
    await domainsQuery.refetch();
  }

  const providerOptions = (providersQuery.data ?? []).map((item) => ({
    value: String(item.id),
    label: item.displayName,
    keywords: [item.provider, item.authType, item.status],
  }));

  function openBindProviderDialog(domain: Awaited<ReturnType<typeof fetchDomains>>[number]) {
    setDomainError(null);
    setBindingDomain(domain);
    setSelectedProviderAccountId(domain.providerAccountId ? String(domain.providerAccountId) : "");
    setBindProviderDialogOpen(true);
  }

  function handleCreateRootDomain() {
    const normalizedDomain = normalizeRootDomainInput(rootDomain);
    const requiredError = validateRequiredText("根域名", normalizedDomain, { minLength: 3, maxLength: 253 });
    if (requiredError) {
      setDomainError(requiredError);
      return;
    }
    if (!isRootDomainInput(normalizedDomain)) {
      setDomainError("这里仅支持直接添加根域名，多级子域请通过“批量生成子域名”创建。");
      return;
    }
    setDomainError(null);
    createDomainMutation.mutate({
      domain: normalizedDomain,
      status: "active",
      visibility: "private",
      publicationStatus: "draft",
      verificationScore: 0,
      healthStatus: "unknown",
      weight: 100,
    });
  }

  function handleGenerateSubdomains() {
    const baseDomainError = validateSelection("根域名", String(selectedBaseDomainId), rootDomains.map((item) => String(item.id)));
    if (baseDomainError) {
      setDomainError(baseDomainError);
      return;
    }
    const prefixes = normalizeSubdomainPrefixes(prefixInput);
    if (!prefixes.length) {
      setDomainError("至少需要填写一个子域名前缀。");
      return;
    }
    const invalidPrefix = prefixes.find((item) => !isValidSubdomainPrefix(item));
    if (invalidPrefix) {
      setDomainError(`子域名前缀格式无效：${invalidPrefix}`);
      return;
    }
    setDomainError(null);
    generateMutation.mutate({
      baseDomainId: Number(selectedBaseDomainId),
      prefixes,
      status: "active",
      visibility: "private",
      publicationStatus: "draft",
      verificationScore: 0,
      healthStatus: "unknown",
      weight: 90,
    });
  }

  function handleSaveProviderBinding() {
    if (!bindingDomain) {
      setDomainError("当前没有可绑定的域名。");
      return;
    }
    const providerError = validateSelection("DNS 服务商", selectedProviderAccountId, providerOptions.map((item) => item.value));
    if (providerError) {
      setDomainError(providerError);
      return;
    }
    setDomainError(null);
    bindProviderMutation.mutate({
      domainId: bindingDomain.id,
      providerAccountId: Number(selectedProviderAccountId),
    });
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refreshUserDomainData()}>
              <RefreshCcw className={domainsQuery.isRefetching ? "size-4 animate-spin" : "size-4"} />
              刷新
            </Button>
            <Button onClick={() => setCreateRootDialogOpen(true)}>新增根域名</Button>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(true)}>
              新增子域名
            </Button>
          </div>
        }
        description="待验证域名、绑定状态和 DNS 配置入口都集中在这里；DNS 配置页只保留服务商、Zone、记录和变更工作区。"
        title="域名管理"
      >
        <div className="space-y-4">
          <AlertDialog
            open={deleteDomainDialog !== null}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteDomainDialog(null);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除域名？</AlertDialogTitle>
                <AlertDialogDescription>
                  {deleteDomainDialog
                    ? `确认删除${deleteDomainDialog.label} ${deleteDomainDialog.domain}？删除后该域名会从当前列表中移除。`
                    : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (!deleteDomainDialog) {
                      return;
                    }
                    deleteDomainMutation.mutate(deleteDomainDialog.id);
                    setDeleteDomainDialog(null);
                  }}
                >
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog
            open={withdrawDomainDialog !== null}
            onOpenChange={(open) => {
              if (!open) {
                setWithdrawDomainDialog(null);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{withdrawDomainDialog?.label ?? "确认操作"}</AlertDialogTitle>
                <AlertDialogDescription>
                  {withdrawDomainDialog
                    ? `确认对域名 ${withdrawDomainDialog.domain} 执行“${withdrawDomainDialog.label}”？此操作会立即变更该域名在公共池中的状态。`
                    : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (!withdrawDomainDialog) {
                      return;
                    }
                    withdrawMutation.mutate(withdrawDomainDialog.id);
                    setWithdrawDomainDialog(null);
                  }}
                >
                  确认继续
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
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

          <Dialog open={isCreateRootDialogOpen} onOpenChange={setCreateRootDialogOpen}>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>添加根域名</DialogTitle>
                <DialogDescription>这里只录入根域名资产；DNS 服务商绑定和记录配置请在“DNS 配置”页面完成。</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <WorkspaceField label="根域名">
                  <Input
                    value={rootDomain}
                    onChange={(event) => setRootDomain(event.target.value)}
                    placeholder="example.com"
                  />
                </WorkspaceField>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <Button
                  disabled={!rootDomain.trim() || createDomainMutation.isPending || creatingDomainWithVerification}
                  onClick={handleCreateRootDomain}
                >
                  {createDomainMutation.isPending || creatingDomainWithVerification ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      验证 DNS 中...
                    </>
                  ) : (
                    "添加根域名"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={isGenerateDialogOpen} onOpenChange={setGenerateDialogOpen}>
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
                    options={rootDomains.map((item) => ({
                      value: String(item.id),
                      label: item.domain,
                      keywords: [item.rootDomain],
                    }))}
                    placeholder="选择根域名"
                    searchPlaceholder="搜索根域名"
                    value={selectedBaseDomainId === "" ? undefined : String(selectedBaseDomainId)}
                    onValueChange={(value) => setSelectedBaseDomainId(value ? Number(value) : "")}
                  />
                </WorkspaceField>
                <WorkspaceField label="多级前缀">
                  <Textarea
                    rows={6}
                    value={prefixInput}
                    onChange={(event) => setPrefixInput(event.target.value)}
                    placeholder={"一行一个前缀，例如：\nmx\nmx.edge\nrelay.cn.hk"}
                  />
                </WorkspaceField>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <Button
                  disabled={selectedBaseDomainId === "" || generateMutation.isPending || generatingDomainsWithVerification}
                  onClick={handleGenerateSubdomains}
                >
                  {generateMutation.isPending || generatingDomainsWithVerification ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      验证 DNS 中...
                    </>
                  ) : (
                    "批量生成子域名"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isBindProviderDialogOpen}
            onOpenChange={(open) => {
              setBindProviderDialogOpen(open);
              if (!open) {
                setBindingDomain(null);
                setSelectedProviderAccountId("");
              }
            }}
          >
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>{bindingDomain?.providerAccountId ? "更换 DNS 服务商" : "绑定 DNS 服务商"}</DialogTitle>
                <DialogDescription>
                  {bindingDomain
                    ? `为 ${bindingDomain.domain} 选择一个已添加的 DNS 服务商账号，后续即可直接进入对应 Zone 工作区。`
                    : "选择一个 DNS 服务商账号。"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <WorkspaceField label="当前域名">
                  <Input readOnly value={bindingDomain?.domain ?? ""} />
                </WorkspaceField>
                {bindingDomain ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">当前状态</div>
                      <div className="mt-2 flex items-center gap-2 text-sm font-medium">
                        <DomainStatusIcon
                          className={getDomainStatusMeta(getDomainStatusGroup(bindingDomain)).iconClassName}
                          verified={getDomainStatusGroup(bindingDomain) === "verified"}
                        />
                        {getDomainStatusMeta(getDomainStatusGroup(bindingDomain)).label}
                      </div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">当前 Provider</div>
                      <div className="mt-2 truncate text-sm font-medium">{bindingDomain.providerDisplayName ?? "未绑定"}</div>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-background/50 px-3 py-3">
                      <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">建议动作</div>
                      <div className="mt-2 text-sm text-muted-foreground">{getDomainStatusMeta(getDomainStatusGroup(bindingDomain)).description}</div>
                    </div>
                  </div>
                ) : null}
                <WorkspaceField label="DNS 服务商">
                  <OptionCombobox
                    ariaLabel="选择 DNS 服务商"
                    emptyLabel="还没有可用的 DNS 服务商"
                    options={providerOptions}
                    placeholder="选择 DNS 服务商"
                    searchPlaceholder="搜索 DNS 服务商"
                    value={selectedProviderAccountId || undefined}
                    onValueChange={(value) => setSelectedProviderAccountId(value || "")}
                  />
                </WorkspaceField>
              </div>
              <DialogFooter>
                {bindingDomain?.providerAccountId ? (
                  <Button
                    disabled={bindProviderMutation.isPending}
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      if (!bindingDomain) return;
                      bindProviderMutation.mutate({ domainId: bindingDomain.id, providerAccountId: undefined });
                    }}
                  >
                    解绑
                  </Button>
                ) : null}
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <Button
                  disabled={!bindingDomain || !selectedProviderAccountId || bindProviderMutation.isPending}
                  onClick={handleSaveProviderBinding}
                >
                  {bindProviderMutation.isPending ? "保存中..." : "保存绑定"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <div className="grid gap-3 lg:grid-cols-6">
            <Card className="border-border/60 bg-card/85 shadow-none lg:col-span-2">
              <CardContent className="space-y-2 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">资产概览</div>
                <div className="text-2xl font-semibold">{domainSummary.roots}</div>
                <div className="text-sm text-muted-foreground">根域名 {domainSummary.roots} 个 · 子域名 {domainSummary.children} 个</div>
              </CardContent>
            </Card>
            <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-none">
              <CardContent className="space-y-2 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">已验证</div>
                <div className="text-2xl font-semibold">{domainSummary.verified}</div>
                <div className="text-sm text-muted-foreground">可直接创建邮箱</div>
              </CardContent>
            </Card>
            <Card className="border-rose-500/20 bg-rose-500/5 shadow-none">
              <CardContent className="space-y-2 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">待验证</div>
                <div className="text-2xl font-semibold">{domainSummary.pending}</div>
                <div className="text-sm text-muted-foreground">需要继续校验记录</div>
              </CardContent>
            </Card>
            <Card className="border-amber-500/20 bg-amber-500/5 shadow-none">
              <CardContent className="space-y-2 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">未绑定 DNS</div>
                <div className="text-2xl font-semibold">{domainSummary.unbound}</div>
                <div className="text-sm text-muted-foreground">需要先绑定服务商</div>
              </CardContent>
            </Card>
            <Card className="border-border/60 bg-card/85 shadow-none">
              <CardContent className="space-y-2 py-4">
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Provider</div>
                <div className="text-2xl font-semibold">{domainSummary.providers}</div>
                <div className="text-sm text-muted-foreground">可用 DNS 服务商账号</div>
              </CardContent>
            </Card>
          </div>

          {rootDomains.length ? (
            (["unbound", "pending", "verified"] as DomainStatusGroup[]).map((group) => {
              const sectionRoots = groupedPaginatedRootDomains[group];
              if (!sectionRoots.length) {
                return null;
              }

              const groupMeta = getDomainStatusMeta(group);

              return (
                <div key={group} className="space-y-3">
                  <Card className={cn("shadow-none", groupMeta.cardClassName)}>
                    <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <DomainStatusIcon className={groupMeta.iconClassName} verified={group === "verified"} />
                          {groupMeta.label}
                        </div>
                        <p className="text-xs text-muted-foreground">{groupMeta.description}</p>
                      </div>
                      <WorkspaceBadge variant="outline">
                        {sectionRoots.length} / {groupedRootDomains[group].length} 个根域
                      </WorkspaceBadge>
                    </CardContent>
                  </Card>

                  {sectionRoots.map((root) => {
              const children = childDomainsByRoot.get(root.domain) ?? [];
              const expanded = expandedRootIds[root.id] ?? false;
              const rootStatusTone = getDomainStatusGroup(root);
              const rootVerificationResult = verificationResults[root.id];

              return (
                <Card key={root.id} className="border-border/60 bg-card/85 shadow-none">
                  <CardContent className="space-y-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-left text-sm font-medium"
                            onClick={() =>
                              setExpandedRootIds((current) => ({ ...current, [root.id]: !expanded }))
                            }
                          >
                            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                            <Globe className="size-4 text-muted-foreground" />
                            {root.domain}
                          </button>
                          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                            <DomainStatusIcon
                              className={
                                rootStatusTone === "verified"
                                  ? "text-emerald-500"
                                  : rootStatusTone === "unbound"
                                    ? "text-amber-500"
                                    : "text-rose-400"
                              }
                              verified={rootStatusTone === "verified"}
                            />
                            {rootStatusTone === "verified"
                              ? "已验证"
                              : rootStatusTone === "unbound"
                                ? "未绑定 DNS"
                                : "待验证"}
                          </span>
                          <WorkspaceStatusBadge status={root.status}>{root.status}</WorkspaceStatusBadge>
                          <WorkspaceBadge variant="outline">{root.visibility}</WorkspaceBadge>
                          <WorkspaceStatusBadge status={root.publicationStatus}>{root.publicationStatus}</WorkspaceStatusBadge>
                          <WorkspaceBadge variant="outline">验证分 {root.verificationScore}</WorkspaceBadge>
                        </div>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>健康：{root.healthStatus}</span>
                          <span>权重：{root.weight}</span>
                          <span>子域名：{children.length}</span>
                          <span>DNS：{root.providerDisplayName || "前往 DNS 配置绑定"}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openBindProviderDialog(root)}>
                          {root.providerAccountId ? "更换服务商" : "绑定服务商"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={verifyDomainMutation.isPending && verifyingDomainId === root.id}
                          onClick={() => verifyDomainMutation.mutate(root.id)}
                        >
                          {verifyDomainMutation.isPending && verifyingDomainId === root.id ? "验证中..." : "验证"}
                        </Button>
                        <Button asChild size="sm" variant="outline">
                          <Link to={getUserDomainDnsLink(root.id, root.providerAccountId)}>
                            {root.providerAccountId ? "配置 DNS" : "绑定 DNS"}
                          </Link>
                        </Button>
                        <Button asChild size="sm" variant="secondary">
                          <Link to={`/dashboard/mailboxes?domainId=${root.id}`}>创建邮箱</Link>
                        </Button>
                        {(root.visibility === "private" || root.publicationStatus === "rejected") ? (
                          <Button size="sm" variant="outline" onClick={() => publishMutation.mutate(root.id)}>
                            申请加入公共池
                          </Button>
                        ) : null}
                        {root.visibility === "public_pool" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              setWithdrawDomainDialog({
                                id: root.id,
                                domain: root.domain,
                                label:
                                  root.publicationStatus === "pending_review"
                                    ? "撤回申请"
                                    : "下线公共池",
                              })
                            }
                          >
                            {root.publicationStatus === "pending_review" ? "撤回申请" : "下线公共池"}
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deleteDomainMutation.isPending}
                          onClick={() => {
                            setActionNotice(null);
                            setDeleteDomainDialog({
                              id: root.id,
                              domain: root.domain,
                              label: "根域名",
                            });
                          }}
                        >
                          <Trash2 className="size-4" />删除
                        </Button>
                      </div>
                    </div>

                    {expanded ? (
                      <div className="space-y-3 rounded-xl border border-border/60 bg-background/40 p-3">
                        <DomainVerificationDetails
                          dnsLink={getUserDomainDnsLink(root.id, root.providerAccountId)}
                          result={rootVerificationResult}
                        />
                        {children.length ? (
                        <>
                          <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                            <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                              <div className="space-y-3 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">DNS 服务商</span>
                                  <span className="truncate font-medium">{root.providerDisplayName ?? "未绑定"}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">公共池状态</span>
                                  <span className="font-medium">{root.publicationStatus}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">可见性</span>
                                  <span className="font-medium">{root.visibility}</span>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-muted-foreground">创建邮箱</span>
                                  <span className="font-medium">{rootStatusTone === "verified" ? "可直接创建" : "建议先完成 DNS"}</span>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-xl border border-border/60 bg-card/60 p-4">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="text-sm font-semibold">子域名资产</div>
                                  <p className="text-xs text-muted-foreground">这里集中展示当前根域下的多级子域名和它们各自的 DNS / 验证状态。</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <WorkspaceBadge variant="outline">{children.length} 个子域名</WorkspaceBadge>
                                  <WorkspaceBadge variant="outline">验证分 {root.verificationScore}</WorkspaceBadge>
                                </div>
                              </div>
                            </div>
                          </div>

                          {children.map((child) => {
                            const childStatusTone =
                              child.providerAccountId == null
                                ? "unbound"
                                : child.healthStatus === "healthy" || child.verificationScore >= 100
                                  ? "verified"
                                  : "pending";
                            const childVerificationResult = verificationResults[child.id];

                            return (
                              <div key={child.id} className="space-y-3 rounded-lg border border-border/60 bg-background px-3 py-3">
                                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                  <div>
                                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                      <span>{child.domain}</span>
                                      <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                                        <DomainStatusIcon
                                          className={
                                            childStatusTone === "verified"
                                              ? "size-3.5 text-emerald-500"
                                              : childStatusTone === "unbound"
                                                ? "size-3.5 text-amber-500"
                                                : "size-3.5 text-rose-400"
                                          }
                                          verified={childStatusTone === "verified"}
                                        />
                                        {childStatusTone === "verified"
                                          ? "已验证"
                                          : childStatusTone === "unbound"
                                            ? "未绑定 DNS"
                                            : "待验证"}
                                      </span>
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                      <span>层级 {child.level}</span>
                                      <span>根域 {child.rootDomain}</span>
                                      <span>DNS {child.providerDisplayName || "未绑定"}</span>
                                      <span>验证分 {child.verificationScore}</span>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button size="sm" variant="ghost" onClick={() => openBindProviderDialog(child)}>
                                      {child.providerAccountId ? "更换服务商" : "绑定服务商"}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={verifyDomainMutation.isPending && verifyingDomainId === child.id}
                                      onClick={() => verifyDomainMutation.mutate(child.id)}
                                    >
                                      {verifyDomainMutation.isPending && verifyingDomainId === child.id ? "验证中..." : "验证"}
                                    </Button>
                                    <Button asChild size="sm" variant="outline">
                                      <Link to={getUserDomainDnsLink(child.id, child.providerAccountId)}>
                                        {child.providerAccountId ? "配置 DNS" : "绑定 DNS"}
                                      </Link>
                                    </Button>
                                    <Button asChild size="sm" variant="secondary">
                                      <Link to={`/dashboard/mailboxes?domainId=${child.id}`}>创建邮箱</Link>
                                    </Button>
                                    <WorkspaceStatusBadge status={child.publicationStatus}>{child.publicationStatus}</WorkspaceStatusBadge>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={deleteDomainMutation.isPending}
                                      onClick={() => {
                                        setActionNotice(null);
                                        setDeleteDomainDialog({
                                          id: child.id,
                                          domain: child.domain,
                                          label: "子域名",
                                        });
                                      }}
                                    >
                                      <Trash2 className="size-4" />删除
                                    </Button>
                                  </div>
                                </div>
                                <DomainVerificationDetails
                                  dnsLink={getUserDomainDnsLink(child.id, child.providerAccountId)}
                                  result={childVerificationResult}
                                />
                              </div>
                            );
                          })}
                        </>
                        ) : (
                          <WorkspaceEmpty
                            title="还没有子域名"
                            description="点击上方“新增子域名”即可基于这个根域名批量生成。"
                          />
                        )}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
                </div>
              );
            })
          ) : (
            <WorkspaceEmpty
              title="暂无私有根域名"
              description="添加一个根域名后，就能继续批量生成多级子域名；Provider 与 DNS 配置请前往 DNS 配置页处理。"
            />
          )}
          <PaginationControls
            itemLabel="根域名"
            onPageChange={setRootDomainsPage}
            onPageSizeChange={setPageSize}
            page={paginatedRootDomains.page}
            pageSize={pageSize}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            showPageSizeSelector
            total={paginatedRootDomains.total}
            totalPages={paginatedRootDomains.totalPages}
          />
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
