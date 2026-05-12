import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceEmpty, WorkspacePage } from "@/components/layout/workspace-ui";
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
import { useDebounce } from "@/hooks/use-debounce";
import {
  ArrowLeft,
  Download,
  Inbox,
  Paperclip,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/lib/i18n";
import {
  downloadMailboxMessageRaw,
  fetchDashboard,
  fetchMailboxMessageAttachmentBlob,
  fetchMailboxMessageDetail,
  fetchMailboxMessageExtractions,
  fetchMailboxMessageParsedRaw,
  fetchMailboxMessageRawText,
  fetchMailboxMessages,
} from "../api";
import type { MailboxItem, MailboxMessage, MailboxMessageSummary, MessageExtractionResult } from "../api";
import { MetaCard, SecurityCard, ReceivedPathCard, ExtractionsCard } from "../components/mailbox-message-info-cards";
import type { SecuritySummary, ReceivedTimelineItem } from "../components/mailbox-message-info-cards";
import { MessageContentCard } from "../components/mailbox-message-content";
import { AttachmentsCard } from "../components/mailbox-message-attachments";
import type { MessageViewMode, HtmlPreview, RawPreview } from "../components/mailbox-message-content";

const RAW_PREVIEW_AUTOMATIC_LIMIT = 512 * 1024;

function formatDate(value: string) {
  return new Intl.DateTimeFormat(i18n.language, {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatRelativeTime(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return i18n.language === "zh-CN" ? "刚刚" : "just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function blobToDataURL(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("failed to read blob"));
    reader.readAsDataURL(blob);
  });
}

export function InboxPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const mailboxId = Number(id);

  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const effectiveSearch = debouncedSearch.length >= 2 ? debouncedSearch : "";

  const [messageViewMode, setMessageViewMode] = useState<MessageViewMode>("text");
  const [cidImageSources, setCIDImageSources] = useState<Record<string, string>>({});
  const [headersSearch, setHeadersSearch] = useState("");
  const [rawPreviewRequested, setRawPreviewRequested] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ["user-dashboard"],
    queryFn: fetchDashboard,
  });

  const mailbox = useMemo(
    () => dashboardQuery.data?.mailboxes.find((m) => m.id === mailboxId) ?? null,
    [dashboardQuery.data?.mailboxes, mailboxId],
  );

  const messagesQuery = useQuery({
    queryKey: ["mailbox-messages", mailboxId, effectiveSearch],
    queryFn: () => fetchMailboxMessages(mailboxId, effectiveSearch || undefined),
    enabled: Boolean(mailboxId),
    staleTime: 10_000,
  });

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const unreadCount = useMemo(() => messages.filter((m) => !m.isRead).length, [messages]);

  const effectiveMessageId = useMemo(() => {
    if (selectedMessageId && messages.some((m) => m.id === selectedMessageId)) {
      return selectedMessageId;
    }
    return null;
  }, [messages, selectedMessageId]);

  const selectedSummary = useMemo(
    () => messages.find((m) => m.id === effectiveMessageId) ?? null,
    [messages, effectiveMessageId],
  );

  const detailQuery = useQuery({
    queryKey: ["mailbox-message-detail", mailboxId, effectiveMessageId],
    queryFn: () => fetchMailboxMessageDetail(mailboxId, effectiveMessageId!),
    enabled: Boolean(mailboxId && effectiveMessageId),
    staleTime: 10_000,
  });

  const canAutoLoadRawPreview = (selectedSummary?.sizeBytes ?? 0) <= RAW_PREVIEW_AUTOMATIC_LIMIT;

  const rawQuery = useQuery({
    queryKey: ["mailbox-message-raw", mailboxId, effectiveMessageId],
    queryFn: () => fetchMailboxMessageRawText(mailboxId, effectiveMessageId!),
    enabled: Boolean(
      mailboxId && effectiveMessageId && messageViewMode === "raw" && (canAutoLoadRawPreview || rawPreviewRequested),
    ),
    staleTime: 10_000,
  });

  const parsedRawQuery = useQuery({
    queryKey: ["mailbox-message-parsed-raw", mailboxId, effectiveMessageId],
    queryFn: () => fetchMailboxMessageParsedRaw(mailboxId, effectiveMessageId!),
    enabled: Boolean(mailboxId && effectiveMessageId && messageViewMode === "html"),
    staleTime: 10_000,
  });

  const extractionsQuery = useQuery({
    queryKey: ["mailbox-message-extractions", mailboxId, effectiveMessageId],
    queryFn: () => fetchMailboxMessageExtractions(mailboxId, effectiveMessageId!),
    enabled: Boolean(mailboxId && effectiveMessageId),
    staleTime: 10_000,
  });

  const selectedMessage = detailQuery.data ?? null;

  const resolvedHTMLBody = useMemo(
    () => (selectedMessage ? resolveHtmlBody(selectedMessage) : ""),
    [selectedMessage],
  );
  const htmlPreview = useMemo(
    () => (resolvedHTMLBody ? buildMailHtmlPreview(resolvedHTMLBody, cidImageSources) : null),
    [cidImageSources, resolvedHTMLBody],
  );
  const rawPreview = useMemo(
    () => (rawQuery.data ? buildRawPreview(rawQuery.data) : null),
    [rawQuery.data],
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

  useEffect(() => {
    setRawPreviewRequested(false);
  }, [effectiveMessageId]);

  useEffect(() => {
    if (messageViewMode !== "html" || !parsedRawQuery.data || !mailboxId || !effectiveMessageId) {
      setCIDImageSources((current) => (Object.keys(current).length ? {} : current));
      return undefined;
    }
    const inlineTargets = collectInlineCIDTargets(parsedRawQuery.data.attachments);
    if (!inlineTargets.length) {
      setCIDImageSources((current) => (Object.keys(current).length ? {} : current));
      return undefined;
    }
    let cancelled = false;
    void Promise.all(
      inlineTargets.map(async (target) => {
        const blob = await fetchMailboxMessageAttachmentBlob(mailboxId, effectiveMessageId, target.attachmentIndex);
        return [target.contentId, await blobToDataURL(blob)] as const;
      }),
    )
      .then((entries) => {
        if (!cancelled) setCIDImageSources(Object.fromEntries(entries));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [mailboxId, effectiveMessageId, messageViewMode, parsedRawQuery.data]);

  const handleSelectMessage = useCallback((msgId: number) => {
    setSelectedMessageId(msgId);
    setMobileShowDetail(true);
    setMessageViewMode("text");
    setHeadersSearch("");
  }, []);

  const handleBack = useCallback(() => {
    setMobileShowDetail(false);
  }, []);

  return (
    <WorkspacePage className="h-[calc(100vh-8rem)]">
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-card">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/dashboard/mailboxes")}
            >
              <ArrowLeft className="size-4" />
              <span className="hidden sm:inline">{t("inbox.backToMailboxes")}</span>
            </Button>
            <div className="hidden sm:block">
              <h1 className="text-sm font-medium">{mailbox?.address ?? t("inbox.title")}</h1>
              <p className="text-xs text-muted-foreground">
                {t("inbox.messageCount", { count: messages.length })}
                {unreadCount > 0 && ` · ${t("inbox.unreadCount", { count: unreadCount })}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Inbox className="size-4 text-muted-foreground" />
          </div>
        </div>

        {/* Body: master-detail split */}
        <div className="flex min-h-0 flex-1">
          {/* Message list panel */}
          <div
            className={`flex w-full flex-col border-r border-border/60 md:w-1/3 ${
              mobileShowDetail ? "hidden md:flex" : "flex"
            }`}
          >
            <div className="border-b border-border/60 px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="h-8 pl-8 text-sm"
                  placeholder={t("inbox.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <VirtualizedMessageList
              messages={messages}
              isLoading={messagesQuery.isLoading}
              effectiveMessageId={effectiveMessageId}
              effectiveSearch={effectiveSearch}
              onSelect={handleSelectMessage}
            />
          </div>

          {/* Detail panel */}
          <div
            className={`flex w-full flex-col md:w-2/3 ${
              mobileShowDetail ? "flex" : "hidden md:flex"
            }`}
          >
            {/* Mobile back button */}
            <div className="flex items-center border-b border-border/60 px-3 py-2 md:hidden">
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="size-4" />
                {t("inbox.backToList")}
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {!effectiveMessageId ? (
                <div className="flex h-full items-center justify-center">
                  <WorkspaceEmpty
                    description={t("inbox.selectMessageHint")}
                    title={t("inbox.noMessageSelected")}
                  />
                </div>
              ) : detailQuery.isLoading && !selectedMessage ? (
                <WorkspaceEmpty description={t("inbox.loadingDetail")} title="" />
              ) : selectedMessage && selectedSummary ? (
                <MessageDetail
                  mailboxId={mailboxId}
                  summary={selectedSummary}
                  message={selectedMessage}
                  messageSecuritySummary={messageSecuritySummary}
                  receivedTimeline={receivedTimeline}
                  extractionsQuery={extractionsQuery}
                  htmlPreview={htmlPreview}
                  rawPreview={rawPreview}
                  canAutoLoadRawPreview={canAutoLoadRawPreview}
                  rawPreviewRequested={rawPreviewRequested}
                  onRequestRawPreview={() => setRawPreviewRequested(true)}
                  isRawLoading={rawQuery.isLoading}
                  filteredHeaderEntries={filteredHeaderEntries}
                  headersSearch={headersSearch}
                  onHeadersSearchChange={setHeadersSearch}
                  messageViewMode={messageViewMode}
                  onMessageViewModeChange={setMessageViewMode}
                  mailbox={mailbox}
                />
              ) : (
                <WorkspaceEmpty description={t("inbox.detailUnavailable")} title="" />
              )}
            </div>
          </div>
        </div>
      </div>
    </WorkspacePage>
  );
}

function VirtualizedMessageList({
  messages,
  isLoading,
  effectiveMessageId,
  effectiveSearch,
  onSelect,
}: {
  messages: MailboxMessageSummary[];
  isLoading: boolean;
  effectiveMessageId: number | null;
  effectiveSearch: string;
  onSelect: (id: number) => void;
}) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 5,
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-4">
        <WorkspaceEmpty description={t("inbox.loading")} title="" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 p-4">
        <WorkspaceEmpty
          description={effectiveSearch ? t("inbox.noSearchResults") : t("inbox.emptyInbox")}
          title={effectiveSearch ? t("inbox.noResultsTitle") : t("inbox.emptyTitle")}
        />
      </div>
    );
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto">
      <div
        className="relative w-full"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = messages[virtualRow.index];
          return (
            <div
              key={msg.id}
              className="absolute left-0 top-0 w-full"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <MessageListItem
                message={msg}
                active={msg.id === effectiveMessageId}
                onSelect={onSelect}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MessageListItem({
  message,
  active,
  onSelect,
}: {
  message: MailboxMessageSummary;
  active: boolean;
  onSelect: (id: number) => void;
}) {
  const subject = decodeMimeHeaderValue(message.subject) || "(No subject)";
  const sender = decodeMimeHeaderValue(message.fromAddr);
  const preview = message.textPreview || message.htmlPreview || "";

  return (
    <button
      type="button"
      className={`block w-full px-4 py-3 text-left transition-colors hover:bg-muted/30 ${
        active ? "bg-muted/40 border-l-2 border-l-primary" : ""
      }`}
      onClick={() => onSelect(message.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {!message.isRead && (
              <span className="size-2 shrink-0 rounded-full bg-primary" />
            )}
            <span
              className={`truncate text-sm ${message.isRead ? "text-foreground" : "font-semibold text-foreground"}`}
            >
              {sender}
            </span>
          </div>
          <p className={`mt-0.5 truncate text-sm ${message.isRead ? "text-muted-foreground" : "font-medium text-foreground"}`}>
            {subject}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {preview}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="text-xs text-muted-foreground">{formatRelativeTime(message.receivedAt)}</span>
          {message.hasAttachments && <Paperclip className="size-3 text-muted-foreground" />}
        </div>
      </div>
    </button>
  );
}

function MessageDetail({
  mailboxId,
  summary,
  message,
  messageSecuritySummary,
  receivedTimeline,
  extractionsQuery,
  htmlPreview,
  rawPreview,
  canAutoLoadRawPreview,
  rawPreviewRequested,
  onRequestRawPreview,
  isRawLoading,
  filteredHeaderEntries,
  headersSearch,
  onHeadersSearchChange,
  messageViewMode,
  onMessageViewModeChange,
  mailbox,
}: {
  mailboxId: number;
  summary: MailboxMessageSummary;
  message: MailboxMessage;
  messageSecuritySummary: SecuritySummary;
  receivedTimeline: ReceivedTimelineItem[];
  extractionsQuery: { isLoading: boolean; data?: MessageExtractionResult };
  htmlPreview: HtmlPreview | null;
  rawPreview: RawPreview | null;
  canAutoLoadRawPreview: boolean;
  rawPreviewRequested: boolean;
  onRequestRawPreview: () => void;
  isRawLoading: boolean;
  filteredHeaderEntries: (readonly [string, string[]])[];
  headersSearch: string;
  onHeadersSearchChange: (value: string) => void;
  messageViewMode: MessageViewMode;
  onMessageViewModeChange: (mode: MessageViewMode) => void;
  mailbox: MailboxItem | null;
}) {
  const [headersExpanded, setHeadersExpanded] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-medium">
            {decodeMimeHeaderValue(summary.subject) || "(No subject)"}
          </h2>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>{decodeMimeHeaderValue(summary.fromAddr)}</span>
            <span>{formatDate(summary.receivedAt)}</span>
          </div>
        </div>
        <Button
          onClick={() => {
            setFeedback(null);
            void downloadMailboxMessageRaw(mailboxId, summary.id).catch(() => {
              setFeedback("Download failed. Please try again.");
            });
          }}
          size="sm"
          variant="secondary"
        >
          <Download className="size-4" />
          Download .eml
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetaCard label="From" value={decodeMimeHeaderValue(summary.fromAddr)} />
        <MetaCard label="To" value={decodeMimeHeaderValue(summary.toAddr)} />
      </div>

      <SecurityCard messageSecuritySummary={messageSecuritySummary} />
      <ReceivedPathCard receivedTimeline={receivedTimeline} />
      <ExtractionsCard extractionsQuery={extractionsQuery} />

      <MessageContentCard
        selectedMessage={message}
        htmlPreview={htmlPreview}
        rawPreview={rawPreview}
        canAutoLoadRawPreview={canAutoLoadRawPreview}
        rawPreviewRequested={rawPreviewRequested}
        onRequestRawPreview={onRequestRawPreview}
        isRawLoading={isRawLoading}
        messageViewMode={messageViewMode}
        onMessageViewModeChange={onMessageViewModeChange}
        selectedMessageSummary={summary}
        onFeedback={setFeedback}
      />

      {mailbox && (
        <AttachmentsCard
          selectedMailbox={mailbox}
          selectedMessage={message}
          filteredHeaderEntries={filteredHeaderEntries}
          headersSearch={headersSearch}
          onHeadersSearchChange={onHeadersSearchChange}
          headersExpanded={headersExpanded}
          onHeadersExpandedChange={setHeadersExpanded}
          onFeedback={setFeedback}
        />
      )}

      {feedback && (
        <p className="text-xs text-muted-foreground">{feedback}</p>
      )}
    </div>
  );
}
