import { useTranslation } from "react-i18next";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UserVerificationProfileItem } from "../api";

// Canonical record types tracked for domain health
const HEALTH_RECORD_TYPES = ["MX", "SPF", "DKIM", "DMARC"] as const;

type DomainHealthScoreProps = {
  verifications: UserVerificationProfileItem[];
};

function getRecordStatus(
  verifications: UserVerificationProfileItem[],
  recordType: string,
): "configured" | "missing" {
  const match = verifications.find(
    (v) => v.verificationType.toUpperCase() === recordType,
  );
  return match && match.status === "verified" ? "configured" : "missing";
}

function getScoreColor(configured: number, total: number) {
  if (configured === total) return "bg-emerald-500";
  if (configured === 0) return "bg-red-500";
  return "bg-amber-500";
}

function getScoreTextColor(configured: number, total: number) {
  if (configured === total) return "text-emerald-600 dark:text-emerald-400";
  if (configured === 0) return "text-red-600 dark:text-red-400";
  return "text-amber-600 dark:text-amber-400";
}

export function DomainHealthScore({ verifications }: DomainHealthScoreProps) {
  const { t } = useTranslation();

  const statuses = HEALTH_RECORD_TYPES.map((type) => ({
    type,
    status: getRecordStatus(verifications, type),
  }));

  const configured = statuses.filter((s) => s.status === "configured").length;
  const total = HEALTH_RECORD_TYPES.length;
  const percentage = Math.round((configured / total) * 100);

  return (
    <div className="space-y-3 rounded-xl border border-border/60 bg-card/50 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-medium">{t("dns.healthScore.title")}</div>
        <span className={cn("text-sm font-semibold", getScoreTextColor(configured, total))}>
          {t("dns.healthScore.score", { configured, total })}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", getScoreColor(configured, total))}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Record type checklist */}
      <div className="grid grid-cols-2 gap-2">
        {statuses.map(({ type, status }) => (
          <div key={type} className="flex items-center gap-2 text-sm">
            {status === "configured" ? (
              <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
            ) : (
              <XCircle className="size-4 shrink-0 text-muted-foreground/60" />
            )}
            <span className={status === "missing" ? "text-muted-foreground" : ""}>
              {type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
