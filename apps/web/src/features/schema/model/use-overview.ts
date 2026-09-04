import { useQuery } from "@tanstack/react-query";
import { fetchOverview } from "../api/overview.js";
import { QUERY_RETRY } from "../../../shared/lib/query/retry.js";
import type { EnabledQueryOptions } from "../../../shared/lib/query/types.js";

export function useOverview(options: EnabledQueryOptions) {
  return useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverview,
    enabled: options.enabled,
    ...QUERY_RETRY,
    refetchInterval: options.enabled ? 30000 : false
  });
}
