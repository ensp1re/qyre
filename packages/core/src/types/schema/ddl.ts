export interface ColumnDefinition {
  readonly name: string;
  readonly dataType: string;
  readonly nullable: boolean;
  readonly default: string | number | boolean | null;
}

export const POSTGRES_COLUMN_TYPES = [
  "text",
  "varchar",
  "integer",
  "bigint",
  "numeric",
  "boolean",
  "date",
  "timestamp",
  "timestamptz",
  "uuid",
  "jsonb"
] as const;

export const MYSQL_COLUMN_TYPES = [
  "VARCHAR(255)",
  "TEXT",
  "INT",
  "BIGINT",
  "DECIMAL",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "TIMESTAMP",
  "JSON"
] as const;

export const SQLITE_COLUMN_TYPES = ["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC"] as const;

export interface IndexDefinition {
  readonly name: string;
  readonly columns: string[];
  readonly unique: boolean;
}

export interface ColumnUpdateResult {
  readonly column: string;
  readonly renamed: boolean;
  readonly altered: boolean;
  readonly alterError?: string;
}
