import type { SchemaMetadata, TableMetadata } from "@humb/core";
import { useQueries } from "@tanstack/react-query";
import { fetchTable } from "../api/table.js";

/**
 * React Query hook for every table's metadata across all schemas - powers the Schema tab's
 * full-database grid. Shares its query key with useTable, so a table already viewed in the
 * Tables/Schema single-table flow is served from cache instead of refetched.
 */
export function useAllTables(schemas: SchemaMetadata[] | undefined) {
  const targets = (schemas ?? []).flatMap((schema) =>
    schema.tables.map((table) => ({ schema: schema.name, table }))
  );

  const results = useQueries({
    queries: targets.map(({ schema, table }) => ({
      queryKey: ["table", schema, table],
      queryFn: () => fetchTable(schema, table),
      retry: false
    }))
  });

  return {
    tables: results.map((result) => result.data).filter((t): t is TableMetadata => Boolean(t)),
    isLoading: results.some((result) => result.isLoading),
    isError: results.some((result) => result.isError),
    refetch: () => results.forEach((result) => void result.refetch())
  };
}
