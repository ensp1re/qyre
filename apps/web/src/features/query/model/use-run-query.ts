import { useMutation } from "@tanstack/react-query";
import { runQuery } from "../api/query.js";

/** React Query mutation for running a read-only SQL query, user-triggered. */
export function useRunQuery() {
  return useMutation({ mutationFn: runQuery });
}
