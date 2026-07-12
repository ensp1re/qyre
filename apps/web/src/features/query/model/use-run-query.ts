import { useMutation } from "@tanstack/react-query";
import { runQuery } from "../api/query.js";

/** React Query mutation for running a SQL statement, user-triggered - `confirmed` resubmits a
 * previously-rejected destructive statement (F107/F108). */
export function useRunQuery() {
  return useMutation({
    mutationFn: ({ sql, confirmed }: { sql: string; confirmed?: boolean }) =>
      runQuery(sql, confirmed)
  });
}
