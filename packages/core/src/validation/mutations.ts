import { z } from "zod";

/**
 * Request body for `POST /api/tables/:schema/:table/rows` (F099) - a flat column -> value map (SQL
 * engines) or a whole Extended JSON document (MongoDB, per docs/product-specs/row-editing.md).
 * Zod only confirms this is a plain JSON object here; the real per-column type/kind validation
 * (the actual injection surface, since a column name can't be parameter-bound) happens in
 * packages/server against the table's real introspected columns, same pattern as
 * `rowsQuerySchema`'s `sortColumn`/filter `column`.
 */
export const insertRowRequestSchema = z.record(z.string(), z.unknown());
export type InsertRowRequest = z.infer<typeof insertRowRequestSchema>;

/**
 * Request body for `PATCH /api/tables/:schema/:table/rows` (F100) - `key` identifies the row by its
 * full primary key; `changes` carries staged SQL/MongoDB grid values. `document` and
 * `originalDocument` retain the legacy whole-document MongoDB compatibility route. MongoDB grid
 * changes carry original-value guards so field-level `$set` cannot silently overwrite a concurrent
 * edit.
 */
export const updateRowRequestSchema = z.object({
  key: z.record(z.string(), z.unknown()),
  changes: z.record(z.string(), z.unknown()).optional(),
  originalValues: z.record(z.string(), z.unknown()).optional(),
  missingOriginalFields: z.array(z.string()).optional(),
  document: z.record(z.string(), z.unknown()).optional(),
  originalDocument: z.record(z.string(), z.unknown()).optional()
});
export type UpdateRowRequest = z.infer<typeof updateRowRequestSchema>;

/**
 * Request body for `DELETE /api/tables/:schema/:table/rows` (F101) - an explicit list of full
 * primary-key matches to delete, per docs/product-specs/row-editing.md. No filter-based bulk delete
 * here - only rows the caller has already loaded and can name by key.
 */
export const deleteRowsRequestSchema = z.object({
  keys: z.array(z.record(z.string(), z.unknown()))
});
export type DeleteRowsRequest = z.infer<typeof deleteRowsRequestSchema>;

/**
 * Request body for `POST /api/mutations/commit` (F102) - an ordered array of staged operations,
 * each shaped like the arguments its own per-op route already validates (`insertRowRequestSchema`'s
 * flat map, `updateRowRequestSchema`'s `key`/`changes`, `deleteRowsRequestSchema`'s `keys`), plus
 * the `schema`/`table` a connection-wide batch needs per-op instead of in the URL. A discriminated
 * union on `type` so each variant only carries the fields its operation actually uses.
 */
export const mutationOpSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("insert"),
    schema: z.string(),
    table: z.string(),
    values: z.record(z.string(), z.unknown())
  }),
  z.object({
    type: z.literal("update"),
    schema: z.string(),
    table: z.string(),
    key: z.record(z.string(), z.unknown()),
    changes: z.record(z.string(), z.unknown()),
    originalValues: z.record(z.string(), z.unknown()).optional(),
    missingOriginalFields: z.array(z.string()).optional()
  }),
  z.object({
    type: z.literal("delete"),
    schema: z.string(),
    table: z.string(),
    keys: z.array(z.record(z.string(), z.unknown()))
  })
]);
export const commitMutationsRequestSchema = z.object({ ops: z.array(mutationOpSchema) });
export type CommitMutationsRequest = z.infer<typeof commitMutationsRequestSchema>;
