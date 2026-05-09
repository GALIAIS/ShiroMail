import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  WorkspaceEmpty,
  WorkspacePanel,
} from "@/components/layout/workspace-ui";
import { decodeMimeHeaderValue } from "@/lib/mail-header";
import {
  Clock3,
  Download,
  Inbox,
  Search,
  ShieldCheck,
  TimerReset,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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
}: Props) {
  const [headersExpanded, setHeadersExpanded] = useState(false);

  return (
    <WorkspacePanel
      description={selectedMailbox ? `到期时间 ${formatDate(selectedMailbox.expiresAt)}` : "先从左侧选择一个邮箱。"}
      title={selectedMailbox?.address ?? "消息预览"}
    >
      {selectedMailbox ? (
        <div className="space-y-4">
          <MailboxActions
            selectedMailbox={selectedMailbox}
            isExtendPending={isExtendPending}
            isReleasePending={isReleasePending}
            onExtend={onExtend}
            onRelease={onRelease}
            formatRemainingHours={formatRemainingHours}
          />
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
          />
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
        剩余 {formatRemainingHours(selectedMailbox.expiresAt)}
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
}) {
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
      {isLoading ? (
        <WorkspaceEmpty description="正在同步消息列表，请稍候。" title="正在加载消息" />
      ) : !messages.length && hasActiveSearch ? (
        <WorkspaceEmpty description={noResultsHint} title={noResultsTitle} />
      ) : !messages.length ? (
        <WorkspaceEmpty description="这个邮箱当前还没有消息，等待新的邮件到达。" title="还没有消息" />
      ) : (
        messages.map((message) => {
          const active = message.id === effectiveSelectedMessageId;
          return (
            <button className="block w-full text-left" key={message.id} onClick={() => onSelectMessage(message.id)} type="button">
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
  );
}

