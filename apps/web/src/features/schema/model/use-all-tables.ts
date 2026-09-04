import { useQuery } from "@tanstack/react-query";
import { fetchAllTables } from "../api/all-tables.js";

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
