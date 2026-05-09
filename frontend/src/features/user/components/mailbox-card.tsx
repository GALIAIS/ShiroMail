import { Card, CardContent } from "@/components/ui/card";
import { WorkspaceBadge } from "@/components/layout/workspace-ui";
import type { MailboxItem } from "../api";

type Props = {
  mailbox: MailboxItem;
  active: boolean;
  onSelect: (mailboxId: number) => void;
  formatDate: (value: string) => string;
  formatRemainingHours: (value: string) => string;
};

export function MailboxCard({ mailbox, active, onSelect, formatDate, formatRemainingHours }: Props) {
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
            <WorkspaceBadge>{mailbox.domain}</WorkspaceBadge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>剩余 {formatRemainingHours(mailbox.expiresAt)}</span>
            <span>更新于 {formatDate(mailbox.updatedAt)}</span>
          </div>
        </CardContent>
      </Card>
    </button>
  );
}
