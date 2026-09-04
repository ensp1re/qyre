import { z } from "zod";

export const insertRowRequestSchema = z.record(z.string(), z.unknown());
export type InsertRowRequest = z.infer<typeof insertRowRequestSchema>;

export const updateRowRequestSchema = z.object({
  key: z.record(z.string(), z.unknown()),
  changes: z.record(z.string(), z.unknown()).optional(),
  originalValues: z.record(z.string(), z.unknown()).optional(),
  missingOriginalFields: z.array(z.string()).optional(),
  document: z.record(z.string(), z.unknown()).optional(),
  originalDocument: z.record(z.string(), z.unknown()).optional()
});
export type UpdateRowRequest = z.infer<typeof updateRowRequestSchema>;

export const deleteRowsRequestSchema = z.object({
  keys: z.array(z.record(z.string(), z.unknown()))
});
export type DeleteRowsRequest = z.infer<typeof deleteRowsRequestSchema>;

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
