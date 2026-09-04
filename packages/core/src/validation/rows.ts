import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../pagination.js";
import { FILTER_OPS } from "../types/query/query.js";

const NO_VALUE_OPS = new Set<(typeof FILTER_OPS)[number]>(["isNull", "isNotNull"]);

const rowFilterSchema = z
  .object({
    column: z.string().min(1),
    op: z.enum(FILTER_OPS),
    value: z.string().optional()
  })
  .refine((filter) => NO_VALUE_OPS.has(filter.op) || filter.value !== undefined, {
    message: "value is required for this operator"
  });

export const rowsQuerySchema = z.object({
  page: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  sortColumn: z.string().min(1).optional(),
  sortDirection: z.enum(["asc", "desc"]).default("asc"),
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
