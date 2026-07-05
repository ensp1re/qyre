import { z } from "zod";

/**
 * Request body schema for `POST /api/connect` (F064) - switches the running server to a different
 * database connection without restarting the CLI. See docs/product-specs/database-switching.md.
 */
export const connectRequestSchema = z.object({ target: z.string().min(1) });
export type ConnectRequest = z.infer<typeof connectRequestSchema>;
