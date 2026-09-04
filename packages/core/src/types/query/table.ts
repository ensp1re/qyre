import type { TablePermissions } from "../schema/schema.js";

export interface ForeignKeyReference {
  readonly schema?: string;
  readonly table: string;
  readonly column: string;
}

export interface ColumnMetadata {
  readonly name: string;
  readonly dataType: string;
  readonly allowedValues?: readonly string[];
  readonly elementDataType?: string;
  readonly nullable: boolean;
  readonly isPrimaryKey: boolean;
  readonly isForeignKey: boolean;
  readonly references?: ForeignKeyReference;
}

export interface IndexMetadata {
  readonly name: string;
  readonly columns: string[];
  readonly unique: boolean;
  readonly primary: boolean;
}

export type TableKind = "table" | "view" | "materialized-view" | "collection";

export interface TableMetadata {
  readonly schema: string;
  readonly name: string;
  readonly kind: TableKind;
  readonly columns: ColumnMetadata[];
  readonly indexes?: IndexMetadata[];
  readonly rowCount?: number;
  readonly permissions?: TablePermissions;
}

export interface AllTablesResponse {
  readonly tables: TableMetadata[];
}
