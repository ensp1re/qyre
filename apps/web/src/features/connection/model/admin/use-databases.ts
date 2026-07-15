import { useQuery } from "@tanstack/react-query";
import { listDatabases } from "../../api/database-admin.js";
import { QUERY_RETRY } from "../../../../shared/lib/query/retry.js";

/** React Query hook for the connection switcher's "Databases on this server" list (F116). Only
 * fetches once connected and for an engine that actually has a database-list concept - SQLite
 * (`GET /api/databases` 400s there, per F115's "one file is one database" rule) never fires this. */
export function useDatabases(enabled: boolean) {
  return useQuery({
    queryKey: ["databases"],
    queryFn: listDatabases,
    enabled,
    ...QUERY_RETRY
  });
}
