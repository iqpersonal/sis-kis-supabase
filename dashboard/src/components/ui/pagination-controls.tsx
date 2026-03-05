"use client";

import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
} from "lucide-react";
import type { PaginationState } from "@/hooks/use-sis-data";

interface PaginationControlsProps {
  pagination: PaginationState;
  onNext: () => void;
  onPrev: () => void;
  onFirst: () => void;
  onPageSizeChange: (size: number) => void;
  loading?: boolean;
}

const PAGE_SIZES = [25, 50, 100, 200];

export function PaginationControls({
  pagination,
  onNext,
  onPrev,
  onFirst,
  onPageSizeChange,
  loading,
}: PaginationControlsProps) {
  const { page, pageSize, totalCount, totalPages, hasNext, hasPrev } =
    pagination;

  const start = page * pageSize + 1;
  const end = Math.min((page + 1) * pageSize, totalCount);

  return (
    <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      {/* Left: rows per page */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span>Rows per page</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          disabled={loading}
          className="h-8 rounded-md border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {PAGE_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Center: showing X-Y of Z */}
      <div className="text-sm text-muted-foreground">
        {totalCount > 0 ? (
          <>
            Showing{" "}
            <span className="font-medium text-foreground">
              {start.toLocaleString()}
            </span>
            –
            <span className="font-medium text-foreground">
              {end.toLocaleString()}
            </span>{" "}
            of{" "}
            <span className="font-medium text-foreground">
              {totalCount.toLocaleString()}
            </span>
            {totalPages > 0 && (
              <span className="ml-2">
                (Page {page + 1} of {totalPages.toLocaleString()})
              </span>
            )}
          </>
        ) : (
          "No records"
        )}
      </div>

      {/* Right: navigation buttons */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onFirst}
          disabled={!hasPrev || loading}
          title="First page"
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onPrev}
          disabled={!hasPrev || loading}
          title="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={onNext}
          disabled={!hasNext || loading}
          title="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
