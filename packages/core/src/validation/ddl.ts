import { z } from "zod";
import type { ColumnDefinition, IndexDefinition } from "../types/schema/ddl.js";

// Keep new identifiers in the engine-safe unquoted subset.
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

export const createTableRequestSchema = z.object({
  table: identifierSchema,
  columns: z.array(columnDefinitionSchema)
});
export type CreateTableRequest = z.infer<typeof createTableRequestSchema>;

export const renameTableRequestSchema = z.object({ newName: identifierSchema });
export type RenameTableRequest = z.infer<typeof renameTableRequestSchema>;

export const confirmedNameRequestSchema = z.object({ confirmedName: z.string() });
export type ConfirmedNameRequest = z.infer<typeof confirmedNameRequestSchema>;

const alterColumnChangesSchema = z
  .object({
    dataType: z.string().optional(),
    nullable: z.boolean().optional(),
    default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()
  })
  .refine((changes) => Object.keys(changes).length > 0, {
    message: "changes must include at least one of dataType/nullable/default."
  });

export const updateColumnRequestSchema = z
  .object({
    newName: identifierSchema.optional(),
    changes: alterColumnChangesSchema.optional()
  })
  .refine((body) => body.newName !== undefined || body.changes !== undefined, {
    message: "At least one of newName/changes is required."
  });
export type UpdateColumnRequest = z.infer<typeof updateColumnRequestSchema>;

export const indexDefinitionSchema = z.object({
  name: identifierSchema,
  columns: z.array(z.string()).min(1),
  unique: z.boolean()
}) satisfies z.ZodType<IndexDefinition>;
export type CreateIndexRequest = z.infer<typeof indexDefinitionSchema>;

export const createDatabaseRequestSchema = z.object({ database: identifierSchema });
export type CreateDatabaseRequest = z.infer<typeof createDatabaseRequestSchema>;

export const createSchemaRequestSchema = z.object({ schema: identifierSchema });
export type CreateSchemaRequest = z.infer<typeof createSchemaRequestSchema>;
