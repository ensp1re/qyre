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

/**
 * Structure-editing mutations for F114's Structure view - plain async wrappers (not React Query's
 * `useMutation`) since `TableStructure` (packages/ui) awaits each call directly to know when to
 * close its own dialog, per that component's doc comment. Every call invalidates the table's own
 * metadata and the Schema tab's full-database list on success, so both reflect the change without a
 * manual refresh. `confirmedName` for the three destructive operations is always the target's own
 * current name - by the time `onConfirm` fires, `ConfirmTypedNameDialog` has already verified the
 * typed text matches it client-side, so there's nothing else the caller could pass.
 */
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
      // Refresh before the possible throw below (F134) - a MySQL alterError means the rename
      // already committed, so the table's metadata (and this column's new name) must be current
      // before the dialog is retried, or a retry would hit "Unknown column" against the stale
      // pre-rename name shown while it was still loading.
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
