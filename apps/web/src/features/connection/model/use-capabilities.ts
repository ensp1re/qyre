import type { ConnectionCapabilities } from "@qyre/core";
import { useQuery } from "@tanstack/react-query";
import { fetchOverviewForCapabilities } from "../api/capabilities.js";
import { QUERY_RETRY } from "../../../shared/lib/query/retry.js";

/**
 * Session-level `ConnectionCapabilities` for the connected database (F091) - the single hook every
 * later write-affordance (row editing, SQL execution, DDL, admin) gates on, per
 * docs/product-specs/permissions-and-capabilities.md. Only fetches once a database is connected.
 * Shares `features/schema`'s `useOverview` query cache via the same `["overview"]` key (both hooks
 * hit `GET /api/overview`) - React Query coalesces same-key queries, so this costs no extra
 * request even though the two hooks live in separate features and can't import one another.
 */
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
