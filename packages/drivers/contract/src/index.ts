/**
 * Engine-agnostic database adapter contracts.
 *
 * Concrete engines (e.g. the Postgres driver) implement {@link DatabaseAdapter}. This package must
 * not depend on any concrete database driver. See ARCHITECTURE.md and docs/CODE_ORGANIZATION.md.
 */
export * from "./types/capabilities.js";
export * from "./types/contract.js";
export * from "./safety/errors.js";
export * from "./query/resolve.js";
export * from "./query/pagination.js";
export * from "./safety/read-only.js";
export * from "./safety/read-only-transaction.js";
export * from "./query/result-cap.js";
export * from "./query/filter-escape.js";
