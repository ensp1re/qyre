import { useMutation } from "@tanstack/react-query";
import { explainQuery } from "../api/query.js";

/** User-triggered native plan request for the SQL Editor's focused EXPLAIN panel (F128). */
export function useExplainQuery() {
  return useMutation({
    mutationFn: ({ sql, analyze }: { sql: string; analyze: boolean }) => explainQuery(sql, analyze)
  });
}
