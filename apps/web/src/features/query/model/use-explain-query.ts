import { useMutation } from "@tanstack/react-query";
import { explainQuery } from "../api/query.js";

export function useExplainQuery() {
  return useMutation({
    mutationFn: ({ sql, analyze }: { sql: string; analyze: boolean }) => explainQuery(sql, analyze)
  });
}
