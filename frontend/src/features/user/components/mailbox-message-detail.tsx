import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  WorkspaceEmpty,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { decodeMimeHeaderValue } from "@/lib/mail-header";
import {
  BookOpen,
  BookX,
  Clock3,
  Copy,
  Check,
  Download,
  Inbox,
  Mail,
  Search,
  ShieldCheck,
  TimerReset,
  Trash2,
} from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  MailboxItem,
  MailboxMessage,
  MailboxMessageSummary,
  MessageExtractionResult,
} from "../api";
import { downloadMailboxMessageRaw } from "../api";
import { MetaCard, SecurityCard, ReceivedPathCard, ExtractionsCard } from "./mailbox-message-info-cards";
import { MessageContentCard } from "./mailbox-message-content";
import { AttachmentsCard } from "./mailbox-message-attachments";
import type { SecuritySummary, ReceivedTimelineItem } from "./mailbox-message-info-cards";
import type { MessageViewMode, HtmlPreview, RawPreview } from "./mailbox-message-content";

type Props = {
  selectedMailbox: MailboxItem | null;
  messages: MailboxMessageSummary[];
  effectiveSelectedMessageId: number | null;
  onSelectMessage: (messageId: number) => void;
  selectedMessageSummary: MailboxMessageSummary | null;
  selectedMessage: MailboxMessage | null;
  isMessagesLoading: boolean;
  isMessageDetailLoading: boolean;
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
  messagesSearchQuery: string;
  onMessagesSearchQueryChange: (value: string) => void;
  hasActiveMessagesSearch: boolean;
  messagesSearchPlaceholder: string;
  messagesNoResultsTitle: string;
  messagesNoResultsHint: string;
  onExtend: () => void;
  onRelease: () => void;
  isExtendPending: boolean;
  isReleasePending: boolean;
  onFeedback: (msg: string | null) => void;
  formatDate: (value: string) => string;
  formatRemainingHours: (value: string) => string;
  onBatchDelete?: (ids: number[]) => void;
  onBatchMarkRead?: (ids: number[], read: boolean) => void;
  isBatchPending?: boolean;
};

export function MailboxMessageDetail({
  selectedMailbox,
  messages,
  effectiveSelectedMessageId,
  onSelectMessage,
  selectedMessageSummary,
  selectedMessage,
  isMessagesLoading,
  isMessageDetailLoading,
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
  messagesSearchQuery,
  onMessagesSearchQueryChange,
  hasActiveMessagesSearch,
  messagesSearchPlaceholder,
  messagesNoResultsTitle,
  messagesNoResultsHint,
  onExtend,
  onRelease,
  isExtendPending,
  isReleasePending,
  onFeedback,
  formatDate,
  formatRemainingHours,
  onBatchDelete,
  onBatchMarkRead,
  isBatchPending,
}: Props) {
  const [headersExpanded, setHeadersExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const toggleMessageSelection = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === messages.length) {
        return new Set();
      }
      return new Set(messages.map((m) => m.id));
    });
  }, [messages]);

  const handleBatchDelete = useCallback(() => {
    if (!onBatchDelete || selectedIds.size === 0) return;
    onBatchDelete(Array.from(selectedIds));
    clearSelection();
  }, [onBatchDelete, selectedIds, clearSelection]);

  const handleBatchMarkRead = useCallback(
    (read: boolean) => {
      if (!onBatchMarkRead || selectedIds.size === 0) return;
      onBatchMarkRead(Array.from(selectedIds), read);
      clearSelection();
    },
    [onBatchMarkRead, selectedIds, clearSelection],
  );

  return (
    <WorkspacePanel
      className="xl:sticky xl:top-20"
      description={selectedMailbox ? (selectedMailbox.permanent ? "永久邮箱" : `到期时间 ${formatDate(selectedMailbox.expiresAt)}`) : "先从左侧选择一个邮箱。"}
      title={selectedMailbox?.address ?? "消息预览"}
    >
      {selectedMailbox ? (
        <div className="flex flex-col xl:h-[calc(100vh-12rem)]">
          <div className="shrink-0">
            <MailboxActions
              selectedMailbox={selectedMailbox}
              isExtendPending={isExtendPending}
              isReleasePending={isReleasePending}
              onExtend={onExtend}
              onRelease={onRelease}
              formatRemainingHours={formatRemainingHours}
            />
          </div>
          <div className="mt-4 max-h-[280px] min-h-[160px] shrink-0 overflow-y-auto rounded-md border border-border/40 bg-muted/5">
            <MessageList
              messages={messages}
              effectiveSelectedMessageId={effectiveSelectedMessageId}
              onSelectMessage={onSelectMessage}
              isLoading={isMessagesLoading}
              formatDate={formatDate}
              searchQuery={messagesSearchQuery}
              onSearchQueryChange={onMessagesSearchQueryChange}
              hasActiveSearch={hasActiveMessagesSearch}
              searchPlaceholder={messagesSearchPlaceholder}
              noResultsTitle={messagesNoResultsTitle}
              noResultsHint={messagesNoResultsHint}
              selectedIds={selectedIds}
              onToggleSelection={toggleMessageSelection}
              onToggleSelectAll={toggleSelectAll}
              onBatchDelete={handleBatchDelete}
              onBatchMarkRead={handleBatchMarkRead}
              isBatchPending={isBatchPending}
              mailboxAddress={selectedMailbox.address}
            />
          </div>
          {selectedMessageSummary ? (
            <Card className="mt-4 min-h-0 flex-1 overflow-y-auto border-border/60 bg-muted/10 shadow-none">
              <CardContent className="space-y-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">邮件详情</p>
                    <h3 className="text-base font-medium">{decodeMimeHeaderValue(selectedMessageSummary.subject) || "(无主题)"}</h3>
                  </div>
                  <Button
                    onClick={() => {
                      onFeedback(null);
                      void downloadMailboxMessageRaw(selectedMailbox.id, selectedMessageSummary.id).catch(() => {
                        onFeedback("下载原文失败，请稍后重试。");
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
                  <MetaCard label="发件人" value={decodeMimeHeaderValue(selectedMessageSummary.fromAddr)} />
                  <MetaCard label="收件人" value={decodeMimeHeaderValue(selectedMessageSummary.toAddr)} />
                  <MetaCard label="来源" value={selectedMessageSummary.sourceKind || "smtp"} />
                  <MetaCard label="接收时间" value={formatDate(selectedMessageSummary.receivedAt)} />
                </div>

                {isMessageDetailLoading && !selectedMessage ? (
                  <WorkspaceEmpty description="正在加载邮件详情，请稍候。" title="正在同步详情" />
                ) : selectedMessage ? (
                  <>
                    <SecurityCard messageSecuritySummary={messageSecuritySummary} />
                    <ReceivedPathCard receivedTimeline={receivedTimeline} />
                    <ExtractionsCard extractionsQuery={extractionsQuery} />
                    <MessageContentCard
                      selectedMessage={selectedMessage}
                      htmlPreview={htmlPreview}
                      rawPreview={rawPreview}
                      canAutoLoadRawPreview={canAutoLoadRawPreview}
                      rawPreviewRequested={rawPreviewRequested}
                      onRequestRawPreview={onRequestRawPreview}
                      isRawLoading={isRawLoading}
                      messageViewMode={messageViewMode}
                      onMessageViewModeChange={onMessageViewModeChange}
                      selectedMessageSummary={selectedMessageSummary}
                      onFeedback={onFeedback}
                    />
                    <AttachmentsCard
                      selectedMailbox={selectedMailbox}
                      selectedMessage={selectedMessage}
                      filteredHeaderEntries={filteredHeaderEntries}
                      headersSearch={headersSearch}
                      onHeadersSearchChange={onHeadersSearchChange}
                      headersExpanded={headersExpanded}
                      onHeadersExpandedChange={setHeadersExpanded}
                      onFeedback={onFeedback}
                    />
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
  );
}

function MailboxActions({
  selectedMailbox,
  isExtendPending,
  isReleasePending,
  onExtend,
  onRelease,
  formatRemainingHours,
}: {
  selectedMailbox: MailboxItem;
  isExtendPending: boolean;
  isReleasePending: boolean;
  onExtend: () => void;
  onRelease: () => void;
  formatRemainingHours: (value: string) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={isExtendPending} onClick={onExtend} size="sm" variant="secondary">
        <TimerReset className="size-4" />
        续期 24 小时
      </Button>
      <Button
        disabled={isReleasePending || selectedMailbox.status === "released"}
        onClick={onRelease}
        size="sm"
        variant="outline"
      >
        <Trash2 className="size-4" />
        {selectedMailbox.status === "released" ? "已释放" : "释放邮箱"}
      </Button>
      <Badge className="rounded-full" variant="outline">
        <Clock3 className="mr-1 size-3.5" />
        {selectedMailbox.permanent ? "永久" : `剩余 ${formatRemainingHours(selectedMailbox.expiresAt)}`}
      </Badge>
      <Badge className="rounded-full" variant={selectedMailbox.status === "active" ? "secondary" : "outline"}>
        <ShieldCheck className="mr-1 size-3.5" />
        {selectedMailbox.status === "active" ? "可接收邮件" : "已停止接收"}
      </Badge>
    </div>
  );
}

function MessageList({
  messages,
  effectiveSelectedMessageId,
  onSelectMessage,
  isLoading,
  formatDate,
  searchQuery,
  onSearchQueryChange,
  hasActiveSearch,
  searchPlaceholder,
  noResultsTitle,
  noResultsHint,
  selectedIds,
  onToggleSelection,
  onToggleSelectAll,
  onBatchDelete,
  onBatchMarkRead,
  isBatchPending,
  mailboxAddress,
}: {
  messages: MailboxMessageSummary[];
  effectiveSelectedMessageId: number | null;
  onSelectMessage: (messageId: number) => void;
  isLoading: boolean;
  formatDate: (value: string) => string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  hasActiveSearch: boolean;
  searchPlaceholder: string;
  noResultsTitle: string;
  noResultsHint: string;
  selectedIds: Set<number>;
  onToggleSelection: (id: number) => void;
  onToggleSelectAll: () => void;
  onBatchDelete: () => void;
  onBatchMarkRead: (read: boolean) => void;
  isBatchPending?: boolean;
  mailboxAddress?: string;
}) {
  const { t } = useTranslation();
  const allSelected = messages.length > 0 && selectedIds.size === messages.length;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
          value={searchQuery}
        />
      </div>
      {messages.length > 0 && (
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={onToggleSelectAll}
            aria-label={t("bulk.selectAll")}
          />
          <span className="text-xs text-muted-foreground">{t("bulk.selectAll")}</span>
        </div>
      )}
      {selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2">
          <span className="text-xs font-medium">{t("bulk.selected", { count: selectedIds.size })}</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={onBatchDelete}
            disabled={isBatchPending}
          >
            <Trash2 className="mr-1 size-3.5" />
            {t("bulk.delete")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onBatchMarkRead(true)}
            disabled={isBatchPending}
          >
            <BookOpen className="mr-1 size-3.5" />
            {t("bulk.markRead")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onBatchMarkRead(false)}
            disabled={isBatchPending}
          >
            <BookX className="mr-1 size-3.5" />
            {t("bulk.markUnread")}
          </Button>
        </div>
      )}
      {isLoading ? (
        <WorkspaceEmpty description="正在同步消息列表，请稍候。" title="正在加载消息" />
      ) : !messages.length && hasActiveSearch ? (
        <WorkspaceEmpty description={noResultsHint} title={noResultsTitle} />
      ) : !messages.length ? (
        <EmptyMailboxGuide address={mailboxAddress} />
      ) : (
        messages.map((message) => {
          const active = message.id === effectiveSelectedMessageId;
          const checked = selectedIds.has(message.id);
          return (
            <div className="flex items-start gap-2" key={message.id}>
              <Checkbox
                className="mt-5 shrink-0"
                checked={checked}
                onCheckedChange={() => onToggleSelection(message.id)}
                aria-label={`Select message ${message.id}`}
              />
              <button className="block w-full min-w-0 text-left" onClick={() => onSelectMessage(message.id)} type="button">
                <Card className={active ? "border-primary/40 bg-muted/20 shadow-none" : "border-border/60 bg-muted/10 shadow-none"}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className={`text-sm font-medium ${message.isRead ? "" : "font-semibold"}`}>
                          {message.subject ? `主题 · ${decodeMimeHeaderValue(message.subject)}` : "(无主题)"}
                        </div>
                        <p className="text-xs text-muted-foreground">{decodeMimeHeaderValue(message.fromAddr)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {!message.isRead && (
                          <span className="size-2 rounded-full bg-primary" title="未读" />
                        )}
                        <span className="text-xs text-muted-foreground">{formatDate(message.receivedAt)}</span>
                      </div>
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
            </div>
          );
        })
      )}
    </div>
  );
}

function EmptyMailboxGuide({ address }: { address?: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!address) return;
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [address]);

  return (
    <div className="rounded-xl border-2 border-dashed border-border/70 bg-card px-5 py-8 text-center">
      <div className="mx-auto max-w-sm space-y-4">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full border-2 border-dashed border-muted-foreground/30 bg-muted/30">
          <Mail className="size-6 text-muted-foreground/60" />
        </div>

        <div className="space-y-1.5">
          <p className="text-base font-medium">{t("emptyMailbox.title")}</p>
          <p className="text-sm leading-6 text-muted-foreground">
            {t("emptyMailbox.description")}
          </p>
        </div>

        {address && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                {t("emptyMailbox.addressLabel")}
              </div>
              <div className="mt-1 select-all font-mono text-sm font-medium">
                {address}
              </div>
            </div>

            <Button
              className="w-full"
              onClick={handleCopy}
              size="sm"
              variant="secondary"
            >
              {copied ? (
                <Check className="size-4" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? t("emptyMailbox.copied") : t("emptyMailbox.copyAddress")}
            </Button>

            <div className="space-y-1.5 text-left">
              <p className="text-[11px] text-muted-foreground">
                {t("emptyMailbox.curlHint")}
              </p>
              <pre className="overflow-x-auto rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-left font-mono text-[11px] leading-5 text-muted-foreground">
{`curl -X POST /api/v1/mailboxes/{id}/messages \\
  -H "Authorization: Bearer <token>"`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

