import type { RowPage, RowSort } from "@qyre/core";
import { useQuery } from "@tanstack/react-query";
import { fetchRows } from "../api/rows.js";
import { QUERY_RETRY } from "./query-retry.js";

interface RowsResult {
  rowPage: RowPage;
  hasMore: boolean;
}

// Deliberately a local constant, not imported from @qyre/core's shared DEFAULT_PAGE_SIZE/
// MAX_PAGE_SIZE (F047) - @qyre/core bundles as one flat file, and this package's connection-target
// module has Node-only imports (fs/path/url) that break Vite's browser build the moment any real
// (non-type) value is imported from the barrel, confirmed live. Kept intentionally smaller than the
// server's own default for a denser table view - see @qyre/core/src/pagination.ts's doc comment
// for the full explanation of why these are allowed to differ.
const UI_PAGE_SIZE = 25;

/**
 * React Query hook for a page of a table's rows. Keeps the previous page's rows visible while
 * paginating within the *same* table (avoids flicker), but not across a table switch - reusing
 * placeholder data there would show the old table's columns/rows under the new table's name.
 *
 * Alongside the real page, probes for a single row at the next page's offset so `hasMore` reflects
 * whether a next page actually has data, instead of the caller guessing from
 * `rows.length === pageSize` - that heuristic is wrong exactly on an exact-page-size boundary (e.g.
 * 10,000 total rows, page size 25: the last page looks "full" and would enable Next into an empty
 * page). The probe reuses `page`/`pageSize`'s existing offset formula (`offset = page * pageSize`)
 * rather than requesting `pageSize + 1` rows directly, which would shift the offset stride itself
 * and misalign every subsequent page.
 */
export function useRows(
  schema: string | undefined,
  table: string | undefined,
  page: number,
  sort?: RowSort
) {
  return useQuery({
    queryKey: ["rows", schema, table, page, sort?.column, sort?.direction],
    queryFn: async (): Promise<RowsResult> => {
      const [rowPage, nextPageProbe] = await Promise.all([
        fetchRows(schema as string, table as string, page, UI_PAGE_SIZE, sort),
        fetchRows(schema as string, table as string, (page + 1) * UI_PAGE_SIZE, 1, sort)
      ]);
      return { rowPage, hasMore: nextPageProbe.rows.length > 0 };
    },
    enabled: Boolean(schema && table),
    ...QUERY_RETRY,
    placeholderData: (previousData, previousQuery) => {
      const previousKey = previousQuery?.queryKey as
        [string, string, string, number, string | undefined, string | undefined] | undefined;
      return previousKey?.[1] === schema && previousKey?.[2] === table ? previousData : undefined;
    }
  });
}
