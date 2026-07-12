import { z } from "zod";
import type { ColumnDefinition } from "../types/ddl.js";

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
 * Request body shared by `POST .../ddl/truncate` and `DELETE /api/tables/:schema/:table` (F110) -
 * the caller must type the target table's exact name before either destructive operation runs; the
 * server independently re-validates the match, per the spec's typed-confirmation rule.
 */
export const confirmedNameRequestSchema = z.object({ confirmedName: z.string() });
export type ConfirmedNameRequest = z.infer<typeof confirmedNameRequestSchema>;
