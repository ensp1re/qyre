import { useQuery } from "@tanstack/react-query";
import { QUERY_RETRY } from "../../../../shared/lib/query/retry.js";
import { fetchAccessOverview } from "../../api/access.js";

export function useAccessOverview(enabled: boolean) {
  return useQuery({
    queryKey: ["access"],
    queryFn: fetchAccessOverview,
    enabled,
    ...QUERY_RETRY
  });
}
