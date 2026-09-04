import { z } from "zod";

export const fileContentQuerySchema = z.object({
  path: z.string().min(1)
});
export type FileContentQuery = z.infer<typeof fileContentQuerySchema>;
