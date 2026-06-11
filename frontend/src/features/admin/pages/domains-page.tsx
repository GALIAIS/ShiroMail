import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Check, ChevronDown, ChevronUp, CircleX, Globe, LoaderCircle, Plus, RefreshCcw } from "lucide-react";
import { useURLPagination } from "@/hooks/use-url-pagination";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NoticeBanner } from "@/components/ui/notice-banner";
import { Label } from "@/components/ui/label";
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
import { paginateItems } from "@/lib/pagination";
import { readPersistedState, writePersistedState } from "@/lib/persisted-state";
import { cn } from "@/lib/utils";
import {
  deleteAdminDomain,
  fetchAdminDomainProviders,
  fetchAdminDomains,
  generateAdminSubdomains,
  reviewAdminDomainPublication,
  upsertAdminDomain,
  verifyAdminDomain,
} from "../api";
import type { DomainOption, DomainVerificationResult } from "../../user/api";

type DomainGuideRecord = {
  key: string;
  type: string;
  name: string;
  value: string;
  status: string;
  verified: boolean;
};

const ADMIN_DOMAINS_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50];
const ADMIN_DOMAINS_CACHE_KEY = "shiro-email.admin-domains.cache";
const ADMIN_DOMAINS_UI_CACHE_KEY = "shiro-email.admin-domains.ui";
const PERSISTED_QUERY_STALE_TIME = 60_000;

function getAdminDomainDnsLink(domainId: number, providerId?: number | null) {
  const params = new URLSearchParams();
  params.set("domainId", String(domainId));
  if (providerId) {
    params.set("providerId", String(providerId));
  }
  return `/admin/dns?${params.toString()}`;
}

function getAdminDomainStatus(domain: {
  providerAccountId?: number | null;
  publicationStatus: string;
  healthStatus: string;
  verificationScore: number;
}) {
  if (domain.publicationStatus === "pending_review") {
    return "review";
  }
  if (domain.providerAccountId == null) {
    return "unbound";
  }
  if (domain.healthStatus === "healthy" || domain.verificationScore >= 100) {
    return "verified";
  }
  return "pending";
}

function getAdminDomainStatusMeta(status: ReturnType<typeof getAdminDomainStatus>) {
  if (status === "review") {
    return {
      label: "待审核",
      iconClassName: "text-sky-500",
      cardClassName: "border-sky-500/20 bg-sky-500/5",
      description: "这些域名正在等待管理员决定是否进入公共域名池。",
    };
  }
  if (status === "unbound") {
    return {
      label: "未绑定 DNS",
      iconClassName: "text-amber-500",
      cardClassName: "border-amber-500/20 bg-amber-500/5",
      description: "这些域名还没有 Provider 绑定，先补绑定再进入 DNS 工作区。",
    };
  }
  if (status === "verified") {
    return {
      label: "已验证",
      iconClassName: "text-emerald-500",
      cardClassName: "border-emerald-500/20 bg-emerald-500/5",
      description: "这些域名已经处于可稳定使用状态。",
    };
  }
  return {
    label: "待验证",
    iconClassName: "text-rose-400",
    cardClassName: "border-rose-500/20 bg-rose-500/5",
    description: "这些域名已绑定 Provider，但还需要继续核对与修复记录。",
  };
}

function isRootDomainInput(value: string) {
  const normalized = value.trim().toLowerCase().replace(/\.+$/g, "");
  if (!normalized || normalized.includes("..")) {
    return false;
  }
  return normalized.split(".").length <= 2;
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

function buildRecommendedDomainRecords(domain: DomainOption): DomainGuideRecord[] {
  const rootName = domain.rootDomain || domain.domain;
  return [
    {
      key: `${domain.id}-mx`,
      type: "MX",
      name: domain.domain,
      value: "mx.shiro.email (priority 10)",
      status: "待配置",
      verified: false,
    },
    {
      key: `${domain.id}-spf`,
      type: "TXT",
      name: domain.domain,
      value: "v=spf1 include:spf.shiro.email ~all",
      status: "待配置",
      verified: false,
    },
    {
      key: `${domain.id}-dmarc`,
      type: "TXT",
      name: `_dmarc.${rootName}`,
      value: "v=DMARC1; p=quarantine; rua=mailto:dmarc@shiro.email",
      status: "待配置",
      verified: false,
    },
  ];
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

export function AdminDomainsPage() {
  const queryClient = useQueryClient();
  const persistedUI = readPersistedState(ADMIN_DOMAINS_UI_CACHE_KEY, {
    domainCardExpandedState: {} as Record<number, boolean>,
    verificationResults: {} as Record<number, DomainVerificationResult>,
  });
  const emptyDomainDraft = {
    domain: "",
    status: "active",
    visibility: "private",
    publicationStatus: "draft",
    healthStatus: "unknown",
    providerAccountId: "",
    isDefault: false,
    weight: 100,
  };

  const [domainMutationError, setDomainMutationError] = useState<string | null>(null);
  const [subdomainMutationError, setSubdomainMutationError] = useState<string | null>(null);
  const [domainDeleteError, setDomainDeleteError] = useState<string | null>(null);
  const [domainActionNotice, setDomainActionNotice] = useState<string | null>(null);
  const [deleteDomainDialog, setDeleteDomainDialog] = useState<{
    id: number;
    domain: string;
  } | null>(null);
  const [reviewRejectDialog, setReviewRejectDialog] = useState<{
    id: number;
    domain: string;
  } | null>(null);
  const [isCreateDomainDialogOpen, setCreateDomainDialogOpen] = useState(false);
  const [editingDomainId, setEditingDomainId] = useState<number | null>(null);
  const [isGenerateSubdomainDialogOpen, setGenerateSubdomainDialogOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDomainDraft);
  const [selectedBaseDomainId, setSelectedBaseDomainId] = useState<number | "">("");
  const [prefixInput, setPrefixInput] = useState("mx\nmx.edge\nrelay.cn.hk");
  const [domainCardExpandedState, setDomainCardExpandedState] = useState<Record<number, boolean>>(
    persistedUI.domainCardExpandedState,
  );
  const [verificationResults, setVerificationResults] = useState<Record<number, DomainVerificationResult>>(
    persistedUI.verificationResults,
  );
  const [verifyingDomainId, setVerifyingDomainId] = useState<number | null>(null);
  const [creatingDomainWithVerification, setCreatingDomainWithVerification] = useState(false);
  const [generatingDomainsWithVerification, setGeneratingDomainsWithVerification] = useState(false);
  const { page: domainsPage, pageSize: domainsPageSize, setPage: setDomainsPage, setPageSize: setDomainsPageSize } = useURLPagination({
    defaultPage: 1,
    defaultPageSize: ADMIN_DOMAINS_PAGE_SIZE,
  });
  const isEditingDomain = editingDomainId !== null;

  const domainsQuery = useQuery({
    queryKey: ["admin-domains"],
    queryFn: fetchAdminDomains,
    staleTime: PERSISTED_QUERY_STALE_TIME,
    placeholderData: () => readPersistedState<DomainOption[]>(ADMIN_DOMAINS_CACHE_KEY, []),
  });
  const providersQuery = useQuery({
    queryKey: ["admin-domain-providers"],
    queryFn: fetchAdminDomainProviders,
    staleTime: PERSISTED_QUERY_STALE_TIME,
  });

  const effectiveDomains = useMemo(
    () =>
      (domainsQuery.data ?? []).map((item) => {
        const verifiedDomain = verificationResults[item.id]?.domain;
        return verifiedDomain ? { ...item, ...verifiedDomain } : item;
      }),
    [domainsQuery.data, verificationResults],
  );

  const rootDomains = useMemo(
    () => effectiveDomains.filter((item) => item.kind === "root"),
    [effectiveDomains],
  );

  const domainSummary = useMemo(
    () => ({
      total: effectiveDomains.length,
      root: rootDomains.length,
      review: effectiveDomains.filter((item) => getAdminDomainStatus(item) === "review").length,
      unbound: effectiveDomains.filter((item) => getAdminDomainStatus(item) === "unbound").length,
      pending: effectiveDomains.filter((item) => getAdminDomainStatus(item) === "pending").length,
      verified: effectiveDomains.filter((item) => getAdminDomainStatus(item) === "verified").length,
    }),
    [effectiveDomains, rootDomains.length],
  );

  const paginatedDomains = useMemo(
    () => paginateItems(effectiveDomains, domainsPage, domainsPageSize),
    [domainsPage, domainsPageSize, effectiveDomains],
  );

  async function applyAdminVerificationResult(result: DomainVerificationResult, announce = true) {
    setDomainDeleteError(null);
    if (announce) {
      setDomainActionNotice(result.summary);
    }
    setVerificationResults((current) => ({ ...current, [result.domain.id]: result }));
    if (!result.passed) {
      setDomainCardExpandedState((current) => ({ ...current, [result.domain.id]: true }));
    }
    queryClient.setQueryData<Awaited<ReturnType<typeof fetchAdminDomains>>>(["admin-domains"], (current) =>
      (current ?? []).map((item) => (item.id === result.domain.id ? result.domain : item)),
    );
  }

  async function autoVerifyAdminDomains(items: DomainOption[]) {
    const candidates = items.filter((item) => item.providerAccountId != null);
    if (!candidates.length) {
      return [];
    }
    const results = await Promise.all(candidates.map((item) => verifyAdminDomain(item.id)));
    for (const result of results) {
      await applyAdminVerificationResult(result, false);
    }
    await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
    await queryClient.invalidateQueries({ queryKey: ["user-domains"] });
    await queryClient.invalidateQueries({ queryKey: ["user-dashboard"] });
    return results;
  }

  function clearAdminVerificationResults(domainIds: number[]) {
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

  const groupedPaginatedDomains = useMemo(() => {
    const groups: Record<ReturnType<typeof getAdminDomainStatus>, DomainOption[]> = {
      review: [],
      unbound: [],
      pending: [],
      verified: [],
    };

    paginatedDomains.items.forEach((domain) => {
      groups[getAdminDomainStatus(domain)].push(domain);
    });

    return groups;
  }, [paginatedDomains.items]);

  useEffect(() => {
    writePersistedState(ADMIN_DOMAINS_CACHE_KEY, domainsQuery.data ?? []);
  }, [domainsQuery.data]);

  useEffect(() => {
    const activeIds = new Set((domainsQuery.data ?? []).map((item) => item.id));
    setDomainCardExpandedState((current) => {
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
    writePersistedState(ADMIN_DOMAINS_UI_CACHE_KEY, {
      domainCardExpandedState,
      verificationResults,
    });
  }, [domainCardExpandedState, verificationResults]);

  async function refreshAdminDomainData() {
    setDomainActionNotice(null);
    await domainsQuery.refetch();
  }

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
  const providerOptions = (providersQuery.data ?? []).map((item) => ({
    value: String(item.id),
    label: item.displayName,
    keywords: [item.provider, item.authType, item.status],
  }));

  const upsertMutation = useMutation({
    mutationFn: upsertAdminDomain,
    onSuccess: async (created) => {
      setCreatingDomainWithVerification(true);
      setDomainMutationError(null);
      setDomainDeleteError(null);
      let notice = isEditingDomain ? "域名配置已更新。" : "域名已添加。";
      try {
        clearAdminVerificationResults([created.id]);
        const results = await autoVerifyAdminDomains([created]);
        if (results.length === 1) {
          notice = `${isEditingDomain ? "域名配置已更新" : "域名已添加"}，${results[0].passed ? "DNS 验证通过" : "DNS 验证未通过"}。`;
        }
      } finally {
        setCreatingDomainWithVerification(false);
      }
      setDomainActionNotice(notice);
      setDraft(emptyDomainDraft);
      setEditingDomainId(null);
      setCreateDomainDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (error) => {
      setDomainMutationError(getAPIErrorMessage(error, "保存域名失败，请检查配置后重试。"));
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: deleteAdminDomain,
    onSuccess: async (_, domainId) => {
      setDomainDeleteError(null);
      setDomainActionNotice("域名已删除。");
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchAdminDomains>>>(["admin-domains"], (current) =>
        (current ?? []).filter((item) => item.id !== domainId),
      );
      setDomainCardExpandedState((current) => {
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
      await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (error) => {
      setDomainDeleteError(getAPIErrorMessage(error, "删除域名失败，请先清理子域名或邮箱实例。"));
    },
  });

  const generateMutation = useMutation({
    mutationFn: generateAdminSubdomains,
    onSuccess: async (createdItems) => {
      setGeneratingDomainsWithVerification(true);
      setSubdomainMutationError(null);
      setDomainDeleteError(null);
      let notice = "子域名已批量生成。";
      try {
        clearAdminVerificationResults(createdItems.map((item) => item.id));
        const results = await autoVerifyAdminDomains(createdItems);
        if (results.length) {
          const passedCount = results.filter((item) => item.passed).length;
          notice = `子域名已批量生成，已自动验证 ${results.length} 个，${passedCount} 个通过。`;
        }
      } finally {
        setGeneratingDomainsWithVerification(false);
      }
      setDomainActionNotice(notice);
      setGenerateSubdomainDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (error) => {
      setSubdomainMutationError(getAPIErrorMessage(error, "批量生成子域名失败，请稍后重试。"));
    },
  });

  const reviewPublicationMutation = useMutation({
    mutationFn: ({ domainId, decision }: { domainId: number; decision: "approve" | "reject" }) =>
      reviewAdminDomainPublication(domainId, decision),
    onSuccess: async (_, variables) => {
      setDomainDeleteError(null);
      setDomainActionNotice(
        variables.decision === "approve" ? "域名已批准进入公共域名池。" : "域名已拒绝发布。",
      );
      await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["user-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"] });
    },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: verifyAdminDomain,
    onMutate: async (domainId) => {
      setVerifyingDomainId(domainId);
    },
    onSuccess: async (result) => {
      await applyAdminVerificationResult(result);
      await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["user-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["user-dashboard"] });
    },
    onError: (error) => {
      setDomainDeleteError(getAPIErrorMessage(error, "验证域名失败，请先检查 DNS 绑定和记录传播。"));
    },
    onSettled: () => {
      setVerifyingDomainId(null);
    },
  });

  function openCreateDomainDialog() {
    setEditingDomainId(null);
    setDomainMutationError(null);
    setDomainActionNotice(null);
    setDraft(emptyDomainDraft);
    setCreateDomainDialogOpen(true);
  }

  function openEditDomainDialog(domain: DomainOption) {
    setEditingDomainId(domain.id);
    setDomainMutationError(null);
    setDomainActionNotice(null);
    setDraft({
      domain: domain.domain,
      status: domain.status,
      visibility: domain.visibility,
      publicationStatus: domain.publicationStatus,
      healthStatus: domain.healthStatus,
      providerAccountId: domain.providerAccountId ? String(domain.providerAccountId) : "",
      isDefault: domain.isDefault,
      weight: domain.weight,
    });
    setCreateDomainDialogOpen(true);
  }

  function isDomainCardExpanded(domain: DomainOption) {
    if (domainCardExpandedState[domain.id] !== undefined) {
      return domainCardExpandedState[domain.id];
    }
    return false;
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void refreshAdminDomainData()}>
              <RefreshCcw className={domainsQuery.isRefetching ? "size-4 animate-spin" : "size-4"} />
              刷新
            </Button>
            <Button onClick={openCreateDomainDialog}>
              <Plus className="size-4" />
              添加域名
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setDomainActionNotice(null);
                setGenerateSubdomainDialogOpen(true);
              }}
            >
              <Plus className="size-4" />
              新增子域名
            </Button>
          </div>
        }
        description="待验证域名、验证入口和域名级 DNS 引导都集中在这里；DNS 配置页只保留服务商、Zone、Records、Verification 和变更工作区。"
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
                    ? `确认删除域名 ${deleteDomainDialog.domain}？删除后该域名将从当前列表中移除。`
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
            open={reviewRejectDialog !== null}
            onOpenChange={(open) => {
              if (!open) {
                setReviewRejectDialog(null);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>拒绝域名发布？</AlertDialogTitle>
                <AlertDialogDescription>
                  {reviewRejectDialog
                    ? `确认拒绝域名 ${reviewRejectDialog.domain} 进入公共域名池？该域名会退出当前审核流。`
                    : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (!reviewRejectDialog) {
                      return;
                    }
                    reviewPublicationMutation.mutate({
                      domainId: reviewRejectDialog.id,
                      decision: "reject",
                    });
                    setReviewRejectDialog(null);
                  }}
                >
                  确认拒绝
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Dialog
            open={isCreateDomainDialogOpen}
            onOpenChange={(open) => {
              setCreateDomainDialogOpen(open);
              if (open) {
                setDomainMutationError(null);
              } else {
                setEditingDomainId(null);
                setDraft(emptyDomainDraft);
              }
            }}
          >
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{isEditingDomain ? "编辑域名" : "添加域名"}</DialogTitle>
                <DialogDescription>
                  {isEditingDomain
                    ? "这里只维护域名资产本身；Provider 绑定、Zone 与 Record 操作都在 DNS 配置页完成。"
                    : "添加自定义域名后，需要前往 DNS 配置页完成 Provider 绑定和记录校验。"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <WorkspaceField label="名称">
                  <Input
                    className="h-12 rounded-xl text-base"
                    value={draft.domain}
                    onChange={(event) => setDraft((current) => ({ ...current, domain: event.target.value }))}
                    placeholder="example.com"
                  />
                </WorkspaceField>

                <div className="grid gap-4 md:grid-cols-2">
                  <WorkspaceField label="状态">
                    <OptionCombobox
                      ariaLabel="域名状态"
                      emptyLabel="没有匹配的状态"
                      options={statusOptions}
                      placeholder="选择状态"
                      searchPlaceholder="搜索状态"
                      value={draft.status}
                      onValueChange={(value) => setDraft((current) => ({ ...current, status: value || "active" }))}
                    />
                  </WorkspaceField>

                  <WorkspaceField label="可见性">
                    <OptionCombobox
                      ariaLabel="域名可见性"
                      emptyLabel="没有匹配的可见性"
                      options={visibilityOptions}
                      placeholder="选择可见性"
                      searchPlaceholder="搜索可见性"
                      value={draft.visibility}
                      onValueChange={(value) => setDraft((current) => ({ ...current, visibility: value || "private" }))}
                    />
                  </WorkspaceField>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <WorkspaceField label="发布状态">
                    <OptionCombobox
                      ariaLabel="域名发布状态"
                      emptyLabel="没有匹配的发布状态"
                      options={publicationOptions}
                      placeholder="选择发布状态"
                      searchPlaceholder="搜索发布状态"
                      value={draft.publicationStatus}
                      onValueChange={(value) =>
                        setDraft((current) => ({ ...current, publicationStatus: value || "draft" }))
                      }
                    />
                  </WorkspaceField>

                  <WorkspaceField label="健康状态">
                    <OptionCombobox
                      ariaLabel="域名健康状态"
                      emptyLabel="没有匹配的健康状态"
                      options={[
                        { value: "healthy", label: "healthy" },
                        { value: "unknown", label: "unknown" },
                        { value: "degraded", label: "degraded" },
                      ]}
                      placeholder="选择健康状态"
                      searchPlaceholder="搜索健康状态"
                      value={draft.healthStatus}
                      onValueChange={(value) => setDraft((current) => ({ ...current, healthStatus: value || "unknown" }))}
                    />
                  </WorkspaceField>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <WorkspaceField label="DNS 服务商">
                    <OptionCombobox
                      ariaLabel="DNS 服务商"
                      emptyLabel="还没有可用服务商"
                      options={providerOptions}
                      placeholder="选择 DNS 服务商"
                      searchPlaceholder="搜索 DNS 服务商"
                      value={draft.providerAccountId || undefined}
                      onValueChange={(value) =>
                        setDraft((current) => ({ ...current, providerAccountId: value || "" }))
                      }
                    />
                  </WorkspaceField>
                  <WorkspaceField label="权重">
                    <Input
                      className="h-9"
                      min={0}
                      type="number"
                      value={draft.weight}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, weight: Number(event.target.value) }))
                      }
                    />
                  </WorkspaceField>
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="admin-domain-default"
                    checked={draft.isDefault}
                    onCheckedChange={(checked) =>
                      setDraft((current) => ({ ...current, isDefault: checked === true }))
                    }
                  />
                  <Label className="text-sm" htmlFor="admin-domain-default">
                    设为默认
                  </Label>
                </div>
              </div>

              <DialogFooter>
                {domainMutationError ? (
                  <NoticeBanner autoHideMs={5000} className="mr-auto" onDismiss={() => setDomainMutationError(null)} variant="error">
                    {domainMutationError}
                  </NoticeBanner>
                ) : null}
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <Button
                  disabled={upsertMutation.isPending || creatingDomainWithVerification || draft.domain.trim() === ""}
                  onClick={() => {
                    if (!isEditingDomain && !isRootDomainInput(draft.domain)) {
                      setDomainMutationError("这里仅支持直接添加根域名，多级子域请通过“批量生成子域名”创建。");
                      return;
                    }
                    upsertMutation.mutate({
                      ...draft,
                      providerAccountId: draft.providerAccountId ? Number(draft.providerAccountId) : undefined,
                      verificationScore: draft.healthStatus === "healthy" ? 100 : 0,
                    });
                  }}
                >
                  {upsertMutation.isPending || creatingDomainWithVerification ? (
                    <>
                      <LoaderCircle className="size-4 animate-spin" />
                      验证 DNS 中...
                    </>
                  ) : isEditingDomain ? (
                    "保存变更"
                  ) : (
                    "添加"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isGenerateSubdomainDialogOpen}
            onOpenChange={(open) => {
              setGenerateSubdomainDialogOpen(open);
              if (open) {
                setSubdomainMutationError(null);
              }
            }}
          >
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>批量生成子域名</DialogTitle>
                <DialogDescription>从现有根域批量生成子域前缀，适合统一下发 MX、relay、edge 等记录入口。</DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <WorkspaceField label="选择根域名">
                  <OptionCombobox
                    ariaLabel="选择根域名"
                    emptyLabel="没有匹配根域名"
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
                {subdomainMutationError ? (
                  <NoticeBanner autoHideMs={5000} className="mr-auto" onDismiss={() => setSubdomainMutationError(null)} variant="error">
                    {subdomainMutationError}
                  </NoticeBanner>
                ) : null}
                <DialogClose asChild>
                  <Button variant="outline">取消</Button>
                </DialogClose>
                <Button
                  disabled={selectedBaseDomainId === "" || generateMutation.isPending || generatingDomainsWithVerification}
                  onClick={() =>
                    generateMutation.mutate({
                      baseDomainId: Number(selectedBaseDomainId),
                      prefixes: prefixInput
                        .split(/\r?\n/)
                        .map((item) => item.trim())
                        .filter(Boolean),
                      status: "active",
                      visibility: "private",
                      publicationStatus: "draft",
                      healthStatus: "unknown",
                      weight: 90,
                    })
                  }
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

          {domainsQuery.data?.length ? (
            <div className="space-y-3">
              {domainDeleteError ? (
                <NoticeBanner autoHideMs={5000} onDismiss={() => setDomainDeleteError(null)} variant="error">
                  {domainDeleteError}
                </NoticeBanner>
              ) : null}
              {domainActionNotice ? (
                <NoticeBanner autoHideMs={5000} onDismiss={() => setDomainActionNotice(null)} variant="success">
                  {domainActionNotice}
                </NoticeBanner>
              ) : null}

              <div className="grid gap-3 lg:grid-cols-6">
                <Card className="border-border/60 bg-card shadow-none lg:col-span-2">
                  <CardContent className="space-y-2 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">域名资产</div>
                    <div className="text-2xl font-semibold">{domainSummary.total}</div>
                    <div className="text-sm text-muted-foreground">根域 {domainSummary.root} 个 · Provider 待绑定 {domainSummary.unbound} 个</div>
                  </CardContent>
                </Card>
                <Card className="border-sky-500/20 bg-sky-500/5 shadow-none">
                  <CardContent className="space-y-2 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">待审核</div>
                    <div className="text-2xl font-semibold">{domainSummary.review}</div>
                    <div className="text-sm text-muted-foreground">等待管理员批准进入公共池</div>
                  </CardContent>
                </Card>
                <Card className="border-amber-500/20 bg-amber-500/5 shadow-none">
                  <CardContent className="space-y-2 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">未绑定 DNS</div>
                    <div className="text-2xl font-semibold">{domainSummary.unbound}</div>
                    <div className="text-sm text-muted-foreground">需要配置 Provider</div>
                  </CardContent>
                </Card>
                <Card className="border-rose-500/20 bg-rose-500/5 shadow-none">
                  <CardContent className="space-y-2 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">待验证</div>
                    <div className="text-2xl font-semibold">{domainSummary.pending}</div>
                    <div className="text-sm text-muted-foreground">需继续核对记录</div>
                  </CardContent>
                </Card>
                <Card className="border-emerald-500/20 bg-emerald-500/5 shadow-none">
                  <CardContent className="space-y-2 py-4">
                    <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">已验证</div>
                    <div className="text-2xl font-semibold">{domainSummary.verified}</div>
                    <div className="text-sm text-muted-foreground">可作为稳定可用域名</div>
                  </CardContent>
                </Card>
              </div>

              {(["review", "unbound", "pending", "verified"] as Array<ReturnType<typeof getAdminDomainStatus>>).map((group) => {
                const domains = groupedPaginatedDomains[group];
                if (!domains.length) {
                  return null;
                }

                const groupMeta = getAdminDomainStatusMeta(group);

                return (
                  <div key={group} className="space-y-3">
                    <Card className={cn("shadow-none", groupMeta.cardClassName)}>
                      <CardContent className="flex flex-wrap items-start justify-between gap-3 py-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <DomainStatusIcon verified={group === "verified"} className={groupMeta.iconClassName} />
                            {groupMeta.label}
                          </div>
                          <p className="text-xs text-muted-foreground">{groupMeta.description}</p>
                        </div>
                        <WorkspaceBadge variant="outline">{domains.length} 个域名</WorkspaceBadge>
                      </CardContent>
                    </Card>

                    {domains.map((domain) => {
                const isExpanded = isDomainCardExpanded(domain);
                const guideRecords = buildRecommendedDomainRecords(domain);
                const verifiedCount = guideRecords.filter((item) => item.verified).length;
                const pendingCount = Math.max(guideRecords.length - verifiedCount, 0);
                const statusTone = getAdminDomainStatus(domain);
                const verificationResult = verificationResults[domain.id];

                return (
                  <Card
                    key={domain.id}
                    className={cn(
                      "border-border/60 bg-card shadow-none transition-colors",
                      selectedBaseDomainId === domain.id && "border-primary/40",
                    )}
                  >
                    <CardContent className={cn("py-4", isExpanded ? "space-y-4" : "space-y-3")}>
                      <div className={cn("flex flex-col lg:flex-row lg:items-center lg:justify-between", isExpanded ? "gap-4" : "gap-3")}>
                        <div className={cn(isExpanded ? "space-y-2" : "space-y-1.5")}>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 text-[1.05rem] font-semibold">
                              <Globe className="size-5 text-muted-foreground" />
                              <span>{domain.domain}</span>
                            </div>
                            <span className="flex items-center gap-2 text-sm font-medium text-foreground">
                              <DomainStatusIcon
                                verified={statusTone === "verified"}
                                className={cn(
                                  statusTone === "verified"
                                    ? "text-emerald-500"
                                    : statusTone === "review"
                                      ? "text-sky-500"
                                      : statusTone === "unbound"
                                        ? "text-amber-500"
                                        : "text-rose-400",
                                )}
                              />
                              {statusTone === "verified"
                                ? "已验证"
                                : statusTone === "review"
                                  ? "待审核"
                                  : statusTone === "unbound"
                                    ? "未绑定 DNS"
                                    : "待验证"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                            <WorkspaceStatusBadge status={domain.status}>{domain.status}</WorkspaceStatusBadge>
                            <WorkspaceBadge variant="outline">{domain.visibility}</WorkspaceBadge>
                            <WorkspaceStatusBadge status={domain.publicationStatus}>{domain.publicationStatus}</WorkspaceStatusBadge>
                            {domain.providerDisplayName ? (
                              <WorkspaceBadge variant="outline">{domain.providerDisplayName}</WorkspaceBadge>
                            ) : null}
                            <WorkspaceBadge variant="outline">验证分 {domain.verificationScore}</WorkspaceBadge>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setDomainCardExpandedState((current) => ({ ...current, [domain.id]: !isExpanded }))
                            }
                          >
                            {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
                            {isExpanded ? "收起" : "展开"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={verifyDomainMutation.isPending && verifyingDomainId === domain.id}
                            onClick={() => verifyDomainMutation.mutate(domain.id)}
                          >
                            {verifyDomainMutation.isPending && verifyingDomainId === domain.id ? "验证中..." : "验证"}
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link to={getAdminDomainDnsLink(domain.id, domain.providerAccountId)}>
                              {domain.providerAccountId ? "配置 DNS" : "绑定 DNS"}
                            </Link>
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditDomainDialog(domain)}>
                            编辑
                          </Button>
                          {domain.publicationStatus === "pending_review" ? (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setDomainActionNotice(null);
                                  reviewPublicationMutation.mutate({ domainId: domain.id, decision: "approve" });
                                }}
                              >
                                批准
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setDomainActionNotice(null);
                                  setReviewRejectDialog({
                                    id: domain.id,
                                    domain: domain.domain,
                                  });
                                }}
                              >
                                拒绝
                              </Button>
                            </>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDomainActionNotice(null);
                              setDeleteDomainDialog({
                                id: domain.id,
                                domain: domain.domain,
                              });
                            }}
                          >
                            删除
                          </Button>
                        </div>
                      </div>

                      {isExpanded ? (
                        <div className="space-y-3">
                          <DomainVerificationDetails
                            dnsLink={getAdminDomainDnsLink(domain.id, domain.providerAccountId)}
                            result={verificationResult}
                          />
                        <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                          <div className="rounded-2xl border border-border/60 bg-background/50 p-4">
                            <p className="text-sm font-semibold">域名状态</p>
                            <div className="mt-4 space-y-3 text-sm">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">健康度</span>
                                <WorkspaceStatusBadge status={domain.healthStatus}>{domain.healthStatus}</WorkspaceStatusBadge>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">根域</span>
                                <span className="truncate font-medium">{domain.rootDomain}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">已就绪记录</span>
                                <span className="font-medium">{verifiedCount}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">待处理记录</span>
                                <span className="font-medium">{pendingCount}</span>
                              </div>
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-muted-foreground">公共池</span>
                                <span className="font-medium">{domain.publicationStatus}</span>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-2xl border border-border/60 bg-background/35 p-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="space-y-1">
                                <p className="text-sm font-semibold">域名摘要</p>
                                <p className="text-sm text-muted-foreground">
                                  域名管理页仅展示当前域名资产概览；Provider 绑定、真实 DNS 工作区、验证和变更操作已迁移到独立的 DNS 配置页。
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <WorkspaceBadge variant="outline">{domain.providerDisplayName ?? "未绑定 Provider"}</WorkspaceBadge>
                                <WorkspaceBadge variant="outline">{guideRecords.length} 条建议记录</WorkspaceBadge>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
                              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                              {guideRecords.slice(0, 4).map((record) => (
                                <div key={record.key} className="rounded-xl border border-border/60 bg-card/50 px-3 py-2.5">
                                  <div className="flex items-center justify-between gap-2">
                                    <WorkspaceBadge variant="outline">{record.type}</WorkspaceBadge>
                                    <span className="text-xs text-muted-foreground">{record.status}</span>
                                  </div>
                                  <div className="mt-2 truncate text-sm font-medium">{record.name}</div>
                                  <div className="mt-1 truncate text-xs text-muted-foreground">{record.value}</div>
                                </div>
                              ))}
                              </div>

                              <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                                <div className="space-y-3 text-sm">
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">DNS 绑定</span>
                                    <span className="truncate font-medium">{domain.providerDisplayName ?? "未绑定"}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">公共池审批</span>
                                    <span className="font-medium">{domain.publicationStatus}</span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">就绪度</span>
                                    <span className="font-medium">
                                      {statusTone === "verified"
                                        ? "可稳定使用"
                                        : statusTone === "review"
                                          ? "等待审核"
                                          : statusTone === "unbound"
                                            ? "需先绑定 DNS"
                                            : "需继续校验"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-3">
                                    <span className="text-muted-foreground">建议动作</span>
                                    <span className="font-medium">
                                      {statusTone === "review"
                                        ? "处理审核"
                                        : statusTone === "unbound"
                                          ? "绑定 Provider"
                                          : statusTone === "pending"
                                            ? "进入 DNS 配置"
                                            : "保持监控"}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 text-xs text-muted-foreground">
                              如需绑定 Provider、校验记录或应用变更，请前往独立的 DNS 配置页。
                            </div>
                          </div>
                        </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-border/60 bg-background/30 px-4 py-3 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">状态</span>
                            <span className="font-medium">
                              {statusTone === "verified"
                                ? "已验证"
                                : statusTone === "review"
                                  ? "待审核"
                                  : statusTone === "unbound"
                                    ? "未绑定 DNS"
                                    : "待验证"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">健康度</span>
                            <span className="font-medium">{domain.healthStatus}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">根域</span>
                            <span className="truncate font-medium">{domain.rootDomain}</span>
                          </div>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Provider</span>
                            <span className="truncate font-medium">{domain.providerDisplayName ?? "未绑定 Provider"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">建议记录</span>
                            <span className="font-medium">{guideRecords.length} 条</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">待处理</span>
                            <span className="font-medium">{pendingCount}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
                  </div>
                );
              })}
              <PaginationControls
                itemLabel="域名"
                onPageChange={setDomainsPage}
                onPageSizeChange={setDomainsPageSize}
                page={paginatedDomains.page}
                pageSize={domainsPageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                showPageSizeSelector
                total={paginatedDomains.total}
                totalPages={paginatedDomains.totalPages}
              />
            </div>
          ) : (
            <WorkspaceEmpty title="暂无域名" description="当前还没有域名数据。" />
          )}
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
