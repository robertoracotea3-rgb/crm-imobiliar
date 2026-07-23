export type PageWindow = {
  page: number;
  pageSize: number;
  from: number;
  to: number;
};

export function positiveInteger(value: unknown, fallback: number, maximum: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

export function createPageWindow(
  pageValue: unknown,
  pageSizeValue: unknown,
  options: { defaultPageSize?: number; maxPageSize?: number; maxPage?: number } = {},
): PageWindow {
  const pageSize = positiveInteger(
    pageSizeValue,
    options.defaultPageSize ?? 25,
    options.maxPageSize ?? 50,
  );
  const page = positiveInteger(pageValue, 1, options.maxPage ?? 100_000);
  const from = (page - 1) * pageSize;
  return { page, pageSize, from, to: from + pageSize - 1 };
}

export function paginationMetadata(totalValue: unknown, window: PageWindow) {
  const total = Number(totalValue);
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.trunc(total) : 0;
  return {
    page: window.page,
    page_size: window.pageSize,
    total: safeTotal,
    pages: Math.ceil(safeTotal / window.pageSize),
  };
}
