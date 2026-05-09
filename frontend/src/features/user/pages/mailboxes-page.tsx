import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
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
import { OptionCombobox } from "@/components/ui/option-combobox";
import {
  WorkspaceMetric,
  WorkspacePage,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import {
  buildMailHtmlPreview,
  buildRawPreview,
  collectInlineCIDTargets,
  extractReceivedTimeline,
  filterHeaderEntries,
  resolveHtmlBody,
  summarizeMessageHeaders,
} from "@/features/mail-preview";
import { decodeMimeHeaderValue } from "@/lib/mail-header";
import { paginateItems } from "@/lib/pagination";
import { validateIntegerRange, validateMailboxLocalPart, validateSelection } from "@/lib/validation";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import { useDebounce } from "@/hooks/use-debounce";
import {
  createCustomMailbox,
  extendMailbox,
  fetchDashboard,
  fetchMailboxMessageAttachmentBlob,
  fetchMailboxMessageDetail,
  fetchMailboxMessageExtractions,
  fetchMailboxMessageParsedRaw,
  fetchMailboxMessageRawText,
  fetchMailboxMessages,
  releaseMailbox,
} from "../api";
import { MailboxCreateForm } from "../components/mailbox-create-form";
import { MailboxList } from "../components/mailbox-list";
import { MailboxMessageDetail } from "../components/mailbox-message-detail";
import { useMessageMutations } from "../hooks/use-message-mutations";

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
const allowedMailboxTTLValues = ttlOptions.map((item) => Number(item.value));
const USER_MAILBOXES_PAGE_SIZE = 8;

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

export function UserMailboxPage() {
  const { t } = useTranslation();
  const autoRefreshStorageKey = "shiro-email.user-mailboxes.auto-refresh-seconds";
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedMailboxId, setSelectedMailboxId] = useState<number | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [mailboxesPage, setMailboxesPage] = useState(1);
  const [domainId, setDomainId] = useState("");
  const [ttlHours, setTtlHours] = useState<number>(24);
  const [localPart, setLocalPart] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [releaseDialogOpen, setReleaseDialogOpen] = useState(false);
  const [messageViewMode, setMessageViewMode] = useState<MessageViewMode>("text");
  const [cidImageSources, setCIDImageSources] = useState<Record<string, string>>({});
  const [headersSearch, setHeadersSearch] = useState("");
  const [rawPreviewRequested, setRawPreviewRequested] = useState(false);
  const [messagesSearchQuery, setMessagesSearchQuery] = useState("");
  const debouncedMessagesSearch = useDebounce(messagesSearchQuery, 300);
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

  const dashboardQuery = useQuery({
    queryKey: ["user-dashboard"],
    queryFn: fetchDashboard,
  });

  const mailboxes = useMemo(
    () => [...(dashboardQuery.data?.mailboxes ?? [])].sort((left, right) => right.id - left.id),
    [dashboardQuery.data?.mailboxes],
  );
  const domains = useMemo(() => dashboardQuery.data?.availableDomains ?? [], [dashboardQuery.data?.availableDomains]);
  const effectiveDomainId = useMemo(() => {
    if (!domains.length) {
      return "";
    }
    const requestedDomainId = searchParams.get("domainId");
    if (requestedDomainId && domains.some((item) => String(item.id) === requestedDomainId)) {
      return requestedDomainId;
    }
    if (domainId && domains.some((item) => String(item.id) === domainId)) {
      return domainId;
    }
    return String(domains[0].id);
  }, [domainId, domains, searchParams]);
  const paginatedMailboxes = useMemo(
    () => paginateItems(mailboxes, mailboxesPage, USER_MAILBOXES_PAGE_SIZE),
    [mailboxes, mailboxesPage],
  );
  const effectiveSelectedMailboxId = useMemo(() => {
    if (!paginatedMailboxes.items.length) {
      return null;
    }
    if (selectedMailboxId && paginatedMailboxes.items.some((item) => item.id === selectedMailboxId)) {
      return selectedMailboxId;
    }
    return paginatedMailboxes.items[0].id;
  }, [paginatedMailboxes.items, selectedMailboxId]);

  const selectedMailbox = useMemo(
    () => paginatedMailboxes.items.find((item) => item.id === effectiveSelectedMailboxId) ?? null,
    [effectiveSelectedMailboxId, paginatedMailboxes.items],
  );

  const effectiveMessagesSearch = debouncedMessagesSearch.length >= 2 ? debouncedMessagesSearch : "";

  const messagesQuery = useQuery({
    queryKey: ["mailbox-messages", effectiveSelectedMailboxId, effectiveMessagesSearch],
    queryFn: () => fetchMailboxMessages(effectiveSelectedMailboxId!, effectiveMessagesSearch || undefined),
    enabled: Boolean(effectiveSelectedMailboxId),
    staleTime: 10_000,
  });

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const effectiveSelectedMessageId = useMemo(() => {
    if (!messages.length) {
      return null;
    }
    if (selectedMessageId && messages.some((item) => item.id === selectedMessageId)) {
      return selectedMessageId;
    }
    return messages[0].id;
  }, [messages, selectedMessageId]);
  const selectedMessageSummary = useMemo(
    () => messages.find((item) => item.id === effectiveSelectedMessageId) ?? null,
    [effectiveSelectedMessageId, messages],
  );

  const selectedMessageQuery = useQuery({
    queryKey: ["mailbox-message-detail", effectiveSelectedMailboxId, effectiveSelectedMessageId],
    queryFn: () => fetchMailboxMessageDetail(effectiveSelectedMailboxId!, selectedMessageSummary!.id),
    enabled: Boolean(effectiveSelectedMailboxId && selectedMessageSummary),
    staleTime: 10_000,
  });
  const canAutoLoadRawPreview = (selectedMessageSummary?.sizeBytes ?? 0) <= RAW_PREVIEW_AUTOMATIC_LIMIT;
  const selectedMessageRawQuery = useQuery({
    queryKey: ["mailbox-message-raw", effectiveSelectedMailboxId, effectiveSelectedMessageId],
    queryFn: () => fetchMailboxMessageRawText(effectiveSelectedMailboxId!, selectedMessageSummary!.id),
    enabled: Boolean(
      effectiveSelectedMailboxId &&
      selectedMessageSummary &&
      messageViewMode === "raw" &&
      (canAutoLoadRawPreview || rawPreviewRequested),
    ),
    staleTime: 10_000,
  });
  const selectedMessageParsedRawQuery = useQuery({
    queryKey: ["mailbox-message-parsed-raw", effectiveSelectedMailboxId, effectiveSelectedMessageId],
    queryFn: () => fetchMailboxMessageParsedRaw(effectiveSelectedMailboxId!, selectedMessageSummary!.id),
    enabled: Boolean(
      effectiveSelectedMailboxId &&
      selectedMessageSummary &&
      messageViewMode === "html",
    ),
    staleTime: 10_000,
  });
  const selectedMessageExtractionsQuery = useQuery({
    queryKey: ["mailbox-message-extractions", effectiveSelectedMailboxId, effectiveSelectedMessageId],
    queryFn: () => fetchMailboxMessageExtractions(effectiveSelectedMailboxId!, selectedMessageSummary!.id),
    enabled: Boolean(effectiveSelectedMailboxId && selectedMessageSummary),
    staleTime: 10_000,
  });

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
    dashboardQuery.isRefetching ||
    messagesQuery.isRefetching ||
    selectedMessageQuery.isRefetching ||
    selectedMessageExtractionsQuery.isRefetching ||
    selectedMessageParsedRawQuery.isRefetching ||
    selectedMessageRawQuery.isRefetching;
  const refreshMailboxWorkspace = useCallback(async () => {
    await dashboardQuery.refetch();
    if (!effectiveSelectedMailboxId) {
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
    dashboardQuery,
    effectiveSelectedMailboxId,
    selectedMessageSummary,
    messageViewMode,
    messagesQuery,
    selectedMessageExtractionsQuery,
    selectedMessageQuery,
    selectedMessageParsedRawQuery,
    selectedMessageRawQuery,
  ]);

  useEffect(() => {
    setRawPreviewRequested(false);
  }, [effectiveSelectedMailboxId, effectiveSelectedMessageId]);

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
    if (messageViewMode !== "html" || !selectedMessageParsedRawQuery.data || !effectiveSelectedMailboxId || !selectedMessageSummary) {
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
        const blob = await fetchMailboxMessageAttachmentBlob(
          effectiveSelectedMailboxId,
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
    effectiveSelectedMailboxId,
    selectedMessageSummary,
    messageViewMode,
    selectedMessageParsedRawQuery.data,
  ]);

  function invalidateMailboxData() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ["user-dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["mailbox-messages"] }),
      queryClient.invalidateQueries({ queryKey: ["mailbox-message-detail"] }),
    ]);
  }

  const createMutation = useMutation({
    mutationFn: createCustomMailbox,
    onSuccess: async (created) => {
      setFeedback(`已创建邮箱 ${created.address}`);
      setLocalPart("");
      await invalidateMailboxData();
      setMailboxesPage(1);
      setSelectedMailboxId(created.id);
    },
    onError: () => {
      setFeedback("创建邮箱失败，请稍后重试。");
    },
  });

  function handleCreateMailbox() {
    const domainError = validateSelection("域名", effectiveDomainId, domains.map((item) => String(item.id)));
    if (domainError) {
      setFeedback(domainError);
      return;
    }
    const ttlError =
      validateIntegerRange("有效期", ttlHours, { min: 24, max: 168 }) ||
      (!allowedMailboxTTLValues.includes(ttlHours) ? "有效期无效，请重新选择。": null);
    if (ttlError) {
      setFeedback(ttlError);
      return;
    }
    const localPartError = validateMailboxLocalPart(localPart);
    if (localPartError) {
      setFeedback(localPartError);
      return;
    }
    setFeedback(null);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("domainId", effectiveDomainId);
      return next;
    }, { replace: true });
    createMutation.mutate({
      domainId: Number(effectiveDomainId),
      expiresInHours: ttlHours,
      localPart: localPart.trim().toLowerCase(),
    });
  }

  const extendMutation = useMutation({
    mutationFn: ({ mailboxId, expiresInHours }: { mailboxId: number; expiresInHours: number }) =>
      extendMailbox(mailboxId, expiresInHours),
    onSuccess: async (updated) => {
      setFeedback(`已为 ${updated.address} 延长 24 小时`);
      await invalidateMailboxData();
    },
    onError: () => {
      setFeedback("续期失败，请稍后重试。");
    },
  });

  const releaseMutation = useMutation({
    mutationFn: releaseMailbox,
    onSuccess: async (updated) => {
      queryClient.setQueryData(["user-dashboard"], (current: Awaited<ReturnType<typeof fetchDashboard>> | undefined) => {
        if (!current) {
          return current;
        }
        const nextMailboxes = current.mailboxes.filter((item) => item.id !== updated.id);
        return {
          ...current,
          mailboxes: nextMailboxes,
          totalMailboxCount: nextMailboxes.length,
          activeMailboxCount: nextMailboxes.length,
        };
      });
      queryClient.removeQueries({ queryKey: ["mailbox-messages", updated.id], exact: true });
      setSelectedMailboxId((current) => (current === updated.id ? null : current));
      setSelectedMessageId(null);
      setFeedback("邮箱已删除");
    },
    onError: () => {
      setFeedback("释放邮箱失败，请稍后重试。");
    },
  });

  const effectiveMessagesSearchForMutations = debouncedMessagesSearch.length >= 2 ? debouncedMessagesSearch : "";
  const { batchDeleteMutation, batchMarkReadMutation } = useMessageMutations(
    effectiveSelectedMailboxId,
    effectiveMessagesSearchForMutations,
  );

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
            description="创建新的临时邮箱、延长有效期并查看当前收件状态。"
            title="邮箱管理"
          >
            <div className="grid gap-4 md:grid-cols-3">
              <WorkspaceMetric label="邮箱总数" value={dashboardQuery.data?.totalMailboxCount ?? 0} />
              <WorkspaceMetric label="活跃邮箱" value={dashboardQuery.data?.activeMailboxCount ?? 0} />
              <WorkspaceMetric label="可用域名" value={domains.length} />
            </div>

            <MailboxCreateForm
              domains={domains}
              effectiveDomainId={effectiveDomainId}
              onDomainIdChange={setDomainId}
              ttlHours={ttlHours}
              onTtlHoursChange={setTtlHours}
              localPart={localPart}
              onLocalPartChange={setLocalPart}
              feedback={feedback}
              isPending={createMutation.isPending}
              onSubmit={handleCreateMailbox}
            />
          </WorkspacePanel>

          <MailboxList
            isLoading={dashboardQuery.isLoading}
            hasMailboxes={mailboxes.length > 0}
            paginatedMailboxes={paginatedMailboxes}
            effectiveSelectedMailboxId={effectiveSelectedMailboxId}
            onSelectMailbox={(id) => {
              setSelectedMailboxId(id);
              setSelectedMessageId(null);
              setMessagesSearchQuery("");
            }}
            onPageChange={setMailboxesPage}
            pageSize={USER_MAILBOXES_PAGE_SIZE}
            formatDate={formatDate}
            formatRemainingHours={formatRemainingHours}
          />
        </div>

        <MailboxMessageDetail
          selectedMailbox={selectedMailbox}
          messages={messages}
          effectiveSelectedMessageId={effectiveSelectedMessageId}
          onSelectMessage={setSelectedMessageId}
          selectedMessageSummary={selectedMessageSummary}
          selectedMessage={selectedMessage}
          isMessagesLoading={messagesQuery.isLoading}
          isMessageDetailLoading={selectedMessageQuery.isLoading}
          messageSecuritySummary={messageSecuritySummary}
          receivedTimeline={receivedTimeline}
          extractionsQuery={selectedMessageExtractionsQuery}
          htmlPreview={htmlPreview}
          rawPreview={rawPreview}
          canAutoLoadRawPreview={canAutoLoadRawPreview}
          rawPreviewRequested={rawPreviewRequested}
          onRequestRawPreview={() => setRawPreviewRequested(true)}
          isRawLoading={selectedMessageRawQuery.isLoading}
          filteredHeaderEntries={filteredHeaderEntries}
          headersSearch={headersSearch}
          onHeadersSearchChange={setHeadersSearch}
          messageViewMode={messageViewMode}
          onMessageViewModeChange={setMessageViewMode}
          messagesSearchQuery={messagesSearchQuery}
          onMessagesSearchQueryChange={setMessagesSearchQuery}
          hasActiveMessagesSearch={Boolean(effectiveMessagesSearch)}
          messagesSearchPlaceholder={t("mailboxSearch.placeholder")}
          messagesNoResultsTitle={t("mailboxSearch.noResults")}
          messagesNoResultsHint={t("mailboxSearch.noResultsHint")}
          onExtend={() => {
            if (!selectedMailbox) return;
            setFeedback(null);
            extendMutation.mutate({ mailboxId: selectedMailbox.id, expiresInHours: 24 });
          }}
          onRelease={() => setReleaseDialogOpen(true)}
          isExtendPending={extendMutation.isPending}
          isReleasePending={releaseMutation.isPending}
          onFeedback={setFeedback}
          formatDate={formatDate}
          formatRemainingHours={formatRemainingHours}
          onBatchDelete={(ids) => batchDeleteMutation.mutate(ids)}
          onBatchMarkRead={(ids, read) => batchMarkReadMutation.mutate({ ids, read })}
          isBatchPending={batchDeleteMutation.isPending || batchMarkReadMutation.isPending}
        />
      </div>
    </WorkspacePage>
  );
}
