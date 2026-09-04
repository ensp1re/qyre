import { z } from "zod";

export const runQuerySchema = z.object({
  sql: z.string().min(1),
  confirmed: z.boolean().optional(),
  operationId: z.string().min(1).optional()
});
export type RunQueryRequest = z.infer<typeof runQuerySchema>;

export const explainQuerySchema = z.object({
  sql: z.string().min(1),
  analyze: z.boolean().optional()
});
export type ExplainQueryRequest = z.infer<typeof explainQuerySchema>;
