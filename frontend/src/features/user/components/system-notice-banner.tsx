import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Megaphone, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchNotices, type NoticeItem } from "../api";

const DISMISSED_KEY = "dismissed-notices";

function getDismissedIds(): Set<number> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function persistDismissedId(id: number) {
  const ids = getDismissedIds();
  ids.add(id);
  sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
}

export function SystemNoticeBanner() {
  const { t } = useTranslation();
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(getDismissedIds);

  const { data: notices } = useQuery({
    queryKey: ["portal-notices-banner"],
    queryFn: fetchNotices,
    staleTime: 5 * 60 * 1000,
  });

  const dismiss = useCallback((id: number) => {
    persistDismissedId(id);
    setDismissedIds((prev) => new Set([...prev, id]));
  }, []);

  const visible = (notices ?? []).filter((n) => !dismissedIds.has(n.id));

  if (!visible.length) return null;

  return (
    <div className="space-y-2">
      {visible.map((notice) => (
        <NoticeRow key={notice.id} notice={notice} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function NoticeRow({
  notice,
  onDismiss,
}: {
  notice: NoticeItem;
  onDismiss: (id: number) => void;
}) {
  const isWarning = notice.level === "warning";
  const Icon = isWarning ? Megaphone : Info;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        isWarning
          ? "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          : "border-sky-500/30 bg-sky-500/10 text-sky-900 dark:text-sky-200",
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{notice.title}</p>
        {notice.body && (
          <p className="mt-0.5 text-[0.85rem] opacity-80">{notice.body}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(notice.id)}
        className="shrink-0 rounded-md p-1 opacity-60 transition-opacity hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
