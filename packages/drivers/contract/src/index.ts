/**
 * Engine-agnostic database adapter contracts.
 *
 * Concrete engines (e.g. the Postgres driver) implement {@link DatabaseAdapter}. This package must
 * not depend on any concrete database driver. See ARCHITECTURE.md and docs/CODE_ORGANIZATION.md.
 */
export * from "./contract.js";
export * from "./errors.js";
export * from "./resolve.js";
export * from "./pagination.js";
export * from "./read-only.js";
export * from "./read-only-transaction.js";
export * from "./result-cap.js";
export * from "./filter-escape.js";
