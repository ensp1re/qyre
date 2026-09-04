import type { ConnectionCapabilities } from "@qyre/core";
import { useQuery } from "@tanstack/react-query";
import { fetchOverviewForCapabilities } from "../../api/capabilities.js";
import { QUERY_RETRY } from "../../../../shared/lib/query/retry.js";

export function useCapabilities(options: { enabled: boolean }): {
  data: ConnectionCapabilities | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const query = useQuery({
    queryKey: ["overview"],
    queryFn: fetchOverviewForCapabilities,
    enabled: options.enabled,
    ...QUERY_RETRY,
    refetchInterval: options.enabled ? 30000 : false,
    select: (overview) => overview.capabilities
  });
  return { data: query.data, isLoading: query.isLoading, isError: query.isError };
}
