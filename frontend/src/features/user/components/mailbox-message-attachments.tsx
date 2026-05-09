import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { WorkspaceEmpty } from "@/components/layout/workspace-ui";
import { ChevronDown, ChevronRight, Download, FileText, Image as ImageIcon, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { MailboxItem, MailboxMessage, MessageAttachment } from "../api";
import { downloadMailboxMessageAttachment, fetchMailboxMessageAttachmentBlob } from "../api";

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

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp"]);

function isImageAttachment(attachment: MessageAttachment): boolean {
  const ct = (attachment.contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  const ext = (attachment.fileName || "").split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

function isPdfAttachment(attachment: MessageAttachment): boolean {
  const ct = (attachment.contentType || "").toLowerCase();
  if (ct === "application/pdf") return true;
  const ext = (attachment.fileName || "").split(".").pop()?.toLowerCase() ?? "";
  return ext === "pdf";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentThumbnail({
  mailboxId,
  messageId,
  index,
  attachment,
}: {
  mailboxId: number;
  messageId: number;
  index: number;
  attachment: MessageAttachment;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    void fetchMailboxMessageAttachmentBlob(mailboxId, messageId, index).then((blob) => {
      if (revoked) return;
      setThumbUrl(URL.createObjectURL(blob));
    }).catch(() => {});
    return () => {
      revoked = true;
      if (thumbUrl) URL.revokeObjectURL(thumbUrl);
    };
  // Only fetch once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mailboxId, messageId, index]);

  if (!thumbUrl) {
    return (
      <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/20">
        <ImageIcon className="size-6 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <img
      alt={attachment.fileName}
      className="size-16 shrink-0 rounded-lg border border-border/60 object-cover"
      src={thumbUrl}
    />
  );
}

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
  const { t } = useTranslation();
  const [rawHeadersExpanded, setRawHeadersExpanded] = useState(false);

  const rawHeadersText = Object.entries(selectedMessage.headers ?? {})
    .flatMap(([key, values]) => values.map((v) => `${key}: ${v}`))
    .join("\n");

  return (
    <Card className="border-border/60 bg-background/60 shadow-none">
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 text-sm font-medium">
            <Paperclip className="size-4" />
            {t("attachments.title")}
          </div>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => onHeadersExpandedChange(!headersExpanded)}
          >
            {headersExpanded ? t("attachments.collapseHeaders") : t("attachments.viewHeaders")}
          </Button>
        </div>
        {headersExpanded ? (
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/10 p-3">
            <Input
              onChange={(event) => onHeadersSearchChange(event.target.value)}
              placeholder={t("attachments.searchHeadersPlaceholder")}
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
                    ? t("attachments.noMatchingHeaders")
                    : t("attachments.noHeadersAvailable")
                }
                title={Object.keys(selectedMessage.headers ?? {}).length ? t("attachments.noMatchTitle") : t("attachments.noHeadersTitle")}
              />
            )}
          </div>
        ) : null}

        {/* Raw Headers collapsible section */}
        {rawHeadersText ? (
          <div className="rounded-xl border border-border/60 bg-muted/10">
            <button
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium transition hover:bg-muted/20"
              onClick={() => setRawHeadersExpanded(!rawHeadersExpanded)}
              type="button"
            >
              {rawHeadersExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              {t("attachments.rawHeaders")}
            </button>
            {rawHeadersExpanded ? (
              <div className="border-t border-border/60 px-4 py-3">
                <pre className="max-h-[300px] overflow-auto whitespace-pre-wrap break-all font-mono text-xs leading-6 text-muted-foreground">
                  {rawHeadersText}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}

        {(selectedMessage.attachments ?? []).length ? (
          <div className="space-y-3">
            {(selectedMessage.attachments ?? []).map((attachment, index) => (
              <div
                className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/10 px-4 py-3 md:flex-row md:items-center md:justify-between"
                key={`${attachment.storageKey}-${index}`}
              >
                <div className="flex items-center gap-3">
                  {isImageAttachment(attachment) ? (
                    <AttachmentThumbnail
                      mailboxId={selectedMailbox.id}
                      messageId={selectedMessage.id}
                      index={index}
                      attachment={attachment}
                    />
                  ) : isPdfAttachment(attachment) ? (
                    <div className="flex size-16 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-red-50 dark:bg-red-950/20">
                      <FileText className="size-6 text-red-500" />
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <div className="text-sm font-medium">{attachment.fileName}</div>
                    <p className="text-xs text-muted-foreground">
                      {attachment.contentType || "application/octet-stream"} · {formatFileSize(attachment.sizeBytes)}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={() => {
                    onFeedback(null);
                    void downloadMailboxMessageAttachment(
                      selectedMailbox.id,
                      selectedMessage.id,
                      index,
                    ).catch(() => {
                      onFeedback(t("attachments.downloadFailed", { name: attachment.fileName }));
                    });
                  }}
                  size="sm"
                  variant="outline"
                >
                  <Download className="size-4" />
                  {t("attachments.download")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <WorkspaceEmpty description={t("attachments.emptyDescription")} title={t("attachments.emptyTitle")} />
        )}
      </CardContent>
    </Card>
  );
}
