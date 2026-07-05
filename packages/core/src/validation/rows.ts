import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";

/**
 * Query-string schema for `GET /api/tables/:schema/:table/rows` pagination and sort (F065).
 * `sortColumn` is intentionally just `z.string().min(1)` here - Zod only rules out an empty
 * string, not whether the column actually exists. The real check (the actual injection surface,
 * since a column name can't be parameter-bound the way page/pageSize's numbers are) happens in
 * packages/server against the table's real introspected columns.
 */
export const rowsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortColumn: z.string().min(1).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc")
});
export type RowsQuery = z.infer<typeof rowsQuerySchema>;
