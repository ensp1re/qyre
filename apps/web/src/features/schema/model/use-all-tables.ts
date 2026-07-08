import { useQuery } from "@tanstack/react-query";
import { fetchAllTables } from "../api/all-tables.js";

/**
 * React Query hook for every table's metadata across all schemas - powers the Schema tab's
 * full-database grid. One request via GET /api/tables (F027), replacing the previous one-request-
 * per-table fan-out that didn't scale to schemas with hundreds of tables.
 */
export function useAllTables(options: { enabled: boolean }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["allTables"],
    queryFn: fetchAllTables,
    enabled: options.enabled,
    retry: false
  });

  return {
    tables: data?.tables ?? [],
    isLoading,
    isError,
    error: error instanceof Error ? error : undefined,
    refetch
  };
}
