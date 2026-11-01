"use client";
/**
 * One TanStack Table (v9) feature set shared by every table in the app:
 * sorting, column + global filtering, column visibility and pagination.
 */
import {
  columnFilteringFeature, columnVisibilityFeature, createFilteredRowModel, createPaginatedRowModel, createSortedRowModel,
  filterFn_includesString, globalFilteringFeature, metaHelper, rowPaginationFeature, rowSortingFeature,
  sortFn_alphanumeric, sortFn_basic, sortFn_datetime, sortFn_text, tableFeatures,
  type ColumnDef, type FilterFn, type Row,
} from "@tanstack/react-table";

export const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  columnVisibilityFeature,
  rowPaginationFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic, text: sortFn_text, datetime: sortFn_datetime },
  columnMeta: metaHelper<{ className?: string }>(),
});
export type F = typeof features;
export type Col<T extends object> = ColumnDef<F, T, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Filter<T extends object> = FilterFn<F, T>;
export type TRow<T extends object> = Row<F, T>;
