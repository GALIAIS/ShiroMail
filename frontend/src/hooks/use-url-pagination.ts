import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

type UseURLPaginationOptions = {
  defaultPage?: number;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
};

type UseURLPaginationReturn = {
  page: number;
  pageSize: number;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  resetPage: () => void;
};

export function useURLPagination(
  options: UseURLPaginationOptions = {},
): UseURLPaginationReturn {
  const { defaultPage = 1, defaultPageSize = 20 } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const page = useMemo(() => {
    const raw = searchParams.get("page");
    const parsed = raw ? parseInt(raw, 10) : defaultPage;
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : defaultPage;
  }, [searchParams, defaultPage]);

  const pageSize = useMemo(() => {
    const raw = searchParams.get("pageSize");
    const parsed = raw ? parseInt(raw, 10) : defaultPageSize;
    return Number.isFinite(parsed) && parsed >= 1 ? parsed : defaultPageSize;
  }, [searchParams, defaultPageSize]);

  const setPage = useCallback(
    (newPage: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newPage <= 1) {
            next.delete("page");
          } else {
            next.set("page", String(newPage));
          }
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPageSize = useCallback(
    (newSize: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newSize === defaultPageSize) {
            next.delete("pageSize");
          } else {
            next.set("pageSize", String(newSize));
          }
          next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams, defaultPageSize],
  );

  const resetPage = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("page");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  return { page, pageSize, setPage, setPageSize, resetPage };
}
