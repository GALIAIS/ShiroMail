import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useCallback, useState } from "react";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  itemLabel?: string;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
  showQuickJumper?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export function PaginationControls({
  page,
  totalPages,
  total,
  pageSize,
  itemLabel,
  pageSizeOptions = [10, 20, 50, 100],
  showPageSizeSelector = false,
  showQuickJumper = false,
  onPageChange,
  onPageSizeChange,
}: PaginationControlsProps) {
  const { t } = useTranslation();
  const [jumpValue, setJumpValue] = useState("");

  if (total <= pageSize && !showPageSizeSelector) {
    return null;
  }

  const pageNumbers = buildPageNumbers(page, totalPages);

  const handleJump = useCallback(() => {
    const target = parseInt(jumpValue, 10);
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      onPageChange(target);
      setJumpValue("");
    }
  }, [jumpValue, totalPages, onPageChange]);

  const label = itemLabel ?? t("pagination.items");

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2">
      <p className="text-xs text-muted-foreground">
        {t("pagination.summary", { page, totalPages, total, label })}
      </p>

      <div className="flex items-center gap-2">
        {showPageSizeSelector && onPageSizeChange ? (
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(parseInt(v, 10))}
          >
            <SelectTrigger className="h-8 w-auto gap-1 px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {t("pagination.perPage", { count: size })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button
          aria-label={t("pagination.first")}
          disabled={page <= 1}
          onClick={() => onPageChange(1)}
          size="icon-sm"
          variant="outline"
        >
          <ChevronsLeft className="size-3.5" />
        </Button>
        <Button
          aria-label={t("pagination.prev")}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          size="icon-sm"
          variant="outline"
        >
          <ChevronLeft className="size-3.5" />
        </Button>

        <div className="hidden items-center gap-0.5 sm:flex">
          {pageNumbers.map((num, idx) =>
            num === -1 ? (
              <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">
                ...
              </span>
            ) : (
              <Button
                key={num}
                className="h-7 w-7 text-xs"
                onClick={() => onPageChange(num)}
                size="icon-sm"
                variant={num === page ? "default" : "outline"}
              >
                {num}
              </Button>
            ),
          )}
        </div>

        <Button
          aria-label={t("pagination.next")}
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          size="icon-sm"
          variant="outline"
        >
          <ChevronRight className="size-3.5" />
        </Button>
        <Button
          aria-label={t("pagination.last")}
          disabled={page >= totalPages}
          onClick={() => onPageChange(totalPages)}
          size="icon-sm"
          variant="outline"
        >
          <ChevronsRight className="size-3.5" />
        </Button>

        {showQuickJumper ? (
          <div className="hidden items-center gap-1 sm:flex">
            <input
              aria-label={t("pagination.jumpTo")}
              className="h-7 w-12 rounded-md border border-border bg-background px-2 text-center text-xs outline-none focus:ring-1 focus:ring-ring"
              onKeyDown={(e) => e.key === "Enter" && handleJump()}
              onChange={(e) => setJumpValue(e.target.value)}
              placeholder="#"
              type="number"
              min={1}
              max={totalPages}
              value={jumpValue}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function buildPageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: number[] = [1];

  let start = Math.max(2, current - 1);
  let end = Math.min(total - 1, current + 1);

  if (current <= 3) {
    start = 2;
    end = 4;
  } else if (current >= total - 2) {
    start = total - 3;
    end = total - 1;
  }

  if (start > 2) pages.push(-1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push(-1);

  pages.push(total);
  return pages;
}
