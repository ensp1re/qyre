import { useQuery } from "@tanstack/react-query";
import { listDatabases } from "../../api/database-admin.js";
import { QUERY_RETRY } from "../../../../shared/lib/query/retry.js";

export function useDatabases(enabled: boolean) {
  return useQuery({
    queryKey: ["databases"],
    queryFn: listDatabases,
    enabled,
    ...QUERY_RETRY
  });
}
