/**
 * Shared row-pagination tuning constants (F047) - the single source of truth for the server's
 * default/clamp, so they can't silently diverge into two independently hand-maintained numbers with
 * no shared origin.
 *
 * `apps/web`'s own page size (`useRows`'s `UI_PAGE_SIZE`, 25 - deliberately smaller than
 * {@link DEFAULT_PAGE_SIZE} for a denser table view) is *not* re-exported from here despite being
 * conceptually the same kind of number: `@humbdb/core` bundles as one flat file, and this package's
 * `connection-target` module has Node-only imports (`fs`/`path`/`url`) that break Vite's browser
 * build the moment any real (non-type) value is imported from the barrel - confirmed live. Its own
 * local constant instead carries a comment pointing back here.
 */

/** The hard ceiling on `pageSize` for any single request, enforced by every engine adapter via
 * `@humbdb/driver-contract`'s `resolvePageRequest`. */
export const MAX_PAGE_SIZE = 200;

/** `GET /api/tables/:schema/:table/rows`'s default `pageSize` when a caller omits the query param
 * (e.g. hitting the API directly, not through the web UI, which always sends its own). */
export const DEFAULT_PAGE_SIZE = 50;
