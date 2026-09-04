import type {
  ColumnDefinition,
  ColumnUpdateRequest,
  ColumnUpdateResult,
  IndexDefinition
} from "@qyre/core";

export interface SchemaDdlApi {
  createTable?(schema: string, table: string, columns: ColumnDefinition[]): Promise<void>;
  renameTable?(schema: string, table: string, newName: string): Promise<void>;
  truncateTable?(schema: string, table: string): Promise<void>;
  dropTable?(schema: string, table: string): Promise<void>;

  addColumn?(schema: string, table: string, column: ColumnDefinition): Promise<void>;
  renameColumn?(schema: string, table: string, column: string, newName: string): Promise<void>;
  alterColumn?(
    schema: string,
    table: string,
    column: string,
    changes: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>
  ): Promise<void>;
  renameAndAlterColumn?(
    schema: string,
    table: string,
    column: string,
    update: ColumnUpdateRequest
  ): Promise<ColumnUpdateResult>;
  dropColumn?(schema: string, table: string, column: string): Promise<void>;

  createIndex?(schema: string, table: string, definition: IndexDefinition): Promise<void>;
  dropIndex?(schema: string, table: string, indexName: string): Promise<void>;
}
