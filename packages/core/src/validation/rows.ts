import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";

/** Query-string schema for `GET /api/tables/:schema/:table/rows` pagination. */
export const rowsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
});
export type RowsQuery = z.infer<typeof rowsQuerySchema>;
