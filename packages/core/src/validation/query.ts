import { z } from "zod";

/**
 * Request body schema for `POST /api/query`. Shared so the server enforces the same shape the web
 * UI's query form (and any future client) can validate against before sending a request.
 * `confirmed` (F107) is the client's explicit acknowledgement that a destructive statement
 * (`classifyStatement` returning `"destructive"`) should actually run - the server re-checks it on
 * every request rather than trusting any client-side "already confirmed" state, per
 * `docs/product-specs/sql-editor.md`'s "a server-enforced round-trip, never client-only".
 */
export const runQuerySchema = z.object({
  sql: z.string().min(1),
  confirmed: z.boolean().optional()
});
export type RunQueryRequest = z.infer<typeof runQuerySchema>;
