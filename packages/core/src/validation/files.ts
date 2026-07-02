import { z } from "zod";

/** Query-string schema for `GET /api/files/content`. */
export const fileContentQuerySchema = z.object({
  path: z.string().min(1)
});
export type FileContentQuery = z.infer<typeof fileContentQuerySchema>;
