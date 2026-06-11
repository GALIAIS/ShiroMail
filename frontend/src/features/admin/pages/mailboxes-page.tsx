import { useCallback, useEffect, useMemo, useState } from "react";
import i18n from "@/lib/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { OptionCombobox } from "@/components/ui/option-combobox";
import { PaginationControls } from "@/components/ui/pagination-controls";
import {
  WorkspaceBadge,
  WorkspaceEmpty,
  WorkspaceField,
  WorkspaceMetric,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceStatusBadge,
} from "@/components/layout/workspace-ui";
import {
  buildMailHtmlDocument,
  buildMailHtmlPreview,
  buildRawPreview,
  collectInlineCIDTargets,
  extractReceivedTimeline,
  filterHeaderEntries,
  openHtmlPreviewWindow,
  resolveHtmlBody,
  resolveMessageBody,
  summarizeMessageHeaders,
} from "@/features/mail-preview";
import { decodeMimeHeaderValue } from "@/lib/mail-header";
import { paginateItems } from "@/lib/pagination";
import { useURLPagination } from "@/hooks/use-url-pagination";
import {
  Clock3,
  Download,
  FileText,
  Inbox,
  MailPlus,
  Paperclip,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  createAdminMailbox,
  fetchAdminMailboxMessageAttachmentBlob,
  downloadAdminMailboxMessageAttachment,
  downloadAdminMailboxMessageRaw,
  extendAdminMailbox,
  fetchAdminMailboxDomains,
  fetchAdminMailboxMessageDetail,
  fetchAdminMailboxMessageExtractions,
  fetchAdminMailboxMessageParsedRaw,
  fetchAdminMailboxMessageRawText,
  fetchAdminMailboxMessages,
  fetchAdminMailboxes,
  fetchAdminUsers,
  releaseAdminMailbox,
} from "../api";

type MessageViewMode = "text" | "html" | "raw";
const RAW_PREVIEW_AUTOMATIC_LIMIT = 512 * 1024;

const ttlOptions = [
  { label: "24 小时", value: "24", keywords: ["1 day", "24"] },
  { label: "72 小时", value: "72", keywords: ["3 days", "72"] },
  { label: "168 小时", value: "168", keywords: ["7 days", "168"] },
];
const mailboxAutoRefreshOptions = [
  { label: "手动刷新", value: "0", keywords: ["manual", "off", "0"] },
  { label: "5 秒", value: "5", keywords: ["5s", "5"] },
  { label: "15 秒", value: "15", keywords: ["15s", "15"] },
  { label: "30 秒", value: "30", keywords: ["30s", "30"] },
];
const ADMIN_MAILBOXES_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

function formatDate(value: string) {
  return new Intl.DateTimeFormat(i18n.language, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRemainingHours(value: string) {
  const diff = new Date(value).getTime() - Date.now();
  const hours = Math.max(0, Math.ceil(diff / (1000 * 60 * 60)));
  return `${hours} 小时`;
}

function blobToDataURL(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

export function AdminMailboxesPage() {
  const autoRefreshStorageKey = "shiro-email.admin-mailboxes.auto-refresh-seconds";
  const queryClient = useQueryClient();
  const [selectedMailboxId, setSelectedMailboxId] = useState<number | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [domainId, setDomainId] = useState("");
  const [ttlHours, setTtlHours] = useState<number>(24);
  const [localPart, setLocalPart] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { page: mailboxesPage, pageSize: mailboxesPageSize, setPage: setMailboxesPage, setPageSize: setMailboxesPageSize, resetPage: resetMailboxesPage } = useURLPagination({
    defaultPage: 1,
    defaultPageSize: ADMIN_MAILBOXES_PAGE_SIZE,
  });
  const [messageViewMode, setMessageViewMode] = useState<MessageViewMode>("text");
  const [cidImageSources, setCIDImageSources] = useState<Record<string, string>>({});
  const [headersExpanded, setHeadersExpanded] = useState(false);
  const [headersSearch, setHeadersSearch] = useState("");
  const [rawPreviewRequested, setRawPreviewRequested] = useState(false);
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState === "visible",
  );
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState(() => {
    if (typeof window === "undefined") {
      return 5;
    }
    const storedValue = window.localStorage.getItem(autoRefreshStorageKey);
    return storedValue && ["0", "5", "15", "30"].includes(storedValue) ? Number(storedValue) : 5;
  });

  const usersQuery = useQuery({
    queryKey: ["admin-users"],
    queryFn: fetchAdminUsers,
  });
  const mailboxDomainsQuery = useQuery({
    queryKey: ["admin-mailbox-domains"],
    queryFn: fetchAdminMailboxDomains,
  });
  const mailboxesQuery = useQuery({
    queryKey: ["admin-mailboxes"],
    queryFn: fetchAdminMailboxes,
  });

  const users = useMemo(() => usersQuery.data ?? [], [usersQuery.data]);
  const domains = useMemo(() => mailboxDomainsQuery.data ?? [], [mailboxDomainsQuery.data]);
  const mailboxes = useMemo(
    () => [...(mailboxesQuery.data ?? [])].sort((left, right) => right.id - left.id),
    [mailboxesQuery.data],
  );

  useEffect(() => {
    if (!users.length) {
      setSelectedUserId("");
      return;
    }
    setSelectedUserId((current) => {
      if (current && users.some((item) => String(item.id) === current)) {
        return current;
      }
      return String(users[0].id);
    });
  }, [users]);

  useEffect(() => {
    if (!domains.length) {
      setDomainId("");
      return;
    }
    setDomainId((current) => {
      if (current && domains.some((item) => String(item.id) === current)) {
        return current;
      }
      return String(domains[0].id);
    });
  }, [domains]);

  const filteredMailboxes = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();
    return mailboxes.filter((item) => {
      if (selectedUserId && String(item.userId) !== selectedUserId) {
        return false;
      }
      if (!keyword) {
        return item.status === "active";
      }
      return (
        item.status === "active" &&
        (item.address.toLowerCase().includes(keyword) ||
          item.ownerUsername.toLowerCase().includes(keyword) ||
          item.domain.toLowerCase().includes(keyword))
      );
    });
  }, [mailboxes, searchValue, selectedUserId]);
  const paginatedFilteredMailboxes = useMemo(
    () => paginateItems(filteredMailboxes, mailboxesPage, mailboxesPageSize),
    [filteredMailboxes, mailboxesPage, mailboxesPageSize],
  );

  useEffect(() => {
    if (!paginatedFilteredMailboxes.items.length) {
      setSelectedMailboxId(null);
      return;
    }
    setSelectedMailboxId((current) => {
      if (current && paginatedFilteredMailboxes.items.some((item) => item.id === current)) {
        return current;
      }
      return paginatedFilteredMailboxes.items[0].id;
    });
  }, [paginatedFilteredMailboxes.items]);

  const selectedMailbox = useMemo(
    () => paginatedFilteredMailboxes.items.find((item) => item.id === selectedMailboxId) ?? null,
    [paginatedFilteredMailboxes.items, selectedMailboxId],
  );

  const messagesQuery = useQuery({
    queryKey: ["admin-mailbox-messages", selectedMailboxId],
    queryFn: () => fetchAdminMailboxMessages(selectedMailboxId!),
    enabled: Boolean(selectedMailboxId),
    staleTime: 10_000,
  });
  const selectedMessageSummary = useMemo(
    () => (messagesQuery.data ?? []).find((item) => item.id === selectedMessageId) ?? null,
    [messagesQuery.data, selectedMessageId],
  );

  const selectedMessageQuery = useQuery({
    queryKey: ["admin-mailbox-message-detail", selectedMailboxId, selectedMessageSummary?.id ?? null],
    queryFn: () => fetchAdminMailboxMessageDetail(selectedMailboxId!, selectedMessageSummary!.id),
    enabled: Boolean(selectedMailboxId && selectedMessageSummary),
    staleTime: 10_000,
  });
  const canAutoLoadRawPreview = (selectedMessageSummary?.sizeBytes ?? 0) <= RAW_PREVIEW_AUTOMATIC_LIMIT;
  const selectedMessageRawQuery = useQuery({
    queryKey: ["admin-mailbox-message-raw", selectedMailboxId, selectedMessageSummary?.id ?? null],
    queryFn: () => fetchAdminMailboxMessageRawText(selectedMailboxId!, selectedMessageSummary!.id),
    enabled: Boolean(
      selectedMailboxId &&
      selectedMessageSummary &&
      messageViewMode === "raw" &&
      (canAutoLoadRawPreview || rawPreviewRequested),
    ),
    staleTime: 10_000,
  });
  const selectedMessageParsedRawQuery = useQuery({
    queryKey: ["admin-mailbox-message-parsed-raw", selectedMailboxId, selectedMessageSummary?.id ?? null],
    queryFn: () => fetchAdminMailboxMessageParsedRaw(selectedMailboxId!, selectedMessageSummary!.id),
    enabled: Boolean(selectedMailboxId && selectedMessageSummary && messageViewMode === "html"),
    staleTime: 10_000,
  });
  const selectedMessageExtractionsQuery = useQuery({
    queryKey: ["admin-mailbox-message-extractions", selectedMailboxId, selectedMessageSummary?.id ?? null],
    queryFn: () => fetchAdminMailboxMessageExtractions(selectedMailboxId!, selectedMessageSummary!.id),
    enabled: Boolean(selectedMailboxId && selectedMessageSummary),
    staleTime: 10_000,
  });

  useEffect(() => {
    setRawPreviewRequested(false);
  }, [selectedMailboxId, selectedMessageId]);

  useEffect(() => {
    const messages = messagesQuery.data ?? [];
    if (!messages.length) {
      setSelectedMessageId(null);
      return;
    }
    setSelectedMessageId((current) => {
      if (current && messages.some((item) => item.id === current)) {
        return current;
      }
      return messages[0].id;
    });
  }, [messagesQuery.data, selectedMailboxId]);

  const selectedMessage = selectedMessageQuery.data ?? null;
  const resolvedHTMLBody = useMemo(
    () => (selectedMessage ? resolveHtmlBody(selectedMessage) : ""),
    [selectedMessage],
  );
  const htmlPreview = useMemo(
    () => (resolvedHTMLBody ? buildMailHtmlPreview(resolvedHTMLBody, cidImageSources) : null),
    [cidImageSources, resolvedHTMLBody],
  );
  const rawPreview = useMemo(
    () => (selectedMessageRawQuery.data ? buildRawPreview(selectedMessageRawQuery.data) : null),
    [selectedMessageRawQuery.data],
  );
  const filteredHeaderEntries = useMemo(
    () => filterHeaderEntries(selectedMessage?.headers ?? {}, headersSearch, decodeMimeHeaderValue),
    [headersSearch, selectedMessage?.headers],
  );
  const messageSecuritySummary = useMemo(
    () => summarizeMessageHeaders(selectedMessage?.headers ?? {}, decodeMimeHeaderValue),
    [selectedMessage?.headers],
  );
  const receivedTimeline = useMemo(
    () => extractReceivedTimeline(selectedMessage?.headers ?? {}),
    [selectedMessage?.headers],
  );
  const isRefreshing =
    usersQuery.isRefetching ||
    mailboxDomainsQuery.isRefetching ||
    mailboxesQuery.isRefetching ||
    messagesQuery.isRefetching ||
    selectedMessageQuery.isRefetching ||
    selectedMessageExtractionsQuery.isRefetching ||
    selectedMessageParsedRawQuery.isRefetching ||
    selectedMessageRawQuery.isRefetching;
  const refreshMailboxWorkspace = useCallback(async () => {
    await usersQuery.refetch();
    await mailboxDomainsQuery.refetch();
    await mailboxesQuery.refetch();
    if (!selectedMailboxId) {
      return;
    }
    await messagesQuery.refetch();
    if (!selectedMessageSummary) {
      return;
    }
    await selectedMessageQuery.refetch();
    await selectedMessageExtractionsQuery.refetch();
    if (messageViewMode === "html") {
      await selectedMessageParsedRawQuery.refetch();
    }
    if (messageViewMode === "raw") {
      await selectedMessageRawQuery.refetch();
    }
  }, [
    mailboxDomainsQuery,
    mailboxesQuery,
    messageViewMode,
    messagesQuery,
    selectedMailboxId,
    selectedMessageSummary,
    selectedMessageQuery,
    selectedMessageExtractionsQuery,
    selectedMessageParsedRawQuery,
    selectedMessageRawQuery,
    usersQuery,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState === "visible");
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(autoRefreshStorageKey, String(autoRefreshSeconds));
  }, [autoRefreshSeconds, autoRefreshStorageKey]);

  useEffect(() => {
    if (!pageVisible || autoRefreshSeconds <= 0) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      void refreshMailboxWorkspace();
    }, autoRefreshSeconds * 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoRefreshSeconds, pageVisible, refreshMailboxWorkspace]);

  useEffect(() => {
    if (messageViewMode !== "html" || !selectedMessageParsedRawQuery.data || !selectedMailboxId || !selectedMessageSummary) {
      setCIDImageSources((current) => (Object.keys(current).length ? {} : current));
      return undefined;
    }

    const inlineTargets = collectInlineCIDTargets(selectedMessageParsedRawQuery.data.attachments);
    if (!inlineTargets.length) {
      setCIDImageSources((current) => (Object.keys(current).length ? {} : current));
      return undefined;
    }

    let cancelled = false;

    void Promise.all(
      inlineTargets.map(async (target) => {
        const blob = await fetchAdminMailboxMessageAttachmentBlob(
          selectedMailboxId,
          selectedMessageSummary.id,
          target.attachmentIndex,
        );
        return [target.contentId, await blobToDataURL(blob)] as const;
      }),
    )
      .then((entries) => {
        if (cancelled) {
          return;
        }
        setCIDImageSources(Object.fromEntries(entries));
      })
      .catch(() => {
        if (!cancelled) {
          setFeedback("部分内联图片加载失败，已保留正文预览。");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    messageViewMode,
    selectedMailboxId,
    selectedMessageSummary,
    selectedMessageParsedRawQuery.data,
  ]);

  function invalidateMailboxData() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-mailboxes"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-overview"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-mailbox-messages"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-mailbox-message-detail"] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: createAdminMailbox,
    onSuccess: async (created) => {
      setFeedback(`已创建邮箱 ${created.address}`);
      setLocalPart("");
      await invalidateMailboxData();
      resetMailboxesPage();
      setSelectedMailboxId(created.id);
      setSelectedUserId(String(created.userId));
    },
    onError: () => {
      setFeedback("创建邮箱失败，请检查域名验证状态或稍后重试。");
    },
  });

  const extendMutation = useMutation({
    mutationFn: ({ mailboxId, expiresInHours }: { mailboxId: number; expiresInHours: number }) =>
      extendAdminMailbox(mailboxId, expiresInHours),
    onSuccess: async (updated) => {
      setFeedback(`已为 ${updated.address} 延长 24 小时`);
      await invalidateMailboxData();
    },
    onError: () => {
      setFeedback("续期失败，请稍后重试。");
    },
  });

  const releaseMutation = useMutation({
    mutationFn: releaseAdminMailbox,
    onSuccess: async (updated) => {
      await invalidateMailboxData();
      setSelectedMailboxId((current) => (current === updated.id ? null : current));
      setSelectedMessageId(null);
      setFeedback(`已释放邮箱 ${updated.address}`);
    },
    onError: () => {
      setFeedback("释放邮箱失败，请稍后重试。");
    },
  });

  const activeCount = mailboxes.filter((item) => item.status === "active").length;
  const selectedUserMailboxCount = selectedUserId
    ? mailboxes.filter((item) => String(item.userId) === selectedUserId && item.status === "active").length
    : activeCount;

  return (
    <WorkspacePage>
      <AlertDialog open={releaseDialogOpen} onOpenChange={setReleaseDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>释放邮箱？</AlertDialogTitle>
            <AlertDialogDescription>
              {selectedMailbox
                ? `确认释放邮箱 ${selectedMailbox.address}？释放后它会立即从当前列表中移除。`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!selectedMailbox) {
                  return;
                }
                setFeedback(null);
                releaseMutation.mutate(selectedMailbox.id);
                setReleaseDialogOpen(false);
              }}
            >
              确认释放
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.92fr]">
        <div className="space-y-6">
          <WorkspacePanel
            action={
              <div className="flex flex-wrap items-center gap-2">
                <OptionCombobox
                  ariaLabel="邮箱自动刷新时间"
                  className="h-9 w-[96px] min-w-[96px]"
                  contentClassName="w-[112px] min-w-[112px]"
                  emptyLabel="没有匹配的刷新时间"
                  onValueChange={(value) => setAutoRefreshSeconds(Number(value || 0))}
                  options={mailboxAutoRefreshOptions}
                  placeholder="自动刷新"
                  searchPlaceholder="搜索刷新时间"
                  value={String(autoRefreshSeconds)}
                />
                <Button onClick={() => void refreshMailboxWorkspace()} size="sm" variant="secondary">
                  <RefreshCw className={`size-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  刷新
                </Button>
              </div>
            }
            description="管理员可直接代用户创建邮箱、续期、释放并查看收件内容。"
            title="邮箱管理"
          >
            <div className="grid gap-4 md:grid-cols-4">
              <WorkspaceMetric label="活跃邮箱" value={activeCount} />
              <WorkspaceMetric label="用户总数" value={users.length} />
              <WorkspaceMetric label="可用域名" value={domains.length} />
              <WorkspaceMetric label="当前筛选邮箱" value={selectedUserMailboxCount} />
            </div>

            <Card className="border-border/60 bg-muted/10 shadow-none">
              <CardContent className="space-y-4 py-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <MailPlus className="size-4" />
                  <span>创建新邮箱</span>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <WorkspaceField label="目标用户">
                    <OptionCombobox
                      ariaLabel="选择用户"
                      emptyLabel="没有匹配用户"
                      onValueChange={setSelectedUserId}
                      options={users.map((user) => ({
                        value: String(user.id),
                        label: `${user.username} · ${user.email}`,
                        keywords: [user.username, user.email],
                      }))}
                      placeholder="选择用户"
                      searchPlaceholder="搜索用户"
                      value={selectedUserId}
                    />
                  </WorkspaceField>

                  <WorkspaceField label="域名">
                    <OptionCombobox
                      ariaLabel="选择域名"
                      emptyLabel="没有匹配域名"
                      onValueChange={setDomainId}
                      options={domains.map((domain) => ({
                        value: String(domain.id),
                        label: domain.domain,
                        keywords: [domain.rootDomain, domain.kind, domain.visibility],
                      }))}
                      placeholder="选择域名"
                      searchPlaceholder="搜索域名"
                      value={domainId}
                    />
                  </WorkspaceField>
                </div>

                <div className="grid gap-4 md:grid-cols-[1fr_180px_auto]">
                  <WorkspaceField label="邮箱前缀">
                    <Input
                      onChange={(event) => setLocalPart(event.target.value)}
                      placeholder="留空则自动生成"
                      value={localPart}
                    />
                  </WorkspaceField>

                  <WorkspaceField label="有效期">
                    <OptionCombobox
                      ariaLabel="邮箱有效期"
                      emptyLabel="没有匹配的有效期"
                      onValueChange={(value) => setTtlHours(Number(value))}
                      options={ttlOptions}
                      placeholder="选择有效期"
                      searchPlaceholder="搜索有效期"
                      value={String(ttlHours)}
                    />
                  </WorkspaceField>

                  <div className="flex items-end">
                    <Button
                      className="w-full md:w-auto"
                      disabled={!selectedUserId || !domainId || createMutation.isPending}
                      onClick={() => {
                        if (!selectedUserId || !domainId) {
                          return;
                        }
                        setFeedback(null);
                        createMutation.mutate({
                          userId: Number(selectedUserId),
                          domainId: Number(domainId),
                          expiresInHours: ttlHours,
                          localPart: localPart.trim() || undefined,
                        });
                      }}
                    >
                      <MailPlus className="size-4" />
                      {createMutation.isPending ? "创建中..." : "创建邮箱"}
                    </Button>
                  </div>
                </div>

                {feedback ? <div className="text-xs text-muted-foreground">{feedback}</div> : null}
              </CardContent>
            </Card>
          </WorkspacePanel>

          <WorkspacePanel description="管理员可按用户筛选并切换邮箱，右侧直接查看消息。" title="当前邮箱">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <WorkspaceField label="筛选用户">
                <OptionCombobox
                  ariaLabel="筛选用户"
                  emptyLabel="没有匹配用户"
                  onValueChange={setSelectedUserId}
                  options={users.map((user) => ({
                    value: String(user.id),
                    label: `${user.username} · ${user.email}`,
                    keywords: [user.username, user.email],
                  }))}
                  placeholder="选择用户"
                  searchPlaceholder="搜索用户"
                  value={selectedUserId}
                />
              </WorkspaceField>
              <WorkspaceField label="搜索邮箱">
                <Input
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="按邮箱 / 用户 / 域名搜索"
                  value={searchValue}
                />
              </WorkspaceField>
            </div>

            {mailboxesQuery.isLoading ? (
              <WorkspaceEmpty description="正在同步邮箱列表，请稍候。" title="正在加载邮箱列表" />
            ) : !filteredMailboxes.length ? (
              <WorkspaceEmpty description="当前筛选条件下还没有活跃邮箱。" title="还没有可用邮箱" />
            ) : (
              <div className="space-y-3">
                {paginatedFilteredMailboxes.items.map((mailbox) => {
                  const active = mailbox.id === selectedMailboxId;
                  return (
                    <button
                      className="block w-full text-left"
                      key={mailbox.id}
                      onClick={() => {
                        setSelectedMailboxId(mailbox.id);
                        setSelectedMessageId(null);
                      }}
                      type="button"
                    >
                      <Card className={active ? "border-primary/40 bg-muted/20 shadow-none" : "border-border/60 bg-muted/10 shadow-none"}>
                        <CardContent className="space-y-3 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="text-sm font-medium">{mailbox.address}</div>
                              <p className="text-xs text-muted-foreground">
                                {mailbox.ownerUsername} · {mailbox.domain}
                              </p>
                            </div>
                            <WorkspaceStatusBadge status={mailbox.status}>
                              {mailbox.status === "active" ? "活跃" : mailbox.status}
                            </WorkspaceStatusBadge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{mailbox.permanent ? "永久邮箱" : `剩余 ${formatRemainingHours(mailbox.expiresAt)}`}</span>
                            <span>更新于 {formatDate(mailbox.updatedAt)}</span>
                          </div>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
                <PaginationControls
                  itemLabel="邮箱"
                  onPageChange={setMailboxesPage}
                  onPageSizeChange={setMailboxesPageSize}
                  page={paginatedFilteredMailboxes.page}
                  pageSize={mailboxesPageSize}
                  pageSizeOptions={PAGE_SIZE_OPTIONS}
                  showPageSizeSelector
                  total={paginatedFilteredMailboxes.total}
                  totalPages={paginatedFilteredMailboxes.totalPages}
                />
              </div>
            )}
          </WorkspacePanel>
        </div>

        <WorkspacePanel
          description={selectedMailbox ? (selectedMailbox.permanent ? `归属 ${selectedMailbox.ownerUsername} · 永久邮箱` : `归属 ${selectedMailbox.ownerUsername} · 到期 ${formatDate(selectedMailbox.expiresAt)}`) : "先从左侧选择一个邮箱。"}
          title={selectedMailbox?.address ?? "消息预览"}
        >
          {selectedMailbox ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  disabled={extendMutation.isPending}
                  onClick={() => {
                    setFeedback(null);
                    extendMutation.mutate({ mailboxId: selectedMailbox.id, expiresInHours: 24 });
                  }}
                  size="sm"
                  variant="secondary"
                >
                  <TimerReset className="size-4" />
                  续期 24 小时
                </Button>
                <Button
                  disabled={releaseMutation.isPending || selectedMailbox.status === "released"}
                  onClick={() => setReleaseDialogOpen(true)}
                  size="sm"
                  variant="outline"
                >
                  <Trash2 className="size-4" />
                  {selectedMailbox.status === "released" ? "已释放" : "释放邮箱"}
                </Button>
                <Badge className="rounded-full" variant="outline">
                  <UserRound className="mr-1 size-3.5" />
                  {selectedMailbox.ownerUsername}
                </Badge>
                <Badge className="rounded-full" variant="outline">
                  <Clock3 className="mr-1 size-3.5" />
                  {selectedMailbox.permanent ? "永久" : `剩余 ${formatRemainingHours(selectedMailbox.expiresAt)}`}
                </Badge>
                <Badge className="rounded-full" variant={selectedMailbox.status === "active" ? "secondary" : "outline"}>
                  <ShieldCheck className="mr-1 size-3.5" />
                  {selectedMailbox.status === "active" ? "可接收邮件" : "已停止接收"}
                </Badge>
              </div>

              <div className="space-y-3">
                {messagesQuery.isLoading ? (
                  <WorkspaceEmpty description="正在同步消息列表，请稍候。" title="正在加载消息" />
                ) : !(messagesQuery.data?.length ?? 0) ? (
                  <WorkspaceEmpty description="这个邮箱当前还没有消息，等待新的邮件到达。" title="还没有消息" />
                ) : (
                  messagesQuery.data?.map((message) => {
                    const active = message.id === selectedMessageId;
                    return (
                      <button
                        className="block w-full text-left"
                        key={message.id}
                        onClick={() => setSelectedMessageId(message.id)}
                        type="button"
                      >
                        <Card className={active ? "border-primary/40 bg-muted/20 shadow-none" : "border-border/60 bg-muted/10 shadow-none"}>
                          <CardContent className="space-y-3 py-4">
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1">
                                <div className="text-sm font-medium">
                                  {message.subject ? `主题 · ${decodeMimeHeaderValue(message.subject)}` : "(无主题)"}
                                </div>
                                <p className="text-xs text-muted-foreground">{decodeMimeHeaderValue(message.fromAddr)}</p>
                              </div>
                              <span className="text-xs text-muted-foreground">{formatDate(message.receivedAt)}</span>
                            </div>
                            <p className="line-clamp-2 text-sm leading-6 text-muted-foreground">
                              {message.textPreview || message.htmlPreview || "暂无预览内容"}
                            </p>
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <Inbox className="size-3.5" />
                                {decodeMimeHeaderValue(message.toAddr)}
                              </span>
                              <span>{message.attachmentCount} 个附件</span>
                            </div>
                          </CardContent>
                        </Card>
                      </button>
                    );
                  })
                )}
              </div>

              {selectedMessageSummary ? (
                <Card className="border-border/60 bg-muted/10 shadow-none">
                  <CardContent className="space-y-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">邮件详情</p>
                        <h3 className="text-base font-medium">{decodeMimeHeaderValue(selectedMessageSummary.subject) || "(无主题)"}</h3>
                      </div>

                      <Button
                        onClick={() => {
                          if (!selectedMailbox) {
                            return;
                          }
                          setFeedback(null);
                          void downloadAdminMailboxMessageRaw(selectedMailbox.id, selectedMessageSummary.id).catch(() => {
                            setFeedback("下载原文失败，请稍后重试。");
                          });
                        }}
                        size="sm"
                        variant="secondary"
                      >
                        <Download className="size-4" />
                        下载原文
                      </Button>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <MetaCard label="归属邮箱" value={selectedMailbox.address} />
                      <MetaCard label="发件人" value={decodeMimeHeaderValue(selectedMessageSummary.fromAddr)} />
                      <MetaCard label="收件人" value={decodeMimeHeaderValue(selectedMessageSummary.toAddr)} />
                      <MetaCard label="接收时间" value={formatDate(selectedMessageSummary.receivedAt)} />
                    </div>

                    {selectedMessageQuery.isLoading && !selectedMessage ? (
                      <WorkspaceEmpty description="正在加载邮件详情，请稍候。" title="正在同步详情" />
                    ) : selectedMessage ? (
                      <>
                        <Card className="border-border/60 bg-background/60 shadow-none">
                          <CardContent className="space-y-3 py-4">
                            <div className="text-sm font-medium">投递与认证摘要</div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <SecurityStatusCard label="SPF" value={messageSecuritySummary.spf} />
                              <SecurityStatusCard label="DKIM" value={messageSecuritySummary.dkim} />
                              <SecurityStatusCard label="DMARC" value={messageSecuritySummary.dmarc} />
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <MetaCard label="Reply-To" value={messageSecuritySummary.replyTo} />
                              <MetaCard label="Return-Path" value={messageSecuritySummary.returnPath} />
                              <MetaCard label="Message-ID" value={messageSecuritySummary.messageId} />
                            </div>
                          </CardContent>
                        </Card>

                        <Card className="border-border/60 bg-background/60 shadow-none">
                          <CardContent className="space-y-3 py-4">
                            <div className="text-sm font-medium">Received 路径</div>
                            {receivedTimeline.length ? (
                              <div className="space-y-3">
                                {receivedTimeline.map((item, index) => (
                                  <div className="rounded-xl border border-border/60 bg-muted/10 p-3" key={`${item.date}-${index}`}>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <WorkspaceBadge variant="outline">#{index + 1}</WorkspaceBadge>
                                      <span className="text-xs text-muted-foreground">{item.date || "时间未知"}</span>
                                    </div>
                                    <div className="mt-2 text-sm font-medium">{item.route}</div>
                                    {item.raw ? (
                                      <pre className="mt-2 whitespace-pre-wrap break-all text-xs leading-6 text-muted-foreground">
                                        {item.raw}
                                      </pre>
                                    ) : null}
                                    {item.isRawTruncated ? (
                                      <p className="mt-2 text-[11px] text-muted-foreground">
                                        该节点原始头已截断，完整内容请查看 Raw 原文。
                                      </p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <WorkspaceEmpty description="当前邮件没有可解析的 Received 路径。" title="暂无投递路径" />
                            )}
                          </CardContent>
                        </Card>

                        <Card className="border-border/60 bg-background/60 shadow-none">
                          <CardContent className="space-y-3 py-4">
                            <div className="text-sm font-medium">提取结果</div>
                            {selectedMessageExtractionsQuery.isLoading ? (
                              <WorkspaceEmpty description="正在分析这封邮件命中的默认提取模板。" title="正在计算提取结果" />
                            ) : selectedMessageExtractionsQuery.data?.items.length ? (
                              <div className="space-y-3">
                                {selectedMessageExtractionsQuery.data.items.map((item, index) => (
                                  <div className="rounded-xl border border-border/60 bg-muted/10 p-3" key={`${item.ruleId}-${item.sourceField}-${index}`}>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <WorkspaceBadge variant="outline">{item.label || item.ruleName}</WorkspaceBadge>
                                      <span className="text-xs text-muted-foreground">{item.sourceField}</span>
                                    </div>
                                    <div className="mt-2 whitespace-pre-wrap break-all text-sm leading-6">
                                      {item.values?.length ? item.values.join("\n") : item.value}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <WorkspaceEmpty description="当前邮件没有命中任何已启用的默认提取模板。" title="暂无提取结果" />
                            )}
                          </CardContent>
                        </Card>

                        <Card className="border-border/60 bg-background/60 shadow-none">
                          <CardContent className="space-y-2 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="inline-flex items-center gap-2 text-sm font-medium">
                                <FileText className="size-4" />
                                邮件内容
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {messageViewMode === "html" && htmlPreview ? (
                                  <Button
                                    size="sm"
                                    type="button"
                                    variant="outline"
                                    onClick={() => openHtmlPreviewWindow(htmlPreview.html)}
                                  >
                                    新窗口打开
                                  </Button>
                                ) : null}
                                <div className="inline-flex rounded-lg border border-border/60 bg-muted/20 p-1">
                                  {[
                                    { value: "text" as const, label: "文本" },
                                    { value: "html" as const, label: "HTML" },
                                    { value: "raw" as const, label: "Raw" },
                                  ].map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      className={`rounded-md px-3 py-1.5 text-xs transition ${
                                        messageViewMode === option.value
                                          ? "bg-foreground text-background"
                                          : "text-muted-foreground hover:text-foreground"
                                      }`}
                                      onClick={() => setMessageViewMode(option.value)}
                                    >
                                      {option.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                            {messageViewMode === "html" ? (
                              htmlPreview ? (
                                <div className="space-y-3">
                                  {htmlPreview.notices.length ? (
                                    <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
                                      {htmlPreview.notices.map((notice) => (
                                        <p key={notice}>{notice}</p>
                                      ))}
                                    </div>
                                  ) : null}
                                  <iframe
                                    className="min-h-[420px] w-full rounded-xl border border-border/60 bg-white"
                                    sandbox="allow-same-origin"
                                    srcDoc={buildMailHtmlDocument(htmlPreview.html)}
                                    title="HTML 邮件预览"
                                    onLoad={(event) => {
                                      const frame = event.currentTarget;
                                      const doc = frame.contentDocument;
                                      const height = doc?.documentElement?.scrollHeight ?? doc?.body?.scrollHeight ?? 420;
                                      frame.style.height = `${Math.max(height + 8, 420)}px`;
                                    }}
                                  />
                                </div>
                              ) : (
                                <WorkspaceEmpty description="这封邮件没有可展示的 HTML 正文。" title="暂无 HTML 内容" />
                              )
                            ) : null}
                            {messageViewMode === "raw" ? (
                              !canAutoLoadRawPreview && !rawPreviewRequested ? (
                                <div className="space-y-3">
                                  <div className="rounded-xl border border-border/60 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
                                    这封邮件体积约 {Math.max(1, Math.round((selectedMessageSummary.sizeBytes || 0) / 1024))} KB。
                                    为避免页面卡顿，Raw 预览默认不自动加载；你仍可下载原文，或手动加载截断预览。
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      size="sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => setRawPreviewRequested(true)}
                                    >
                                      加载 Raw 预览
                                    </Button>
                                  </div>
                                </div>
                              ) : selectedMessageRawQuery.isLoading ? (
                                <WorkspaceEmpty description="正在读取原始邮件内容，请稍候。" title="正在加载 Raw" />
                              ) : rawPreview ? (
                                <div className="space-y-3">
                                  {rawPreview.isTruncated ? (
                                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3 text-xs leading-6 text-muted-foreground">
                                      Raw 体积较大，页面仅展示前 {Math.max(1, Math.round(rawPreview.preview.length / 1024))} KB 预览。
                                      完整原文请使用上方“下载原文”。
                                    </div>
                                  ) : null}
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                                      <div className="mb-2 text-xs font-medium text-foreground">Raw Headers</div>
                                      <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-muted-foreground">
                                        {rawPreview.headers || "暂无 Header 原文。"}
                                      </pre>
                                    </div>
                                    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                                      <div className="mb-2 text-xs font-medium text-foreground">Raw Body</div>
                                      <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap break-all text-xs leading-6 text-muted-foreground">
                                        {rawPreview.body || "暂无 Body 原文。"}
                                      </pre>
                                    </div>
                                  </div>
                                  <div className="flex justify-end">
                                    <Button
                                      size="sm"
                                      type="button"
                                      variant="outline"
                                      onClick={() => {
                                        void navigator.clipboard.writeText(rawPreview.preview).then(
                                          () => setFeedback(rawPreview.isTruncated ? "Raw 预览已复制，完整原文请下载。" : "Raw 原文已复制。"),
                                          () => setFeedback(rawPreview.isTruncated ? "复制 Raw 预览失败，请改用下载原文。" : "复制 Raw 原文失败，请手动复制。"),
                                        );
                                      }}
                                    >
                                      {rawPreview.isTruncated ? "复制预览" : "复制 Raw"}
                                    </Button>
                                  </div>
                                  <pre className="max-h-[320px] overflow-auto rounded-xl border border-border/60 bg-muted/20 p-4 text-xs leading-6 text-muted-foreground whitespace-pre-wrap break-all">
                                    {rawPreview.preview}
                                  </pre>
                                </div>
                              ) : (
                                <WorkspaceEmpty description="当前邮件没有可读取的 Raw 原文。" title="Raw 不可用" />
                              )
                            ) : null}
                            {messageViewMode === "text" ? (
                              <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                                {resolveMessageBody(selectedMessage)}
                              </p>
                            ) : null}
                          </CardContent>
                        </Card>

                        <Card className="border-border/60 bg-background/60 shadow-none">
                          <CardContent className="space-y-3 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="inline-flex items-center gap-2 text-sm font-medium">
                                <Paperclip className="size-4" />
                                附件
                              </div>
                              <Button
                                size="sm"
                                type="button"
                                variant="ghost"
                                onClick={() => setHeadersExpanded((current) => !current)}
                              >
                                {headersExpanded ? "收起 Headers" : "查看 Headers"}
                              </Button>
                            </div>
                            {headersExpanded ? (
                              <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3">
                                <Input
                                  onChange={(event) => setHeadersSearch(event.target.value)}
                                  placeholder="搜索 Header 名称或内容"
                                  value={headersSearch}
                                />
                                {filteredHeaderEntries.length ? (
                                  filteredHeaderEntries.map(([key, values]) => (
                                    <div className="space-y-1" key={key}>
                                      <div className="text-xs font-medium text-foreground">{key}</div>
                                      <pre className="whitespace-pre-wrap break-all text-xs leading-6 text-muted-foreground">
                                        {values.join("\n")}
                                      </pre>
                                    </div>
                                  ))
                                ) : (
                                  <WorkspaceEmpty
                                    description={
                                      Object.keys(selectedMessage.headers ?? {}).length
                                        ? "没有匹配的 Header，请换个关键词再试。"
                                        : "当前邮件没有可展示的原始头信息。"
                                    }
                                    title={Object.keys(selectedMessage.headers ?? {}).length ? "未找到匹配 Header" : "暂无 Headers"}
                                  />
                                )}
                              </div>
                            ) : null}
                            {(selectedMessage.attachments ?? []).length ? (
                              <div className="space-y-3">
                                {(selectedMessage.attachments ?? []).map((attachment, index) => (
                                  <div
                                    className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/10 px-4 py-3 md:flex-row md:items-center md:justify-between"
                                    key={`${attachment.storageKey}-${index}`}
                                  >
                                    <div className="space-y-1">
                                      <div className="text-sm font-medium">{attachment.fileName}</div>
                                      <p className="text-xs text-muted-foreground">
                                        {attachment.contentType || "application/octet-stream"} · {attachment.sizeBytes} bytes
                                      </p>
                                    </div>
                                    <Button
                                      onClick={() => {
                                        if (!selectedMailbox) {
                                          return;
                                        }
                                        setFeedback(null);
                                        void downloadAdminMailboxMessageAttachment(
                                          selectedMailbox.id,
                                          selectedMessage.id,
                                          index,
                                        ).catch(() => {
                                          setFeedback(`下载附件 ${attachment.fileName} 失败，请稍后重试。`);
                                        });
                                      }}
                                      size="sm"
                                      variant="outline"
                                    >
                                      <Download className="size-4" />
                                      下载附件
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <WorkspaceEmpty description="这封邮件没有附件。" title="没有附件" />
                            )}
                          </CardContent>
                        </Card>
                      </>
                    ) : (
                      <WorkspaceEmpty description="暂时无法加载这封邮件详情，请刷新重试。" title="详情不可用" />
                    )}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          ) : (
            <WorkspaceEmpty description="选择邮箱后，这里会展示最近收到的邮件。" title="还没有选中邮箱" />
          )}
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}

function MetaCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="border-border/60 bg-background/60 shadow-none">
      <CardContent className="space-y-1 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <p className="text-sm font-medium break-all">{decodeMimeHeaderValue(value)}</p>
      </CardContent>
    </Card>
  );
}

function SecurityStatusCard({ label, value }: { label: string; value: string }) {
  const normalized = value.toLowerCase();
  const tone =
    normalized.includes("pass") || normalized.includes("通过")
      ? "success"
      : normalized.includes("fail") || normalized.includes("reject")
        ? "danger"
        : normalized.includes("none") || normalized.includes("unknown") || normalized.includes("未")
          ? "warning"
          : undefined;

  return (
    <Card className="border-border/60 bg-background/60 shadow-none">
      <CardContent className="space-y-2 py-4">
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <WorkspaceStatusBadge status={value} tone={tone}>
            {value}
          </WorkspaceStatusBadge>
        </div>
      </CardContent>
    </Card>
  );
}
