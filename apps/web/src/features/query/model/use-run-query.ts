import type { StatementClassification } from "@qyre/core";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { runQuery } from "../api/query.js";

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
