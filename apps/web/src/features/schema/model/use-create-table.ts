import type { ColumnDefinition, TableReference } from "@qyre/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createTable } from "../api/create-table.js";

export function useCreateTable() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (variables: TableReference & { columns: ColumnDefinition[] }) =>
      createTable(variables.schema, variables.table, variables.columns),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["allTables"] });
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
    }
  });
}
