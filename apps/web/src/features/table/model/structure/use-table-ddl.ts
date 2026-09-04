import type { ColumnDefinition, IndexDefinition } from "@qyre/core";
import { useQueryClient } from "@tanstack/react-query";
import {
  addColumn,
  createIndex,
  dropColumn,
  dropIndex,
  dropTable,
  renameTable,
  truncateTable,
  updateColumn
} from "../../api/table-ddl.js";

export function useTableDdlMutations(schema: string, table: string) {
  const queryClient = useQueryClient();

  async function refreshTable(): Promise<void> {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["table", schema, table] }),
      queryClient.invalidateQueries({ queryKey: ["allTables"] }),
      queryClient.invalidateQueries({ queryKey: ["overview"] })
    ]);
  }

  return {
    addColumn: async (column: ColumnDefinition): Promise<void> => {
      await addColumn(schema, table, column);
      await refreshTable();
    },
    editColumn: async (
      columnName: string,
      update: { newName?: string; changes?: { dataType?: string; nullable?: boolean } }
    ): Promise<void> => {
      const result = await updateColumn(schema, table, columnName, update);
      // MySQL may commit the rename before the follow-up change fails.
      await refreshTable();
      if (result.alterError) {
        throw new Error(
          `Renamed to "${result.column}", but the follow-up change failed (${result.alterError}). The rename has already been applied - reopen to retry just that change.`
        );
      }
    },
    dropColumn: async (columnName: string): Promise<void> => {
      await dropColumn(schema, table, columnName, columnName);
      await refreshTable();
    },
    createIndex: async (index: IndexDefinition): Promise<void> => {
      await createIndex(schema, table, index);
      await refreshTable();
    },
    dropIndex: async (indexName: string): Promise<void> => {
      await dropIndex(schema, table, indexName);
      await refreshTable();
    },
    renameTable: async (newName: string): Promise<void> => {
      await renameTable(schema, table, newName);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["allTables"] }),
        queryClient.invalidateQueries({ queryKey: ["overview"] })
      ]);
    },
    truncateTable: async (): Promise<void> => {
      await truncateTable(schema, table, table);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rows", schema, table] }),
        refreshTable()
      ]);
    },
    dropTable: async (): Promise<void> => {
      await dropTable(schema, table, table);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["allTables"] }),
        queryClient.invalidateQueries({ queryKey: ["overview"] })
      ]);
    }
  };
}
