import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";
import { FILTER_OPS } from "../types/query/query.js";

const NO_VALUE_OPS = new Set<(typeof FILTER_OPS)[number]>(["isNull", "isNotNull"]);

/**
 * A single column/operator/value filter, as carried inside the `filters` query param's JSON array
 * (F072). `column` is intentionally just `z.string().min(1)` - same reasoning as `sortColumn`
 * below, the real column-existence check happens in packages/server. `op` is fully validated here
 * (a fixed whitelist, not a raw-input injection surface); `value` is required for every op except
 * `isNull`/`isNotNull`, which don't use one.
 */
const rowFilterSchema = z
  .object({
    column: z.string().min(1),
    op: z.enum(FILTER_OPS),
    value: z.string().optional()
  })
  .refine((filter) => NO_VALUE_OPS.has(filter.op) || filter.value !== undefined, {
    message: "value is required for this operator"
  });

/**
 * Query-string schema for `GET /api/tables/:schema/:table/rows` pagination, sort (F065), and
 * filtering (F072). `sortColumn` is intentionally just `z.string().min(1)` here - Zod only rules
 * out an empty string, not whether the column actually exists. The real check (the actual
 * injection surface, since a column name can't be parameter-bound the way page/pageSize's numbers
 * are) happens in packages/server against the table's real introspected columns - same for each
 * filter's `column` above. `filters` arrives as a JSON-encoded array since a query string can't
 * natively carry nested structures; invalid JSON or a shape that doesn't match `rowFilterSchema`
 * fails validation here.
 */
export const rowsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortColumn: z.string().min(1).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
  // F126: optional client-generated id enabling `POST /api/operations/:id/cancel` to cancel this
  // same rows fetch while it's still running - same pattern as runQuerySchema's operationId.
  operationId: z.string().min(1).optional(),
  search: z.string().trim().min(1).max(500).optional(),
  filters: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (!raw) return undefined;
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "filters is not valid JSON" });
        return z.NEVER;
      }
      const result = z.array(rowFilterSchema).safeParse(parsed);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "filters does not match the expected shape"
        });
        return z.NEVER;
      }
      return result.data;
    })
});
export type RowsQuery = z.infer<typeof rowsQuerySchema>;
