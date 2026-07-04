import type { RowPage } from "@humbdb/core";
import { useQuery } from "@tanstack/react-query";
import { fetchRows } from "../api/rows.js";

const PAGE_SIZE = 25;

interface RowsResult {
  rowPage: RowPage;
  hasMore: boolean;
}

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
export function useRows(schema: string | undefined, table: string | undefined, page: number) {
  return useQuery({
    queryKey: ["rows", schema, table, page],
    queryFn: async (): Promise<RowsResult> => {
      const [rowPage, nextPageProbe] = await Promise.all([
        fetchRows(schema as string, table as string, page, PAGE_SIZE),
        fetchRows(schema as string, table as string, (page + 1) * PAGE_SIZE, 1)
      ]);
      return { rowPage, hasMore: nextPageProbe.rows.length > 0 };
    },
    enabled: Boolean(schema && table),
    retry: false,
    placeholderData: (previousData, previousQuery) => {
      const previousKey = previousQuery?.queryKey as [string, string, string, number] | undefined;
      return previousKey?.[1] === schema && previousKey?.[2] === table ? previousData : undefined;
    }
  });
}
