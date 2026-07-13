/**
 * A column to create, or a new column's full definition (F110/F111), per docs/product-specs/
 * schema-editing.md - deliberately the same shape {@link ColumnMetadata} already reports for reads,
 * minus the fields only introspection can produce (`isForeignKey`/`references` - foreign key
 * authoring is out of scope, see the spec).
 */
export interface ColumnDefinition {
  readonly name: string;
  /** One entry from that engine's type catalog (see {@link POSTGRES_COLUMN_TYPES} and its
   * per-engine siblings below) - never a raw, unvalidated string the browser made up. */
  readonly dataType: string;
  readonly nullable: boolean;
  /** A literal default value, or `null` for "no default" - never a raw SQL expression string
   * (e.g. `now()`); expression defaults are out of scope, see the spec. */
  readonly default: string | number | boolean | null;
}

/** Postgres's curated column type catalog (docs/product-specs/schema-editing.md's "Column type
 * catalog") - a static, hand-curated list, not one introspected from `pg_type`. Also the server-side
 * allow-list `createTable`'s DDL validation enforces (exact membership left to F113's own judgment,
 * per the spec's acceptance criteria). */
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

/** MySQL's curated column type catalog - see {@link POSTGRES_COLUMN_TYPES}. */
export const MYSQL_COLUMN_TYPES = [
  "VARCHAR",
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

/** SQLite's curated column type catalog, one per storage class/type affinity - see
 * {@link POSTGRES_COLUMN_TYPES}. */
export const SQLITE_COLUMN_TYPES = ["TEXT", "INTEGER", "REAL", "BLOB", "NUMERIC"] as const;

/**
 * An index to create (F112), per docs/product-specs/schema-editing.md. MongoDB expresses `unique`
 * the same way SQL engines do; a MongoDB `columns` entry is a top-level or dotted field path, not
 * a SQL column name, but the shape is otherwise identical - deliberately one type, not an
 * engine-specific pair, since every engine here already returns index metadata in this same shape
 * ({@link IndexMetadata}, reads) for reads.
 */
export interface IndexDefinition {
  readonly name: string;
  readonly columns: string[];
  readonly unique: boolean;
}
