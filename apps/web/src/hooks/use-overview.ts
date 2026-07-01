import { useQuery } from "@tanstack/react-query";
import { fetchOverview } from "../api/overview.js";

/** React Query hook for the database's schemas/tables. Only fetches once a database is connected. */
export function useOverview(options: { enabled: boolean }) {
  return useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
    enabled: options.enabled,
    retry: false
  });
}
