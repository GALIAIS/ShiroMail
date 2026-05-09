import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SectionToggleProps } from "./dns-page.utils";

export function PaginationControls({
  page,
  totalPages,
  total,
  pageSize,
  itemLabel,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  itemLabel: string;
  onPageChange: (page: number) => void;
}) {
  if (total <= pageSize) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        第 {page} / {totalPages} 页 · 共 {total} 条{itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <Button
          disabled={page <= 1}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => onPageChange(page - 1)}
        >
          上一页
        </Button>
        <Button
          disabled={page >= totalPages}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => onPageChange(page + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  );
}

export function SectionToggle({
  expanded,
  title,
  description,
  meta,
  onToggle,
}: SectionToggleProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {meta}
        <Button size="sm" type="button" variant="ghost" onClick={onToggle}>
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
          {expanded ? "收起" : "展开"}
        </Button>
      </div>
    </div>
  );
}
