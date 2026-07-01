/** A resolved, safely-bounded page request. */
export interface ResolvedPageRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

const MAX_PAGE_SIZE = 200;

/**
 * Clamp a requested page/pageSize into safe, non-negative bounds. Shared by every engine adapter so
 * pagination behaves identically regardless of which database is behind it - do not reimplement
 * this per engine.
 */
export function resolvePageRequest(page: number, pageSize: number): ResolvedPageRequest {
  const safePage = Math.max(0, Math.floor(page));
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), MAX_PAGE_SIZE);
  return { page: safePage, pageSize: safePageSize, offset: safePage * safePageSize };
}
