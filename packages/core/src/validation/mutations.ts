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
