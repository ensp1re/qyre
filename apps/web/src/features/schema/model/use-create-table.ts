import type { ColumnDefinition } from "@qyre/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTable } from "../api/create-table.js";

/** Mutation for F113's New-table/New-collection dialog. On success, invalidates the Schema tab's
 * table list and the overview so the newly created table appears without a manual refresh. */
export function useCreateTable(schema: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: { table: string; columns: ColumnDefinition[] }) =>
      createTable(schema, variables.table, variables.columns),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["allTables"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    }
  });
}
