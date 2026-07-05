# Product Contract: Error Handling (Server Responses & UI Display)

Every data-driven view in Qyre already handles empty/loading/success/error states in some form
(`FRONTEND.md`'s "Required user-facing states" rule) - but the current error state is a small,
left-aligned sentence plus a "Retry" link, inconsistent in wording/placement across views, and in at
least one real case actively wrong: a genuine database error gets replaced with a generic, useless
message before it ever reaches the UI. This spec covers fixing both the server-side error shape and
the UI's display of it, consistently, everywhere.

## Why this exists (a real bug, not just polish)

Found while testing F012: running `SELECT * FROM orders_items LIMIT 10` (a typo'd, non-existent
table) against a real Postgres connection surfaced a raw `Failed to fetch` in the SQL Editor -
unhelpful and not the actual reason the query failed.

Two distinct problems, both real:

1. **The server discards the real error message for anything other than a read-only violation.**
   `packages/server/src/index.ts`'s `POST /api/query` handler only special-cases
   `ReadOnlyViolationError` (returns `{ error: message }` with a 400). Any other failure - a bad
   table name, a syntax error, a genuine Postgres error - is re-thrown raw and falls through to
   Fastify's _default_ error handler, which returns `{ statusCode, error: "Internal Server Error",
message: "<actual detail>" }`. `apps/web/src/api/query.ts` reads `body.error` (the reason phrase,
   literally the string `"Internal Server Error"`) instead of `body.message` (where the real,
   useful Postgres error text - `relation "orders_items" does not exist` - actually is). So even
   when the server responds cleanly, the developer sees a useless generic message instead of the
   real reason their query failed.
2. **A network-level failure (the request never reaching a server at all - e.g. the backend isn't
   running) surfaces the browser's raw generic message (`Failed to fetch`) verbatim**, with no
   attempt to explain what that actually means to a developer who isn't thinking about `fetch()`
   internals.

Neither of `packages/server`'s other routes (`/api/overview`, `/api/tables/...`, `/api/files/...`)
have this exact "wrong field" bug (they don't currently throw arbitrary uncaught errors the same
way `/api/query` does), but none of them have a consistent, deliberate error-response shape either -
this is the right time to standardize it once, server-wide, rather than patching `/api/query` alone
and leaving the same class of bug latent in every future route.

**Update (F022):** one route was missed in the original pass - `GET /api/tables/:schema/:table/rows`
called `rowsQuerySchema.parse(request.query)`, which throws a `ZodError` straight into the global
error handler above on invalid input (e.g. `?page=abc`). Since a `ZodError` carries no
`statusCode`, that handler's default (500) applied, and the error's `message` is a raw stringified
array of Zod issues - a client-input-shaped problem (400, like `/api/query`'s own `safeParse`
handling) reported as a server fault with an unreadable body. Fixed by switching to
`rowsQuerySchema.safeParse` and returning a clean `400`, matching `/api/query`'s existing pattern -
the fix this spec's Scope section already calls for, just not yet applied everywhere it should be.

## Scope

In scope:

- **Server**: a single Fastify `setErrorHandler` (not per-route try/catch duplication) that
  normalizes every uncaught route error into one consistent JSON shape (`{ error: string }`, the
  real underlying message, not Fastify's generic reason phrase) with an appropriate status code
  (400 for a client-shaped problem like `ReadOnlyViolationError`, 500 for a genuine unexpected
  failure) - existing per-route error handling (e.g. `ReadOnlyViolationError`'s explicit 400) stays
  as the most-specific case; the global handler is the catch-all beneath it, not a replacement for
  it.
- **UI**: a new shared `ErrorState` component (`packages/ui`) - occupies the same visual footprint a
  loaded/empty view of that same component would (not a floating sentence above empty space),
  message centered, with a Retry action. Replaces the current bespoke inline error blocks in
  `apps/web/src/App.tsx` for: `QueryRunner`'s result area, `RowsTable` (Tables tab), `SchemaGrid`
  (Schema tab), `FilesBrowser` (Files tab, both the tree-load failure and a single file's content-load
  failure), and `ConsoleLog` (Console tab).
- **UI**: distinguish "the server responded with an error" (show the real message) from "the request
  never reached a server at all" (a friendlier explanation, e.g. "Could not reach the Qyre server -
  is it still running?" instead of the raw browser string) - both still render through the same
  `ErrorState` component, just with different message text depending on which case actually
  happened.

Out of scope (for now):

- Auto-retrying a failure the user has already seen - `ErrorState`'s Retry stays a manual, explicit
  action once an error is actually showing. This is distinct from F041's bounded (2-attempt, short
  backoff) silent retry inside the query hooks themselves, which absorbs a single transient blip
  _before_ anything reaches `ErrorState` at all - a persistent failure still surfaces exactly as
  described above, just after those couple of quick retries instead of immediately.
- Structured/typed error codes for programmatic handling - a plain human-readable message is enough
  for this pass; revisit if the UI ever needs to branch behavior on _which_ error occurred, not just
  display it.
- Changing what counts as an error vs. a legitimate empty state (e.g. zero rows is not an error today
  and stays that way) - this spec is about how errors are surfaced, not reclassifying what is one.

## Acceptance criteria

- Running a SQL query against a non-existent table shows the real Postgres error message (e.g.
  `relation "orders_items" does not exist`) in the SQL Editor's result area, centered in the same
  space results/empty-state would occupy - not a generic "Internal Server Error" and not a raw
  `Failed to fetch`.
- The same `ErrorState` component (message + Retry) renders for a failed Tables/Schema/Files/Console
  load, replacing today's inconsistent inline text blocks.
- A genuine network-unreachable failure (server not running) renders a distinguishable, friendlier
  message than the raw browser error string, still via the same component.
- Every Fastify route's error responses share one consistent JSON shape end to end - no route can
  regress into leaking Fastify's default `{statusCode, error, message}` shape unnoticed, since there
  is now exactly one place (the global error handler) that produces error responses for anything not
  already handled by a route's own specific `catch`.
- `GET /api/tables/:schema/:table/rows?page=abc` (or any invalid pagination param) returns a clean
  `400` with a readable message, not a `500` with a raw Zod issue dump.
