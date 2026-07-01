import { z } from "zod";

/** Query-string schema for `GET /api/tables/:schema/:table/rows` pagination. */
export const rowsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50)
});
export type RowsQuery = z.infer<typeof rowsQuerySchema>;
