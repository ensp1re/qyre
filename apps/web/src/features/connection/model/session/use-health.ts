import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../../api/health.js";
import { QUERY_RETRY } from "../../../../shared/lib/query/retry.js";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    ...QUERY_RETRY,
    refetchInterval: 3000
  });
}
