import { useQuery } from "@tanstack/react-query";
import { fetchTable } from "./api/table.js";
import { QUERY_RETRY } from "../shared/query/query-retry.js";

/** React Query hook for a single table's metadata. Only fetches once a table is selected. */
export function useTable(schema: string | undefined, table: string | undefined) {
  return useQuery({
    queryKey: ["table", schema, table],
    queryFn: () => fetchTable(schema as string, table as string),
    enabled: Boolean(schema && table),
    ...QUERY_RETRY
  });
}
