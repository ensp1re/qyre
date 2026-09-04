const POSTGRES_COLUMN_TYPES = [
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

const MYSQL_COLUMN_TYPES = [
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

const SQLITE_COLUMN_TYPES = ["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC"] as const;

export function columnTypeCatalogForEngine(engine: DatabaseEngine | undefined): readonly string[] {
  switch (engine) {
    case "postgres":
      return POSTGRES_COLUMN_TYPES;
    case "mysql":
      return MYSQL_COLUMN_TYPES;
    case "sqlite":
      return SQLITE_COLUMN_TYPES;
    default:
      return [];
  }
}
import type { DatabaseEngine } from "@qyre/core";
