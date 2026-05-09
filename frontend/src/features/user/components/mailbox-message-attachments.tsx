import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkspaceEmpty } from "@/components/layout/workspace-ui";
import { Download, Paperclip } from "lucide-react";
import type { MailboxItem, MailboxMessage } from "../api";
import { downloadMailboxMessageAttachment } from "../api";

type Props = {
  selectedMailbox: MailboxItem;
  selectedMessage: MailboxMessage;
  filteredHeaderEntries: (readonly [string, string[]])[];
  headersSearch: string;
  onHeadersSearchChange: (value: string) => void;
  headersExpanded: boolean;
  onHeadersExpandedChange: (expanded: boolean) => void;
  onFeedback: (msg: string | null) => void;
};

export function AttachmentsCard({
  selectedMailbox,
  selectedMessage,
  filteredHeaderEntries,
  headersSearch,
  onHeadersSearchChange,
  headersExpanded,
  onHeadersExpandedChange,
  onFeedback,
}: Props) {
  return (
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
            onClick={() => onHeadersExpandedChange(!headersExpanded)}
          >
            {headersExpanded ? "收起 Headers" : "查看 Headers"}
          </Button>
        </div>
        {headersExpanded ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3">
            <Input
              onChange={(event) => onHeadersSearchChange(event.target.value)}
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
                    onFeedback(null);
                    void downloadMailboxMessageAttachment(
                      selectedMailbox.id,
                      selectedMessage.id,
                      index,
                    ).catch(() => {
                      onFeedback(`下载附件 ${attachment.fileName} 失败，请稍后重试。`);
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
  );
}
