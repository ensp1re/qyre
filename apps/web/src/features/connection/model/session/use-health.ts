import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../../api/health.js";
import { QUERY_RETRY } from "../../../../shared/lib/query/retry.js";

/** React Query hook for the server's health/connection status. Polls so the connection indicator
 * and the server's connection-transition log entries (Console tab) reflect a real disconnect/
 * reconnect without the user having to click Refresh - matches useConsoleEvents' cadence. */
export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    ...QUERY_RETRY,
    refetchInterval: 3000
  });
}
