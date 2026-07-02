import { useQuery } from "@tanstack/react-query";
import { fetchRows } from "../api/rows.js";

const PAGE_SIZE = 25;

/**
 * React Query hook for a page of a table's rows. Keeps the previous page's rows visible while
 * paginating within the *same* table (avoids flicker), but not across a table switch - reusing
 * placeholder data there would show the old table's columns/rows under the new table's name.
 */
export function useRows(schema: string | undefined, table: string | undefined, page: number) {
  return useQuery({
    queryKey: ["rows", schema, table, page],
    queryFn: () => fetchRows(schema as string, table as string, page, PAGE_SIZE),
    enabled: Boolean(schema && table),
    retry: false,
    placeholderData: (previousData, previousQuery) => {
      const previousKey = previousQuery?.queryKey as [string, string, string, number] | undefined;
      return previousKey?.[1] === schema && previousKey?.[2] === table ? previousData : undefined;
    }
  });
}
