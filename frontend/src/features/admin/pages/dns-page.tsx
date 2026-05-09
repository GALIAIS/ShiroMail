import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus, RefreshCcw } from "lucide-react";
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
import { NoticeBanner } from "@/components/ui/notice-banner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { getAPIErrorMessage } from "@/lib/http";
import { readPersistedState, writePersistedState } from "@/lib/persisted-state";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  applyAdminDNSChangeSet,
  createAdminDomainProvider,
  deleteAdminDomainProvider,
  fetchAdminDomainProviderChangeSets,
  fetchAdminDomainProviderRecords,
  fetchAdminDomainProviderVerifications,
  fetchAdminDomainProviderZones,
  fetchAdminDomainProviders,
  fetchAdminDomains,
  generateAdminSubdomains,
  previewAdminDomainProviderChangeSet,
  upsertAdminDomain,
  updateAdminDomainProvider,
  validateAdminDomainProvider,
  type DNSChangeSetItem,
  type DomainProviderItem,
  type ProviderRecordItem,
  type VerificationProfileItem,
} from "../api";
import type { DomainOption } from "../../user/api";
import {
  DnsProviderFormDialog,
  DnsDomainFormDialog,
  DnsSubdomainDialog,
  DnsProviderList,
  DnsZoneList,
  DnsRecordTable,
  DnsVerificationSection,
  DnsChangesetEditor,
  DnsChangesetHistory,
  type ProviderCredentials,
  type EditableProviderRecord,
  type DnsWorkspaceTab,
  DEFAULT_PROVIDER_PERMISSIONS,
  ADMIN_PROVIDERS_PAGE_SIZE,
  ADMIN_ZONES_PAGE_SIZE,
  ADMIN_RECORDS_PAGE_SIZE,
  ADMIN_CHANGESETS_PAGE_SIZE,
  ADMIN_CHANGESET_EDITOR_PAGE_SIZE,
  ADMIN_DOMAINS_CACHE_KEY,
  ADMIN_PROVIDERS_CACHE_KEY,
  ADMIN_WORKSPACE_CACHE_KEY,
  PERSISTED_QUERY_STALE_TIME,
  PROVIDER_ZONE_FAILURE_COOLDOWN_MS,
  parsePositiveIntParam,
  paginateItems,
  isProviderRateLimitedError,
  describeAdminProviderWorkspaceError,
  sanitizeProviderPermissions,
  getProviderTypeByID,
  recordsToEditable,
  editableToProviderRecords,
  applyVerificationRepairRecords,
  restoreEditableRecordsFromChangeSet,
} from "../components/dns";

export function AdminDnsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const persistedWorkspace = readPersistedState(ADMIN_WORKSPACE_CACHE_KEY, {
    activeTab: "providers" as DnsWorkspaceTab,
    providerZonePanel: null as {
      providerId: number;
      displayName: string;
      zones: Array<{ id: string; name: string; status: string }>;
    } | null,
    providerRecordPanel: null as {
      providerId: number;
      zoneId: string;
      zoneName: string;
      records: Array<{
        id?: string;
        type: string;
        name: string;
        value: string;
        ttl: number;
        priority: number;
        proxied: boolean;
      }>;
    } | null,
    changeSetHistory: [] as DNSChangeSetItem[],
    verificationProfiles: [] as VerificationProfileItem[],
    desiredRecordsDraft: [] as EditableProviderRecord[],
    changeSetPreview: null as DNSChangeSetItem | null,
    selectedChangeSetID: null as number | null,
  });
  const queryClient = useQueryClient();
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
  const [providerMutationError, setProviderMutationError] = useState<string | null>(null);
  const [domainMutationError, setDomainMutationError] = useState<string | null>(null);
  const [subdomainMutationError, setSubdomainMutationError] = useState<string | null>(null);
  const [providerDeleteError, setProviderDeleteError] = useState<string | null>(null);
  const [providerActionNotice, setProviderActionNotice] = useState<string | null>(null);
  const [providerValidationError, setProviderValidationError] = useState<string | null>(null);
  const [providerZoneError, setProviderZoneError] = useState<string | null>(null);
  const [zoneFailureCooldowns, setZoneFailureCooldowns] = useState<Record<string, number>>({});
  const [isCreateProviderDialogOpen, setCreateProviderDialogOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<number | null>(null);
  const [editingProviderHasBoundDomains, setEditingProviderHasBoundDomains] = useState(false);
  const [isCreateDomainDialogOpen, setCreateDomainDialogOpen] = useState(false);
  const [editingDomainId, setEditingDomainId] = useState<number | null>(null);
  const [isGenerateSubdomainDialogOpen, setGenerateSubdomainDialogOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDomainDraft);
  const [providerDraft, setProviderDraft] = useState({
    provider: "cloudflare",
    ownerType: "platform",
    displayName: "",
    authType: "api_token",
    status: "healthy",
    permissionValues: DEFAULT_PROVIDER_PERMISSIONS,
  });
  const [providerCredentials, setProviderCredentials] = useState<ProviderCredentials>({
    apiToken: "",
    apiEmail: "",
    apiKey: "",
    apiSecret: "",
  });
  const [selectedBaseDomainId, setSelectedBaseDomainId] = useState<number | "">("",);
  const [prefixInput, setPrefixInput] = useState("mx\nmx.edge\nrelay.cn.hk");
  const [providerZonePanel, setProviderZonePanel] = useState<{
    providerId: number;
    displayName: string;
    zones: Array<{ id: string; name: string; status: string }>;
  } | null>(persistedWorkspace.providerZonePanel);
  const [providerRecordPanel, setProviderRecordPanel] = useState<{
    providerId: number;
    zoneId: string;
    zoneName: string;
    records: Array<{
      id?: string;
      type: string;
      name: string;
      value: string;
      ttl: number;
      priority: number;
      proxied: boolean;
    }>;
  } | null>(persistedWorkspace.providerRecordPanel);
  const [desiredRecordsDraft, setDesiredRecordsDraft] = useState<EditableProviderRecord[]>(
    persistedWorkspace.desiredRecordsDraft,
  );
  const [changeSetPreview, setChangeSetPreview] = useState<DNSChangeSetItem | null>(persistedWorkspace.changeSetPreview);
  const [changeSetHistory, setChangeSetHistory] = useState<DNSChangeSetItem[]>(persistedWorkspace.changeSetHistory);
  const [selectedChangeSetID, setSelectedChangeSetID] = useState<number | null>(persistedWorkspace.selectedChangeSetID);
  const [verificationProfiles, setVerificationProfiles] = useState<VerificationProfileItem[]>(persistedWorkspace.verificationProfiles);
  const [changeSetError, setChangeSetError] = useState<string | null>(null);
  const [changeSetNotice, setChangeSetNotice] = useState<string | null>(null);
  const [activeDnsTab, setActiveDnsTab] = useState<DnsWorkspaceTab>(persistedWorkspace.activeTab);
  const [providerZonesExpanded, setProviderZonesExpanded] = useState(true);
  const [providerRecordsExpanded, setProviderRecordsExpanded] = useState(true);
  const [verificationExpanded, setVerificationExpanded] = useState(true);
  const [changeSetEditorExpanded, setChangeSetEditorExpanded] = useState(true);
  const [changeSetHistoryExpanded, setChangeSetHistoryExpanded] = useState(true);
  const [providerAccountsPage, setProviderAccountsPage] = useState(1);
  const [providerZonesPage, setProviderZonesPage] = useState(1);
  const [providerRecordsPage, setProviderRecordsPage] = useState(1);
  const [changeSetHistoryPage, setChangeSetHistoryPage] = useState(1);
  const [changeSetEditorPage, setChangeSetEditorPage] = useState(1);
  const [providerDeleteDialog, setProviderDeleteDialog] = useState<{
    id: number;
    name: string;
  } | null>(null);
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
    placeholderData: () =>
      readPersistedState<Awaited<ReturnType<typeof fetchAdminDomainProviders>>>(
        ADMIN_PROVIDERS_CACHE_KEY,
        [],
      ),
  });
  const currentRecordProviderType = useMemo(
    () => getProviderTypeByID(providersQuery.data, providerRecordPanel?.providerId),
    [providerRecordPanel?.providerId, providersQuery.data],
  );
  const rootDomains = useMemo(
    () => (domainsQuery.data ?? []).filter((item) => item.kind === "root"),
    [domainsQuery.data],
  );
  const sortedChangeSetHistory = useMemo(
    () =>
      [...changeSetHistory].sort((left, right) => {
        const leftTime = Date.parse(left.appliedAt ?? left.createdAt ?? "");
        const rightTime = Date.parse(right.appliedAt ?? right.createdAt ?? "");
        return rightTime - leftTime;
      }),
    [changeSetHistory],
  );
  const verificationStatusSummary = useMemo(
    () =>
      verificationProfiles.reduce(
        (summary, profile) => {
          if (profile.status === "verified") {
            summary.verified += 1;
          } else if (profile.status === "drifted") {
            summary.drifted += 1;
          } else {
            summary.other += 1;
          }
          return summary;
        },
        { verified: 0, drifted: 0, other: 0 },
      ),
    [verificationProfiles],
  );
  const paginatedProviders = useMemo(
    () => paginateItems(providersQuery.data ?? [], providerAccountsPage, ADMIN_PROVIDERS_PAGE_SIZE),
    [providerAccountsPage, providersQuery.data],
  );
  const paginatedZones = useMemo(
    () => paginateItems(providerZonePanel?.zones ?? [], providerZonesPage, ADMIN_ZONES_PAGE_SIZE),
    [providerZonePanel?.zones, providerZonesPage],
  );
  const paginatedRecords = useMemo(
    () => paginateItems(providerRecordPanel?.records ?? [], providerRecordsPage, ADMIN_RECORDS_PAGE_SIZE),
    [providerRecordPanel?.records, providerRecordsPage],
  );
  const paginatedChangeSetHistory = useMemo(
    () => paginateItems(sortedChangeSetHistory, changeSetHistoryPage, ADMIN_CHANGESETS_PAGE_SIZE),
    [changeSetHistoryPage, sortedChangeSetHistory],
  );
  const paginatedChangeSetEditorRecords = useMemo(
    () => paginateItems(desiredRecordsDraft, changeSetEditorPage, ADMIN_CHANGESET_EDITOR_PAGE_SIZE),
    [changeSetEditorPage, desiredRecordsDraft],
  );
  const boundProviderIds = useMemo(
    () =>
      new Set(
        (domainsQuery.data ?? [])
          .map((domain) => domain.providerAccountId)
          .filter((providerAccountId): providerAccountId is number => typeof providerAccountId === "number"),
      ),
    [domainsQuery.data],
  );
  const isEditingProvider = editingProviderId !== null;
  const providerCoreFieldsLocked = isEditingProvider && editingProviderHasBoundDomains;
  const resetProviderForm = useCallback(() => {
    setEditingProviderId(null);
    setEditingProviderHasBoundDomains(false);
    setProviderDraft({
      provider: "cloudflare",
      ownerType: "platform",
      displayName: "",
      authType: "api_token",
      status: "healthy",
      permissionValues: DEFAULT_PROVIDER_PERMISSIONS,
    });
    setProviderCredentials({ apiToken: "", apiEmail: "", apiKey: "", apiSecret: "" });
  }, []);
  const openCreateProviderDialog = useCallback(() => {
    setProviderActionNotice(null);
    setProviderMutationError(null);
    resetProviderForm();
    setCreateProviderDialogOpen(true);
  }, [resetProviderForm]);
  const openEditProviderDialog = useCallback((provider: DomainProviderItem) => {
    setProviderActionNotice(null);
    setProviderMutationError(null);
    setEditingProviderId(provider.id);
    setEditingProviderHasBoundDomains(boundProviderIds.has(provider.id));
    setProviderDraft({
      provider: provider.provider,
      ownerType: provider.ownerType || "platform",
      displayName: provider.displayName,
      authType: provider.authType,
      status: provider.status,
      permissionValues: sanitizeProviderPermissions(provider.provider, provider.capabilities),
    });
    setProviderCredentials({ apiToken: "", apiEmail: "", apiKey: "", apiSecret: "" });
    setCreateProviderDialogOpen(true);
  }, [boundProviderIds]);

  useEffect(() => {
    writePersistedState(ADMIN_DOMAINS_CACHE_KEY, domainsQuery.data ?? []);
  }, [domainsQuery.data]);
  useEffect(() => {
    writePersistedState(ADMIN_PROVIDERS_CACHE_KEY, providersQuery.data ?? []);
  }, [providersQuery.data]);
  useEffect(() => {
    writePersistedState(ADMIN_WORKSPACE_CACHE_KEY, {
      activeTab: activeDnsTab,
      providerZonePanel,
      providerRecordPanel,
      changeSetHistory,
      verificationProfiles,
      desiredRecordsDraft,
      changeSetPreview,
      selectedChangeSetID,
    });
  }, [
    activeDnsTab,
    changeSetHistory,
    changeSetPreview,
    desiredRecordsDraft,
    providerRecordPanel,
    providerZonePanel,
    selectedChangeSetID,
    verificationProfiles,
  ]);
  const refreshProviderRecordWorkspace = useCallback(async (input: {
    providerId: number;
    zoneId: string;
    zoneName: string;
    preserveDesiredInput?: boolean;
    force?: boolean;
  }) => {
    const zoneKey = `${input.providerId}:${input.zoneId}`;
    const cooldownUntil = zoneFailureCooldowns[zoneKey] ?? 0;
    if (!input.force && cooldownUntil > Date.now()) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownUntil - Date.now()) / 1000));
      throw new Error(`DNS 服务商当前仍在冷却中，请约 ${waitSeconds} 秒后再刷新此 Zone。`);
    }
    try {
      const [records, changeSets, verifications] = await Promise.all([
        fetchAdminDomainProviderRecords(input.providerId, input.zoneId),
        fetchAdminDomainProviderChangeSets(input.providerId, input.zoneId),
        fetchAdminDomainProviderVerifications(input.providerId, input.zoneId, input.zoneName),
      ]);
      setZoneFailureCooldowns((current) => {
        if (!(zoneKey in current)) return current;
        const next = { ...current };
        delete next[zoneKey];
        return next;
      });
      setProviderRecordPanel({ providerId: input.providerId, zoneId: input.zoneId, zoneName: input.zoneName, records });
      setChangeSetHistory(changeSets);
      setVerificationProfiles(verifications);
      if (!input.preserveDesiredInput) {
        setDesiredRecordsDraft(recordsToEditable(records));
      }
    } catch (error) {
      const message = getAPIErrorMessage(error, "载入 DNS 工作区失败");
      if (isProviderRateLimitedError(message)) {
        setZoneFailureCooldowns((current) => ({ ...current, [zoneKey]: Date.now() + PROVIDER_ZONE_FAILURE_COOLDOWN_MS }));
      }
      throw error;
    }
  }, [zoneFailureCooldowns]);

  const pendingWorkspaceRefreshRef = useRef<number | null>(null);

  function scheduleProviderWorkspaceRefresh(
    input: { providerId: number; zoneId: string; zoneName: string; preserveDesiredInput?: boolean; force?: boolean },
    options?: { delayMs?: number; onErrorMessage?: string },
  ) {
    if (pendingWorkspaceRefreshRef.current !== null) {
      window.clearTimeout(pendingWorkspaceRefreshRef.current);
    }
    pendingWorkspaceRefreshRef.current = window.setTimeout(() => {
      pendingWorkspaceRefreshRef.current = null;
      void refreshProviderRecordWorkspace(input).catch((error) => {
        setProviderZoneError(
          describeAdminProviderWorkspaceError(
            getAPIErrorMessage(error, options?.onErrorMessage ?? "重新拉取 DNS 记录失败。"),
          ),
        );
      });
    }, options?.delayMs ?? 2500);
  }

  const resetChangeWorkspace = useCallback((options?: { keepZonePanel?: boolean }) => {
    if (!options?.keepZonePanel) {
      setProviderZonePanel(null);
      setActiveDnsTab("providers");
    } else {
      setActiveDnsTab("zones");
    }
    setProviderRecordPanel(null);
    setChangeSetHistory([]);
    setVerificationProfiles([]);
    setDesiredRecordsDraft([]);
    setChangeSetPreview(null);
    setSelectedChangeSetID(null);
    setChangeSetError(null);
    setChangeSetNotice(null);
  }, []);

  useEffect(() => {
    const providerIds = new Set((providersQuery.data ?? []).map((item) => item.id));
    if (providerZonePanel && !providerIds.has(providerZonePanel.providerId)) {
      resetChangeWorkspace();
      setProviderZoneError(null);
      setProviderValidationError(null);
      setProviderDeleteError(null);
      setProviderActionNotice(null);
    }
  }, [providerZonePanel, providersQuery.data, resetChangeWorkspace]);

  useEffect(() => {
    return () => {
      if (pendingWorkspaceRefreshRef.current !== null) {
        window.clearTimeout(pendingWorkspaceRefreshRef.current);
      }
    };
  }, []);
  async function resolveLiveAdminProvider(providerId: number) {
    const result = await providersQuery.refetch();
    const liveProviders = result.data ?? providersQuery.data ?? [];
    const provider = liveProviders.find((item) => item.id === providerId) ?? null;
    if (provider) return provider;
    queryClient.setQueryData<Awaited<ReturnType<typeof fetchAdminDomainProviders>>>(
      ["admin-domain-providers"],
      liveProviders,
    );
    if (providerZonePanel?.providerId === providerId || providerRecordPanel?.providerId === providerId) {
      resetChangeWorkspace();
    }
    setProviderActionNotice(null);
    setProviderZoneError(null);
    setProviderValidationError(null);
    setProviderDeleteError("Provider 账号已不存在，已自动刷新管理员 Provider 列表。");
    return null;
  }

  async function refreshAdminDomainData() {
    setProviderActionNotice(null);
    await Promise.all([domainsQuery.refetch(), providersQuery.refetch()]);
    const providerIds = new Set((providersQuery.data ?? []).map((item) => item.id));
    if (providerZonePanel && providerIds.has(providerZonePanel.providerId)) {
      const zones = await fetchAdminDomainProviderZones(providerZonePanel.providerId);
      setProviderZonePanel({ providerId: providerZonePanel.providerId, displayName: providerZonePanel.displayName, zones });
    } else if (providerZonePanel) {
      resetChangeWorkspace();
    }
    if (providerRecordPanel && providerIds.has(providerRecordPanel.providerId)) {
      await refreshProviderRecordWorkspace({
        providerId: providerRecordPanel.providerId,
        zoneId: providerRecordPanel.zoneId,
        zoneName: providerRecordPanel.zoneName,
        preserveDesiredInput: true,
      });
    } else if (providerRecordPanel) {
      resetChangeWorkspace();
    }
  }

  const upsertMutation = useMutation({
    mutationFn: upsertAdminDomain,
    onSuccess: async () => {
      setDomainMutationError(null);
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

  const generateMutation = useMutation({
    mutationFn: generateAdminSubdomains,
    onSuccess: async () => {
      setSubdomainMutationError(null);
      setGenerateSubdomainDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (error) => {
      setSubdomainMutationError(getAPIErrorMessage(error, "批量生成子域名失败，请稍后重试。"));
    },
  });

  const createProviderMutation = useMutation({
    mutationFn: createAdminDomainProvider,
    onSuccess: async () => {
      setProviderMutationError(null);
      setProviderDeleteError(null);
      setProviderActionNotice("Provider 账号已添加。");
      resetProviderForm();
      setCreateProviderDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-domain-providers"] });
    },
    onError: (error) => {
      setProviderMutationError(getAPIErrorMessage(error, "新增 Provider 账号失败，请检查凭据或会话状态。"));
    },
  });
  const updateProviderMutation = useMutation({
    mutationFn: ({ providerAccountId, input }: { providerAccountId: number; input: Parameters<typeof updateAdminDomainProvider>[1] }) =>
      updateAdminDomainProvider(providerAccountId, input),
    onSuccess: async () => {
      setProviderMutationError(null);
      setProviderDeleteError(null);
      setProviderActionNotice("Provider 账号已更新。");
      resetProviderForm();
      setCreateProviderDialogOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-domain-providers"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
    },
    onError: (error) => {
      setProviderMutationError(getAPIErrorMessage(error, "更新 Provider 账号失败，请检查字段和绑定关系。"));
    },
  });

  const deleteProviderMutation = useMutation({
    mutationFn: deleteAdminDomainProvider,
    onSuccess: async (_, providerId) => {
      setProviderDeleteError(null);
      setProviderActionNotice("Provider 账号已删除。");
      queryClient.setQueryData<Awaited<ReturnType<typeof fetchAdminDomainProviders>>>(["admin-domain-providers"], (current) =>
        (current ?? []).filter((item) => item.id !== providerId),
      );
      if (providerZonePanel?.providerId === providerId) {
        resetChangeWorkspace();
      }
      await queryClient.invalidateQueries({ queryKey: ["admin-domain-providers"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-domains"] });
    },
    onError: (error) => {
      setProviderDeleteError(getAPIErrorMessage(error, "删除 Provider 账号失败，请先解除域名绑定。"));
    },
  });

  const validateProviderMutation = useMutation({
    mutationFn: validateAdminDomainProvider,
    onSuccess: async () => {
      setProviderValidationError(null);
      setProviderActionNotice("Provider 连接校验完成。");
      await queryClient.invalidateQueries({ queryKey: ["admin-domain-providers"] });
    },
    onError: (error) => {
      setProviderValidationError(getAPIErrorMessage(error, "校验 Provider 账号失败，请检查鉴权方式与凭据。"));
    },
  });

  const loadProviderZonesMutation = useMutation({
    mutationFn: async (providerAccount: { id: number; displayName: string }) => {
      const zones = await fetchAdminDomainProviderZones(providerAccount.id);
      return { providerId: providerAccount.id, displayName: providerAccount.displayName, zones };
    },
    onSuccess: (payload) => {
      setProviderZoneError(null);
      setProviderActionNotice(`已载入 ${payload.displayName} 的 Zone 列表。`);
      setProviderZonePanel(payload);
      setProviderZonesPage(1);
      setActiveDnsTab("zones");
      resetChangeWorkspace({ keepZonePanel: true });
    },
    onError: (error) => {
      setProviderZoneError(describeAdminProviderWorkspaceError(getAPIErrorMessage(error, "拉取 Provider Zones 失败，请检查连接与凭据。")));
      resetChangeWorkspace();
    },
  });

  const loadProviderRecordsMutation = useMutation({
    mutationFn: async (input: { providerId: number; zoneId: string; zoneName: string }) => input,
    onSuccess: async (payload) => {
      try {
        await refreshProviderRecordWorkspace(payload);
        setChangeSetPreview(null);
        setChangeSetError(null);
        setChangeSetNotice(`已载入 ${payload.zoneName} 的 DNS Records。`);
        setProviderZoneError(null);
        setProviderRecordsPage(1);
        setChangeSetEditorPage(1);
        setChangeSetHistoryPage(1);
        setActiveDnsTab("records");
      } catch (error) {
        setProviderZoneError(describeAdminProviderWorkspaceError(getAPIErrorMessage(error, `载入 ${payload.zoneName} 的 DNS Records 失败。`)));
      }
    },
  });
  const previewChangeSetMutation = useMutation({
    mutationFn: async (input: { providerId: number; zoneId: string; zoneName: string; records: ProviderRecordItem[] }) => {
      return previewAdminDomainProviderChangeSet(input.providerId, input.zoneId, { zoneName: input.zoneName, records: input.records });
    },
    onSuccess: (payload) => {
      setChangeSetPreview(payload);
      setSelectedChangeSetID(payload.id);
      setChangeSetHistory((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
      setChangeSetError(null);
      setChangeSetNotice(`Change Set 已生成：${payload.summary}`);
      setActiveDnsTab("records");
    },
    onError: (error) => {
      setChangeSetError(describeAdminProviderWorkspaceError(getAPIErrorMessage(error, "预览自动配置失败")));
    },
  });

  const applyChangeSetMutation = useMutation({
    mutationFn: applyAdminDNSChangeSet,
    onSuccess: (payload) => {
      setChangeSetPreview(payload);
      setSelectedChangeSetID(payload.id);
      setChangeSetHistory((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
      setChangeSetError(null);
      setChangeSetNotice(payload.appliedAt ? "Change Set 已应用到上游 DNS。" : "Change Set 已更新。");
      setActiveDnsTab("records");
      if (providerRecordPanel) {
        scheduleProviderWorkspaceRefresh(
          { providerId: providerRecordPanel.providerId, zoneId: providerRecordPanel.zoneId, zoneName: providerRecordPanel.zoneName, preserveDesiredInput: true },
          { onErrorMessage: "变更已应用，但重新拉取 DNS 记录失败。" },
        );
      }
    },
    onError: (error) => {
      setChangeSetError(describeAdminProviderWorkspaceError(getAPIErrorMessage(error, "应用自动配置失败")));
    },
  });

  const saveProviderRecordsMutation = useMutation({
    mutationFn: async (input: { providerId: number; zoneId: string; zoneName: string; records: ReturnType<typeof editableToProviderRecords> }) => {
      const preview = await previewAdminDomainProviderChangeSet(input.providerId, input.zoneId, { zoneName: input.zoneName, records: input.records });
      return applyAdminDNSChangeSet(preview.id);
    },
    onSuccess: async (payload, variables) => {
      const verifications = await fetchAdminDomainProviderVerifications(variables.providerId, variables.zoneId, variables.zoneName);
      setChangeSetPreview(payload);
      setSelectedChangeSetID(payload.id);
      setChangeSetHistory((current) => [payload, ...current.filter((item) => item.id !== payload.id)]);
      setChangeSetError(null);
      setChangeSetNotice("已保存并同步到 DNS 服务商。");
      setActiveDnsTab("records");
      if (providerRecordPanel) {
        setProviderRecordPanel({ providerId: variables.providerId, zoneId: variables.zoneId, zoneName: variables.zoneName, records: variables.records });
        setVerificationProfiles(verifications);
        setDesiredRecordsDraft(recordsToEditable(variables.records));
        scheduleProviderWorkspaceRefresh(
          { providerId: providerRecordPanel.providerId, zoneId: providerRecordPanel.zoneId, zoneName: providerRecordPanel.zoneName, preserveDesiredInput: false },
          { onErrorMessage: "记录已保存，但重新拉取 DNS 记录失败。" },
        );
      }
    },
    onError: (error) => {
      setChangeSetError(describeAdminProviderWorkspaceError(getAPIErrorMessage(error, "保存 DNS 记录到服务商失败")));
    },
  });
  const validatingProviderID = validateProviderMutation.isPending ? validateProviderMutation.variables ?? null : null;
  const loadingZonesProviderID = loadProviderZonesMutation.isPending ? loadProviderZonesMutation.variables?.id ?? null : null;
  const deletingProviderID = deleteProviderMutation.isPending ? deleteProviderMutation.variables ?? null : null;
  const loadingRecordsZoneKey = loadProviderRecordsMutation.isPending
    ? `${loadProviderRecordsMutation.variables?.providerId ?? ""}:${loadProviderRecordsMutation.variables?.zoneId ?? ""}`
    : null;
  const isRefreshingDomainData = domainsQuery.isRefetching || providersQuery.isRefetching;
  const isChangeSetWorkspaceBusy = previewChangeSetMutation.isPending || applyChangeSetMutation.isPending || saveProviderRecordsMutation.isPending;

  const providerOptions = (providersQuery.data ?? []).map((item) => ({
    value: String(item.id),
    label: item.displayName,
    keywords: [item.provider, item.ownerType, item.status],
  }));
  const requestedProviderId = parsePositiveIntParam(searchParams.get("providerId"));
  const requestedDomainId = parsePositiveIntParam(searchParams.get("domainId"));
  const requestedDomain = useMemo(
    () => requestedDomainId !== null ? (domainsQuery.data ?? []).find((item) => item.id === requestedDomainId) ?? null : null,
    [domainsQuery.data, requestedDomainId],
  );
  const requestedProvider = useMemo(
    () => requestedProviderId !== null ? (providersQuery.data ?? []).find((item) => item.id === requestedProviderId) ?? null : null,
    [providersQuery.data, requestedProviderId],
  );
  const autoWorkspaceRequestRef = useRef<string | null>(null);
  const clearInvalidSearchParams = useCallback((keys: Array<"providerId" | "domainId">) => {
    const nextParams = new URLSearchParams(searchParams);
    let changed = false;
    keys.forEach((key) => {
      if (nextParams.has(key)) { nextParams.delete(key); changed = true; }
    });
    if (!changed) return;
    navigate({ pathname: location.pathname, search: nextParams.toString() ? `?${nextParams.toString()}` : "" }, { replace: true });
  }, [location.pathname, navigate, searchParams]);

  const syncWorkspaceForRequestedDomain = useCallback(async (domain: DomainOption) => {
    setProviderZoneError(null);
    setChangeSetError(null);
    setChangeSetNotice(null);
    setChangeSetPreview(null);
    if (!domain.providerAccountId) {
      setProviderZoneError(`域名 ${domain.domain} 尚未绑定 DNS 服务商，请先回域名管理完成绑定。`);
      resetChangeWorkspace();
      return;
    }
    if (!(providersQuery.data ?? []).some((item) => item.id === domain.providerAccountId)) {
      setProviderZoneError("当前域名绑定的是独立私有 Provider，管理员 DNS 配置页不会接管这条绑定，请在对应面板处理或重新绑定管理员 Provider。");
      resetChangeWorkspace();
      return;
    }
    const providerId = domain.providerAccountId;
    const displayName = domain.providerDisplayName ?? domain.provider ?? "Provider";
    try {
      const zones = providerZonePanel?.providerId === providerId ? providerZonePanel.zones : await fetchAdminDomainProviderZones(providerId);
      setProviderZonePanel({ providerId, displayName, zones });
      setProviderZonesExpanded(true);
      setProviderZonesPage(1);
      const targetZone = zones.find((zone) => zone.name === domain.rootDomain) ?? zones.find((zone) => zone.name === domain.domain) ?? null;
      if (!targetZone) {
        setProviderZoneError(`已载入 ${displayName} 的 Zone 列表，但没有匹配到 ${domain.rootDomain} 或 ${domain.domain}。请先确认域名真实托管在当前 Provider 账号下。`);
        resetChangeWorkspace({ keepZonePanel: true });
        return;
      }
      await refreshProviderRecordWorkspace({ providerId, zoneId: targetZone.id, zoneName: targetZone.name });
      setProviderRecordsExpanded(true);
      setVerificationExpanded(true);
      setChangeSetEditorExpanded(true);
      setChangeSetHistoryExpanded(true);
      setProviderRecordsPage(1);
      setChangeSetEditorPage(1);
      setChangeSetHistoryPage(1);
      setProviderActionNotice(`已按域名 ${domain.domain} 定位到 Zone ${targetZone.name}。`);
    } catch (error) {
      setProviderZoneError(describeAdminProviderWorkspaceError(getAPIErrorMessage(error, "暂时无法加载该域名的 DNS 工作区，请先校验连接或检查凭据。")));
      resetChangeWorkspace({ keepZonePanel: true });
    }
  }, [providerZonePanel, providersQuery.data, refreshProviderRecordWorkspace, resetChangeWorkspace]);

  useEffect(() => {
    if (!requestedDomain && !requestedProvider) {
      autoWorkspaceRequestRef.current = null;
    }
    const invalidKeys: Array<"providerId" | "domainId"> = [];
    if (searchParams.has("domainId") && requestedDomainId !== null && !requestedDomain) invalidKeys.push("domainId");
    if (searchParams.has("providerId") && requestedProviderId !== null && !requestedProvider) invalidKeys.push("providerId");
    if (invalidKeys.length > 0) { autoWorkspaceRequestRef.current = null; clearInvalidSearchParams(invalidKeys); return; }
    if (requestedDomain) {
      const requestKey = `domain:${requestedDomain.id}:${requestedDomain.providerAccountId ?? 0}:${requestedDomain.rootDomain}:${requestedDomain.domain}`;
      if (!requestedDomain.providerAccountId) {
        autoWorkspaceRequestRef.current = requestKey;
        setProviderZoneError(`域名 ${requestedDomain.domain} 尚未绑定 DNS 服务商，请先回域名管理完成绑定。`);
        return;
      }
      if (!providerRecordPanel || requestedDomain.providerAccountId !== providerRecordPanel.providerId || (providerRecordPanel.zoneName !== requestedDomain.rootDomain && providerRecordPanel.zoneName !== requestedDomain.domain)) {
        if (!loadProviderZonesMutation.isPending && autoWorkspaceRequestRef.current !== requestKey) {
          autoWorkspaceRequestRef.current = requestKey;
          void syncWorkspaceForRequestedDomain(requestedDomain);
        }
        return;
      }
      autoWorkspaceRequestRef.current = requestKey;
    }
    if (!requestedProvider || providerZonePanel?.providerId === requestedProvider.id || loadProviderZonesMutation.isPending) return;
    const requestKey = `provider:${requestedProvider.id}`;
    if (autoWorkspaceRequestRef.current === requestKey) return;
    autoWorkspaceRequestRef.current = requestKey;
    loadProviderZonesMutation.mutate({ id: requestedProvider.id, displayName: requestedProvider.displayName });
  }, [
    clearInvalidSearchParams, loadProviderZonesMutation, location.pathname,
    providerRecordPanel, providerZonePanel?.providerId, requestedDomain,
    requestedDomainId, requestedProvider, requestedProviderId, searchParams,
    syncWorkspaceForRequestedDomain,
  ]);
  const handleProviderFormSubmit = useCallback(() => {
    const input = {
      provider: providerDraft.provider,
      ownerType: "platform",
      displayName: providerDraft.displayName || `${providerDraft.provider} account`,
      authType: providerDraft.authType,
      credentials: {
        apiToken: providerCredentials.apiToken.trim(),
        apiEmail: providerCredentials.apiEmail.trim(),
        apiKey: providerCredentials.apiKey.trim(),
        apiSecret: providerCredentials.apiSecret.trim(),
      },
      status: providerDraft.status,
      capabilities: sanitizeProviderPermissions(providerDraft.provider, providerDraft.permissionValues),
    };
    if (editingProviderId !== null) {
      updateProviderMutation.mutate({ providerAccountId: editingProviderId, input });
      return;
    }
    createProviderMutation.mutate(input);
  }, [createProviderMutation, editingProviderId, providerCredentials, providerDraft, updateProviderMutation]);

  const handleDomainFormSubmit = useCallback(() => {
    upsertMutation.mutate({
      ...draft,
      providerAccountId: draft.providerAccountId ? Number(draft.providerAccountId) : undefined,
      verificationScore: draft.healthStatus === "healthy" ? 100 : 0,
    });
  }, [draft, upsertMutation]);

  const handleSubdomainSubmit = useCallback(() => {
    generateMutation.mutate({
      baseDomainId: Number(selectedBaseDomainId),
      prefixes: prefixInput.split(/\r?\n/).map((item) => item.trim()).filter(Boolean),
      status: "active",
      visibility: "private",
      publicationStatus: "draft",
      healthStatus: "unknown",
      weight: 90,
    });
  }, [generateMutation, prefixInput, selectedBaseDomainId]);

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/domains")}>
              <Globe className="size-4" />
              域名管理
            </Button>
            <Button variant="outline" onClick={openCreateProviderDialog}>
              <Plus className="size-4" />
              新增 Provider 账号
            </Button>
            <Button variant="outline" onClick={() => { void refreshAdminDomainData(); }}>
              <RefreshCcw className={isRefreshingDomainData ? "size-4 animate-spin" : "size-4"} />
              刷新
            </Button>
          </div>
        }
        description="将 Zone、Records、验证与 Change Set 拆分为独立工作区。"
        title="DNS 配置"
      >
        <div className="space-y-4">
          <AlertDialog open={providerDeleteDialog !== null} onOpenChange={(open) => { if (!open) setProviderDeleteDialog(null); }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>删除 DNS 服务商账号？</AlertDialogTitle>
                <AlertDialogDescription>
                  {providerDeleteDialog ? `确认删除 Provider 账号 ${providerDeleteDialog.name}？删除后将无法继续读取 Zone，也无法继续修改对应 DNS 记录。` : ""}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  if (!providerDeleteDialog) return;
                  const liveProvider = await resolveLiveAdminProvider(providerDeleteDialog.id);
                  if (!liveProvider) { setProviderDeleteDialog(null); return; }
                  deleteProviderMutation.mutate(liveProvider.id);
                  setProviderDeleteDialog(null);
                }}>
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {(requestedProvider || requestedDomain || providerRecordPanel) ? (
            <Card className="border-border/60 bg-card/85 shadow-none">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium">当前上下文</div>
                  <p className="text-xs text-muted-foreground">
                    {requestedDomain
                      ? `已根据域名 ${requestedDomain.domain} 自动打开 DNS 工作区。`
                      : requestedProvider
                        ? `已根据 Provider ${requestedProvider.displayName} 自动定位 Zone 工作区。`
                        : `当前查看 ${providerRecordPanel?.zoneName ?? providerZonePanel?.displayName ?? "DNS 工作区"}。`}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {requestedDomain ? <WorkspaceBadge variant="outline">域名：{requestedDomain.domain}</WorkspaceBadge> : null}
                  {requestedProvider ? <WorkspaceBadge variant="outline">Provider：{requestedProvider.displayName}</WorkspaceBadge> : null}
                  {providerRecordPanel ? <WorkspaceBadge variant="outline">Zone：{providerRecordPanel.zoneName}</WorkspaceBadge> : null}
                  {requestedDomain ? <WorkspaceBadge variant="outline">根域：{requestedDomain.rootDomain}</WorkspaceBadge> : null}
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
                    先定位 Provider 或域名，再处理 Zone、验证和 Change Set；根域记录通常用 `@`，子域记录只填前缀即可。
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <WorkspaceBadge variant="outline">1. 选择域名</WorkspaceBadge>
                  <WorkspaceBadge variant="outline">2. 校验记录</WorkspaceBadge>
                  <WorkspaceBadge variant="outline">3. 应用变更</WorkspaceBadge>
                </div>
              </div>
            </CardContent>
          </Card>

          <DnsProviderFormDialog
            open={isCreateProviderDialogOpen}
            onOpenChange={setCreateProviderDialogOpen}
            isEditing={isEditingProvider}
            coreFieldsLocked={providerCoreFieldsLocked}
            draft={providerDraft}
            onDraftChange={setProviderDraft}
            credentials={providerCredentials}
            onCredentialsChange={setProviderCredentials}
            mutationError={providerMutationError}
            onDismissError={() => setProviderMutationError(null)}
            isPending={createProviderMutation.isPending || updateProviderMutation.isPending}
            onSubmit={handleProviderFormSubmit}
            onReset={resetProviderForm}
          />

          <DnsDomainFormDialog
            open={isCreateDomainDialogOpen}
            onOpenChange={setCreateDomainDialogOpen}
            isEditing={isEditingDomain}
            draft={draft}
            onDraftChange={setDraft}
            providerOptions={providerOptions}
            mutationError={domainMutationError}
            onDismissError={() => setDomainMutationError(null)}
            isPending={upsertMutation.isPending}
            onSubmit={handleDomainFormSubmit}
            onReset={() => { setEditingDomainId(null); setDraft(emptyDomainDraft); }}
          />

          <DnsSubdomainDialog
            open={isGenerateSubdomainDialogOpen}
            onOpenChange={setGenerateSubdomainDialogOpen}
            rootDomains={rootDomains}
            selectedBaseDomainId={selectedBaseDomainId}
            onSelectedBaseDomainIdChange={setSelectedBaseDomainId}
            prefixInput={prefixInput}
            onPrefixInputChange={setPrefixInput}
            mutationError={subdomainMutationError}
            onDismissError={() => setSubdomainMutationError(null)}
            isPending={generateMutation.isPending}
            onSubmit={handleSubdomainSubmit}
          />
          <div className="grid gap-4">
            <Card className="border-border/60 bg-muted/10 shadow-none">
              <CardContent className="space-y-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="text-sm font-medium">DNS 工作台</div>
                    <p className="text-sm text-muted-foreground">使用 Tabs 划分 Provider、Zone 与 Zone 工作区。</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <WorkspaceBadge variant="outline">Provider {(providersQuery.data?.length ?? 0)}</WorkspaceBadge>
                    <WorkspaceBadge variant="outline">Zone {providerZonePanel?.zones.length ?? 0}</WorkspaceBadge>
                    <WorkspaceBadge variant="outline">Records {providerRecordPanel?.records.length ?? 0}</WorkspaceBadge>
                  </div>
                </div>

                {providerDeleteError ? (
                  <NoticeBanner autoHideMs={5000} onDismiss={() => setProviderDeleteError(null)} variant="error">{providerDeleteError}</NoticeBanner>
                ) : null}
                {providerActionNotice ? (
                  <NoticeBanner autoHideMs={5000} onDismiss={() => setProviderActionNotice(null)} variant="success">{providerActionNotice}</NoticeBanner>
                ) : null}
                {providerValidationError ? (
                  <NoticeBanner autoHideMs={5000} onDismiss={() => setProviderValidationError(null)} variant="error">{providerValidationError}</NoticeBanner>
                ) : null}
                {providerZoneError ? (
                  <NoticeBanner autoHideMs={5000} onDismiss={() => setProviderZoneError(null)} variant="error">{providerZoneError}</NoticeBanner>
                ) : null}

                <Tabs className="min-w-0" value={activeDnsTab} onValueChange={(value) => setActiveDnsTab(value as DnsWorkspaceTab)}>
                  <TabsList className="w-full justify-start overflow-x-auto" variant="line">
                    <TabsTrigger value="providers">Provider 账号</TabsTrigger>
                    <TabsTrigger value="zones">Zone</TabsTrigger>
                    <TabsTrigger value="records">Zone 工作区</TabsTrigger>
                  </TabsList>

                  <TabsContent className="space-y-3" value="providers">
                    <DnsProviderList
                      providers={providersQuery.data ?? []}
                      paginatedItems={paginatedProviders.items}
                      page={paginatedProviders.page}
                      totalPages={paginatedProviders.totalPages}
                      total={paginatedProviders.total}
                      onPageChange={setProviderAccountsPage}
                      validatingProviderID={validatingProviderID}
                      loadingZonesProviderID={loadingZonesProviderID}
                      deletingProviderID={deletingProviderID}
                      onValidate={async (provider) => {
                        setProviderActionNotice(null);
                        setProviderValidationError(null);
                        const liveProvider = await resolveLiveAdminProvider(provider.id);
                        if (!liveProvider) return;
                        validateProviderMutation.mutate(liveProvider.id);
                      }}
                      onEdit={openEditProviderDialog}
                      onLoadZones={async (provider) => {
                        setProviderActionNotice(null);
                        setProviderZoneError(null);
                        const liveProvider = await resolveLiveAdminProvider(provider.id);
                        if (!liveProvider) return;
                        loadProviderZonesMutation.mutate({ id: liveProvider.id, displayName: liveProvider.displayName });
                      }}
                      onDelete={(provider) => {
                        setProviderActionNotice(null);
                        setProviderDeleteDialog({ id: provider.id, name: provider.displayName });
                      }}
                    />
                  </TabsContent>
                  <TabsContent className="space-y-3" value="zones">
                    <DnsZoneList
                      providerZonePanel={providerZonePanel}
                      activeZoneId={providerRecordPanel?.zoneId}
                      expanded={providerZonesExpanded}
                      onToggleExpanded={() => setProviderZonesExpanded((c) => !c)}
                      paginatedItems={paginatedZones.items}
                      page={paginatedZones.page}
                      totalPages={paginatedZones.totalPages}
                      total={paginatedZones.total}
                      onPageChange={setProviderZonesPage}
                      zoneFailureCooldowns={zoneFailureCooldowns}
                      loadingRecordsZoneKey={loadingRecordsZoneKey}
                      isChangeSetWorkspaceBusy={isChangeSetWorkspaceBusy}
                      onLoadRecords={(zone) => {
                        setChangeSetNotice(null);
                        loadProviderRecordsMutation.mutate({
                          providerId: providerZonePanel!.providerId,
                          zoneId: zone.id,
                          zoneName: zone.name,
                        });
                      }}
                    />
                  </TabsContent>

                  <TabsContent className="space-y-3" value="records">
                    {providerRecordPanel ? (
                      <div className="space-y-3 rounded-xl border border-border/60 bg-background/60 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/80 px-3 py-3">
                          <div>
                            <div className="text-sm font-medium">{providerRecordPanel.zoneName} · DNS Workspace</div>
                            <p className="text-xs text-muted-foreground">Records、Verification Health 和 DNS Change Set 现在为同级并排面板。</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <WorkspaceBadge variant="outline">Zone ID · {providerRecordPanel.zoneId}</WorkspaceBadge>
                            <WorkspaceBadge variant="outline">历史 {sortedChangeSetHistory.length}</WorkspaceBadge>
                            <WorkspaceBadge variant="outline">已验证 {verificationStatusSummary.verified}</WorkspaceBadge>
                            <WorkspaceBadge variant="outline">待修复 {verificationStatusSummary.drifted}</WorkspaceBadge>
                            <Button
                              disabled={isChangeSetWorkspaceBusy || loadingRecordsZoneKey === `${providerRecordPanel.providerId}:${providerRecordPanel.zoneId}`}
                              size="sm"
                              type="button"
                              variant="ghost"
                              onClick={() => {
                                setProviderZoneError(null);
                                void refreshProviderRecordWorkspace({ providerId: providerRecordPanel.providerId, zoneId: providerRecordPanel.zoneId, zoneName: providerRecordPanel.zoneName, preserveDesiredInput: true, force: true })
                                  .then(() => { setChangeSetNotice(`已刷新 ${providerRecordPanel.zoneName} 的 DNS 工作区。`); })
                                  .catch((error) => { setProviderZoneError(describeAdminProviderWorkspaceError(getAPIErrorMessage(error, "刷新 DNS 工作区失败"))); });
                              }}
                            >
                              <RefreshCcw className={loadingRecordsZoneKey === `${providerRecordPanel.providerId}:${providerRecordPanel.zoneId}` ? "size-4 animate-spin" : "size-4"} />
                              刷新当前 Zone
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <DnsRecordTable
                            records={providerRecordPanel.records}
                            paginatedItems={paginatedRecords.items}
                            page={paginatedRecords.page}
                            totalPages={paginatedRecords.totalPages}
                            total={paginatedRecords.total}
                            onPageChange={setProviderRecordsPage}
                            expanded={providerRecordsExpanded}
                            onToggleExpanded={() => setProviderRecordsExpanded((c) => !c)}
                            currentRecordProviderType={currentRecordProviderType}
                          />
                          <DnsVerificationSection
                            verificationProfiles={verificationProfiles}
                            expanded={verificationExpanded}
                            onToggleExpanded={() => setVerificationExpanded((c) => !c)}
                            onLoadRepairRecords={(profile) => {
                              setChangeSetNotice(`已载入 ${profile.verificationType} 修复建议。`);
                              setDesiredRecordsDraft((current) => applyVerificationRepairRecords(current, profile.repairRecords));
                            }}
                          />

                          <DnsChangesetEditor
                            expanded={changeSetEditorExpanded}
                            onToggleExpanded={() => setChangeSetEditorExpanded((c) => !c)}
                            desiredRecordsDraft={desiredRecordsDraft}
                            onDesiredRecordsDraftChange={setDesiredRecordsDraft}
                            paginatedItems={paginatedChangeSetEditorRecords.items}
                            page={paginatedChangeSetEditorRecords.page}
                            totalPages={paginatedChangeSetEditorRecords.totalPages}
                            total={paginatedChangeSetEditorRecords.total}
                            onPageChange={setChangeSetEditorPage}
                            zoneName={providerRecordPanel.zoneName}
                            currentRecords={providerRecordPanel.records}
                            isWorkspaceBusy={isChangeSetWorkspaceBusy}
                            changeSetError={changeSetError}
                            onDismissError={() => setChangeSetError(null)}
                            changeSetNotice={changeSetNotice}
                            onDismissNotice={() => setChangeSetNotice(null)}
                            changeSetPreview={changeSetPreview}
                            onSave={() => {
                              setChangeSetNotice(null);
                              saveProviderRecordsMutation.mutate({
                                providerId: providerRecordPanel.providerId,
                                zoneId: providerRecordPanel.zoneId,
                                zoneName: providerRecordPanel.zoneName,
                                records: editableToProviderRecords(desiredRecordsDraft),
                              });
                            }}
                            onPreview={() => {
                              setChangeSetNotice(null);
                              previewChangeSetMutation.mutate({
                                providerId: providerRecordPanel.providerId,
                                zoneId: providerRecordPanel.zoneId,
                                zoneName: providerRecordPanel.zoneName,
                                records: editableToProviderRecords(desiredRecordsDraft),
                              });
                            }}
                            onApply={() => {
                              setChangeSetNotice(null);
                              if (changeSetPreview) applyChangeSetMutation.mutate(changeSetPreview.id);
                            }}
                            isSaving={saveProviderRecordsMutation.isPending}
                            isPreviewing={previewChangeSetMutation.isPending}
                            isApplying={applyChangeSetMutation.isPending}
                          />

                          <DnsChangesetHistory
                            expanded={changeSetHistoryExpanded}
                            onToggleExpanded={() => setChangeSetHistoryExpanded((c) => !c)}
                            sortedHistory={sortedChangeSetHistory}
                            paginatedItems={paginatedChangeSetHistory.items}
                            page={paginatedChangeSetHistory.page}
                            totalPages={paginatedChangeSetHistory.totalPages}
                            total={paginatedChangeSetHistory.total}
                            onPageChange={setChangeSetHistoryPage}
                            selectedChangeSetID={selectedChangeSetID}
                            isWorkspaceBusy={isChangeSetWorkspaceBusy}
                            onReview={(item) => {
                              setChangeSetPreview(item);
                              setSelectedChangeSetID(item.id);
                              setChangeSetError(null);
                              setChangeSetNotice(`已载入历史 Change Set #${item.id}。`);
                            }}
                            onRestore={(item) => {
                              const records = restoreEditableRecordsFromChangeSet(providerRecordPanel?.records ?? [], item);
                              setDesiredRecordsDraft(records);
                              setChangeSetPreview(item);
                              setSelectedChangeSetID(item.id);
                              setChangeSetError(null);
                              setChangeSetNotice(`已从 Change Set #${item.id} 恢复到编辑器。`);
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <WorkspaceEmpty
                        title="先进入 Zone 工作区"
                        description={'在 Zone 页点击"查看 Records"后，这里会显示 Records、验证和 Change Set。'}
                      />
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <NoticeBanner variant="info">
            待验证域名、验证入口和域名级引导已移动到 `域名管理` 页面；这里现在只处理 Provider 账号、Zone、Records、Verification 和 Change Set。
          </NoticeBanner>
        </div>
      </WorkspacePanel>
    </WorkspacePage>
  );
}

