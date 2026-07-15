import { z } from "zod";
import type { ColumnDefinition, IndexDefinition } from "../types/schema/ddl.js";

/**
 * "Conservative identifier pattern" (docs/product-specs/schema-editing.md) for a genuinely new name
 * a DDL operation itself introduces (`createTable`'s `table`, `renameTable`'s `newName`) - names
 * that can't be validated against real introspected structure the way an existing target can.
 * Matches the "safe unquoted identifier" shape most engines accept without requiring the caller to
 * already know their target engine's quoting rules.
 */
const identifierSchema = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    "Must start with a letter or underscore and contain only letters, digits, and underscores."
  );

export const columnDefinitionSchema = z.object({
  name: identifierSchema,
  dataType: z.string(),
  nullable: z.boolean(),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()])
}) satisfies z.ZodType<ColumnDefinition>;

/**
 * Request body for `POST /api/schemas/:schema/tables` (F110) - creates a table/collection scoped to
 * an existing schema/database, per docs/product-specs/schema-editing.md. `columns.dataType` is
 * further validated against the connected engine's curated type catalog in packages/server (Zod
 * alone can't know which engine is connected).
 */
export const createTableRequestSchema = z.object({
  table: identifierSchema,
  columns: z.array(columnDefinitionSchema)
});
export type CreateTableRequest = z.infer<typeof createTableRequestSchema>;

/**
 * Request body for `POST /api/tables/:schema/:table/ddl/rename` (F110) - non-destructive
 * (review-before-submit only, no typed confirmation), per the spec's typed-confirmation rules.
 */
export const renameTableRequestSchema = z.object({ newName: identifierSchema });
export type RenameTableRequest = z.infer<typeof renameTableRequestSchema>;

/**
 * Request body shared by `POST .../ddl/truncate`, `DELETE /api/tables/:schema/:table` (F110), and
 * `DELETE .../ddl/columns/:column` (F111) - the caller must type the target's exact name before a
 * destructive operation runs; the server independently re-validates the match, per the spec's
 * typed-confirmation rule.
 */
export const confirmedNameRequestSchema = z.object({ confirmedName: z.string() });
export type ConfirmedNameRequest = z.infer<typeof confirmedNameRequestSchema>;

/**
 * `changes` for `PATCH /api/tables/:schema/:table/ddl/columns/:column` (F111) - covers only what's
 * actually changing (type, nullable, default), per `SchemaDdlApi.alterColumn`'s exact shape; at
 * least one field is required so an empty `{}` isn't accepted as a no-op alter.
 */
const alterColumnChangesSchema = z
  .object({
    dataType: z.string().optional(),
    nullable: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
  })
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "changes must include at least one of dataType/nullable/default."
  });

/**
 * Request body for `PATCH /api/tables/:schema/:table/ddl/columns/:column` (F111) - `newName`
 * and/or `changes`, at least one required, so a single designer-form submission can rename and
 * retype a column in one request instead of two round trips, per docs/product-specs/
 * schema-editing.md's API-shapes section.
 */
export const updateColumnRequestSchema = z
  .object({
    newName: identifierSchema.optional(),
    changes: alterColumnChangesSchema.optional()
  })
  .refine((body) => body.newName !== undefined || body.changes !== undefined, {
    message: "At least one of newName/changes is required."
  });
export type UpdateColumnRequest = z.infer<typeof updateColumnRequestSchema>;

/**
 * Request body for `POST /api/tables/:schema/:table/ddl/indexes` (F112) - `name` is the "genuinely
 * new" identifier the operation itself introduces (conservative identifier pattern); `columns` are
 * existing column/field names, further validated against the table's real introspected structure
 * in packages/server (Zod alone can't know the connected table's real columns).
 */
export const indexDefinitionSchema = z.object({
  name: identifierSchema,
  columns: z.array(z.string()).min(1),
  unique: z.boolean()
}) satisfies z.ZodType<IndexDefinition>;
export type CreateIndexRequest = z.infer<typeof indexDefinitionSchema>;

/**
 * Request body for `POST /api/databases` (F115) - `database` is a genuinely new name the operation
 * itself introduces (conservative identifier pattern, same reasoning as `createTable`'s `table`).
 * The pattern is also compatible with MongoDB's own database-name restrictions, so one schema
 * serves every engine.
 */
export const createDatabaseRequestSchema = z.object({ database: identifierSchema });
export type CreateDatabaseRequest = z.infer<typeof createDatabaseRequestSchema>;

/** Request body for `POST /api/schemas` (F115, Postgres only) - see
 * {@link createDatabaseRequestSchema}. */
export const createSchemaRequestSchema = z.object({ schema: identifierSchema });
export type CreateSchemaRequest = z.infer<typeof createSchemaRequestSchema>;
