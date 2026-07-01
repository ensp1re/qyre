import { z } from "zod";

/**
 * Request body schema for `POST /api/query`. Shared so the server enforces the same shape the web
 * UI's query form (and any future client) can validate against before sending a request.
 */
export const runQuerySchema = z.object({ sql: z.string().min(1) });
export type RunQueryRequest = z.infer<typeof runQuerySchema>;
