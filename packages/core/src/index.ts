/**
 * Shared domain types and contracts for Qyre.
 *
 * This package must stay UI-, server-, and engine-agnostic. It is the single source of truth for
 * types (and their runtime validation) used by both `packages/server` and `apps/web`, so the two
 * can never silently drift apart. See ARCHITECTURE.md and docs/CODE_ORGANIZATION.md for the folder
 * rules this package follows.
 */
export * from "./types/connection.js";
export * from "./types/table.js";
export * from "./types/schema.js";
export * from "./types/query.js";
export * from "./types/mutation.js";
export * from "./types/health.js";
export * from "./types/files.js";
export * from "./types/console.js";
export * from "./types/connect.js";
export * from "./errors.js";
export * from "./connection-target.js";
export * from "./pagination.js";
export * from "./validation/query.js";
export * from "./validation/rows.js";
export * from "./validation/mutations.js";
export * from "./validation/files.js";
export * from "./validation/connect.js";
