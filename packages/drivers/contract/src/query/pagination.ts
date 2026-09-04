import { MAX_PAGE_SIZE } from "@qyre/core";

export interface ResolvedPageRequest {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
}

/** Clamp pagination values to shared bounds. */
export function resolvePageRequest(page: number, pageSize: number): ResolvedPageRequest {
  const safePage = Math.max(0, Math.floor(page));
  const safePageSize = Math.min(Math.max(1, Math.floor(pageSize)), MAX_PAGE_SIZE);
  return { page: safePage, pageSize: safePageSize, offset: safePage * safePageSize };
}
