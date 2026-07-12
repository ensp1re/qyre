import { useMutation } from "@tanstack/react-query";
import { runQuery } from "../api/query.js";

/** React Query mutation for running a SQL statement, user-triggered - `confirmed` resubmits a
 * previously-rejected destructive statement (F107/F108). `operationId` (F126) lets the caller
 * cancel this run via `POST /api/operations/:id/cancel` while it's still in flight. */
export function useRunQuery() {
  return useMutation({
    mutationFn: ({
      sql,
      confirmed,
      operationId
    }: {
      sql: string;
      confirmed?: boolean;
      operationId?: string;
    }) => runQuery(sql, confirmed, operationId)
  });
}
