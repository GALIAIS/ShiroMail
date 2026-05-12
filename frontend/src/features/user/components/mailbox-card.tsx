import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceBadge } from "@/components/layout/workspace-ui";
import { Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { MailboxItem } from "../api";

type Props = {
  mailbox: MailboxItem;
  active: boolean;
  onSelect: (mailboxId: number) => void;
  formatDate: (value: string) => string;
  formatRemainingHours: (value: string) => string;
};

export function MailboxCard({ mailbox, active, onSelect, formatDate, formatRemainingHours }: Props) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  return (
    <button
      className="block w-full text-left"
      onClick={() => onSelect(mailbox.id)}
      type="button"
    >
      <Card className={active ? "border-primary/40 bg-muted/20 shadow-none" : "border-border/60 bg-muted/10 shadow-none"}>
        <CardContent className="space-y-3 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">{mailbox.address}</div>
              <p className="text-xs text-muted-foreground">{mailbox.status === "active" ? "活跃中" : "已释放"}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                role="button"
                tabIndex={0}
                className="inline-flex items-center gap-1 rounded-md border border-border/60 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/dashboard/mailboxes/${mailbox.id}/inbox`);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.stopPropagation();
                    e.preventDefault();
                    navigate(`/dashboard/mailboxes/${mailbox.id}/inbox`);
                  }
                }}
              >
                <Inbox className="size-3" />
                {t("inbox.openInbox")}
              </span>
              <WorkspaceBadge>{mailbox.domain}</WorkspaceBadge>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{mailbox.permanent ? "永久邮箱" : `剩余 ${formatRemainingHours(mailbox.expiresAt)}`}</span>
            <span>更新于 {formatDate(mailbox.updatedAt)}</span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
