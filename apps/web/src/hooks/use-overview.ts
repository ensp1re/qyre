import { useQuery } from "@tanstack/react-query";
import { fetchOverview } from "../api/overview.js";
import { QUERY_RETRY } from "./query-retry.js";

/**
 * React Query hook for the database's schemas/tables. Only fetches once a database is connected.
 * Polls in the background (in addition to the existing manual Refresh and refetch-on-focus) so a
 * schema change made outside Qyre (a table added/dropped) doesn't stay invisible indefinitely -
 * a longer interval than health/console polling since schema drift is far less frequent than a
 * connection drop.
 */
export function useOverview(options: { enabled: boolean }) {
  return useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
    enabled: options.enabled,
    ...QUERY_RETRY,
    refetchInterval: options.enabled ? 30000 : false
  });
}
