import { z } from "zod";

/**
 * Request body schema for `POST /api/connect` (F064) - switches the running server to a different
 * database connection without restarting the CLI. See docs/product-specs/database-switching.md.
 */
export const connectRequestSchema = z.object({ target: z.string().min(1) });
export type ConnectRequest = z.infer<typeof connectRequestSchema>;

/**
 * Request body schema for `POST /api/connect/database` (F116) - switches to a sibling database on
 * the currently connected server without the client ever supplying credentials, see
 * `withDatabase` (`@qyre/core`'s `connection-target.ts`). `database` isn't restricted to the
 * conservative identifier pattern DDL's "genuinely new name" fields use - it must match a name the
 * server's own `listDatabases()` already returned, whatever characters that engine allows.
 */
export const switchDatabaseRequestSchema = z.object({ database: z.string().min(1) });
export type SwitchDatabaseRequest = z.infer<typeof switchDatabaseRequestSchema>;
