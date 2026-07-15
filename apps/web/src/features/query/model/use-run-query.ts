import type { StatementClassification } from "@qyre/core";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { runQuery } from "../api/query.js";

/** A successful SQL write can change both catalog shape and visible data. Invalidate every owner
 * that may now be stale; React Query immediately refetches active surfaces such as the sidebar. */
export async function refreshQueriesAfterSqlWrite(
  client: Pick<QueryClient, "invalidateQueries">,
  classification?: StatementClassification
): Promise<void> {
  if (!classification || classification === "read") return;
  await Promise.all([
    client.invalidateQueries({ queryKey: ["overview"] }),
    client.invalidateQueries({ queryKey: ["allTables"] }),
    client.invalidateQueries({ queryKey: ["table"] }),
    client.invalidateQueries({ queryKey: ["rows"] })
  ]);
}

/** React Query mutation for running a SQL statement, user-triggered - `confirmed` resubmits a
 * previously-rejected destructive statement (F107/F108). `operationId` (F126) lets the caller
 * cancel this run via `POST /api/operations/:id/cancel` while it's still in flight. */
export function useRunQuery() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      sql,
      confirmed,
      operationId
    }: {
      sql: string;
      confirmed?: boolean;
      operationId?: string;
    }) => runQuery(sql, confirmed, operationId),
    onSuccess: (result) => refreshQueriesAfterSqlWrite(queryClient, result.classification)
  });
}
