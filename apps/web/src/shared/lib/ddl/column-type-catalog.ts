/**
 * The curated per-engine column type catalog (F110/F113, docs/product-specs/schema-editing.md's
 * "Column type catalog") - empty for MongoDB, which has no column DDL at all. Lives under `shared`
 * (not a single feature) since both the Schema tab's New-table dialog (F113) and the Tables tab's
 * Structure view (F114) need it.
 *
 * Duplicated from `packages/core/src/types/ddl.ts`'s `POSTGRES_COLUMN_TYPES`/`MYSQL_COLUMN_TYPES`/
 * `SQLITE_COLUMN_TYPES` rather than imported at runtime: `@qyre/core` is tsup-bundled into one
 * `dist/index.js` that also pulls in `connection-target.ts`'s Node-only `fs`/`path`/`url` imports
 * (used server/CLI-side), so any *value* (non-type-only) import from the package's barrel breaks
 * Vite's browser build - this is the first place `apps/web` has needed one. Splitting `@qyre/core`'s
 * build into browser-safe/Node-only entry points would fix this properly but touches every other
 * consumer's build config; three short, rarely-changing literal arrays were the surgical choice
 * here instead. Keep these in sync with `packages/core/src/types/ddl.ts` if that file's catalogs
 * ever change.
 */
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

export function columnTypeCatalogForEngine(engine: string | undefined): readonly string[] {
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
