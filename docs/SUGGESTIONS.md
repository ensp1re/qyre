# Suggestions

Findings from a deep read-only review of the product workspace (`apps/web`, `packages/ui`,
`packages/server`, `packages/cli`; `packages/core`/`packages/drivers` read for context), 2026-07-14.
Test files, fixtures, and test infrastructure were excluded. Each entry is scoped to be split into
a standalone task. Items already tracked in `docs/exec-plans/tech-debt-tracker.md` are omitted.

Severity: `critical` = data loss / security boundary broken · `moderate` = real defect a user can
hit in normal use · `minor` = edge case, hardening, or efficiency.

## Security

### S1. Session token is served unauthenticated to any local requester — `moderate`

- **Where:** `packages/server/src/plugins/static-web.ts:63` (`app.get("/", serveIndex)` and the
  SPA-fallback `setNotFoundHandler`), token injected by `injectAuthToken`.
- **Defect:** The F122 bearer token's stated purpose (SECURITY.md: stops "any other local
  process/user … from calling the API") is not met against local callers: any local process or
  _other OS user_ can `curl http://127.0.0.1:<port>/` and read `window.__QYRE_TOKEN__` out of the
  returned HTML — no credential is needed to obtain the credential. The token does still block
  cross-origin browser pages (they can't read the response), which is the main browser-side vector.
- **Failure scenario:** On a shared/multi-user machine, another local user fetches `/` and gains
  full API access (including writes) to the connected database for the session.
- **Fix direction:** Decide and document. Options: bind the token handout to first page load only
  (one-time mint, subsequent `/` loads require the existing token), or explicitly document
  "same-machine users are trusted" as an accepted limitation in SECURITY.md so the claim matches
  the implementation.

### S2. Session token leaks into logs and browser history via the export URL — `moderate`

- **Where:** `apps/web/src/features/table/api/rows.ts:55` (`exportRowsUrl` puts `token=<session
token>` in the query string) + `packages/cli/src/index.ts` (`--verbose` passes `logger: true`).
- **Defect:** With `--verbose`, Fastify logs every request line including the full URL, so the
  session bearer token is written to the terminal/any captured log on every export download. The
  tokened URL can also persist in browser history.
- **Failure scenario:** Developer runs with `--verbose`, exports a table, pastes the log into an
  issue/CI artifact — the still-valid session token is now in the paste; anyone on the machine can
  use it for the rest of the session.
- **Fix direction:** Add a pino `redact` path for the `token` query param (or strip it in a
  serializer) when constructing the Fastify logger; the query-param auth mechanism itself can stay.

### S3. Connect/health error paths return raw driver text with no redaction pass — `minor`

- **Where:** `packages/server/src/services/connection-display.ts:24` (`describeError`), used by
  `routes/connect.ts` (400 bodies), `routes/health.ts` (`lastError`, returned to the client), and
  `packages/cli/src/index.ts` (`connectToRaw`'s terminal error).
- **Defect:** SECURITY.md requires credentials redacted "in logs, errors, screenshots, and
  diagnostics", but driver-generated messages pass through verbatim. Driver parse errors
  (MongoDB's `MongoParseError` family in particular) can echo pieces of the connection string.
- **Failure scenario:** A malformed `mongodb://user:pass@host/?badOption` target produces a driver
  error whose message includes URI fragments; it lands in the terminal, `/api/health.lastError`,
  and the EventLog.
- **Fix direction:** Run `describeError` output through the same credential-masking used by
  `redactConnectionString` (mask `://user:...@` userinfo and credential-named query params found
  anywhere in the string) before returning or logging it.

### S4. Recent-targets persistence misses credential-bearing query params like `sslpassword` — `minor`

- **Where:** `apps/web/src/features/connection/model/recent-targets.ts:4`
  (`SENSITIVE_PARAMETER = /^(?:pass(?:word)?|pwd|token|secret|api[-_]?key|credential)$/i`).
- **Defect:** The full-string match doesn't catch compound names — `sslpassword` (a real libpq
  param), `access_token`, `authSecret` — while `@qyre/core`'s redaction pattern
  (`/password|pwd|secret|token/i`, substring) does. A URL carrying `?sslpassword=...` is judged
  safe and persisted to localStorage, violating "persisted recent targets must be credential-free".
- **Failure scenario:** Connect with `postgres://host/db?sslpassword=hunter2` → the secret is
  written to `qyre-recent-targets` in localStorage and survives across sessions.
- **Fix direction:** Match the core substring pattern (or import a shared regex source) so
  persistence is at least as strict as redaction.

### S5. File preview reads the whole file into memory with no size cap — `minor`

- **Where:** `packages/server/src/routes/files.ts:38` (`readFileSync(absolutePath, "utf-8")`).
- **Defect:** `GET /api/files/content` has no size limit; a huge `.sql` file (dumps often are) is
  read fully into memory and shipped as one JSON string, blocking the event loop and ballooning
  the response.
- **Failure scenario:** A 2 GB dump file inside `--files-dir` is clicked in the Files tab → server
  stalls / OOMs; browser tab receives a 2 GB JSON body.
- **Fix direction:** `statSync` first; above a threshold (e.g. 1 MiB) return a truncated preview
  with a "file too large, showing first N KiB" marker the Files tab can render.

## Server

### V1. PATCH column rename+alter is not atomic — `moderate`

- **Where:** `packages/server/src/routes/schema-ddl.ts` (`PATCH
/api/tables/:schema/:table/ddl/columns/:column`): rename runs and commits, then alter runs
  separately.
- **Defect:** When both `newName` and `changes` are supplied and the alter step fails (bad cast,
  engine restriction), the rename has already persisted but the route returns only the alter
  error. The client dialog treats the whole edit as failed while half of it applied.
- **Failure scenario:** Rename `price` → `amount` + change type to `integer` on a column with
  non-numeric data: rename lands, alter fails, UI shows failure; the user retries the same dialog
  and now gets `Unknown column "price"`.
- **Fix direction:** Wrap both steps in one transaction on engines that support transactional DDL
  (Postgres, SQLite), or return a structured partial-success body (`renamed: true, altered:
false, error`) the dialog can render honestly; SQLite's alter is already a 12-step rebuild that
  could absorb the rename.

### V2. Batch commit fires one identical `getTable` introspection per staged op — `moderate` (efficiency)

- **Where:** `packages/server/src/routes/mutations.ts` (`Promise.all(ops.map(op =>
resolveBatchOp(db, op)))`) → `row-mutation-validation.ts:resolveBatchOp` (`await
db.getTable(op.schema, op.table)` per op).
- **Defect:** A staged batch is almost always many ops against one table, yet validation
  introspects that same table once per op, concurrently and unbounded.
- **Failure scenario:** Committing 200 staged cell edits fires 200 concurrent identical
  introspection query sets before the transaction even starts — needless load, connection-pool
  pressure, and latency; CSV import's SQL path avoids this by validating against one `getTable`.
- **Fix direction:** Group ops by `schema.table`, fetch each table's metadata once, validate all
  ops against the cached metadata.

### V3. CSV import's per-row error list is unbounded despite claiming to be bounded — `minor`

- **Where:** `packages/server/src/services/csv-import.ts` (`errors.push(...)` in the coerce-failure
  branch and `commitSqlBatch`; the function docstring says it "retains only the preview, bounded
  error list").
- **Defect:** No cap is applied — with `CSV_IMPORT_MAX_ROWS = 10_000`, a fully-invalid file
  produces a 10,000-entry `errors` array in one JSON response.
- **Failure scenario:** Import a 10k-row CSV mapped to the wrong column types → every row fails
  validation → multi-megabyte response; the dialog renders 10k error rows.
- **Fix direction:** Cap stored errors (e.g. first 100) and report the total failed count
  separately; the UI already shows `failedRows`.

### V4. Rows with a NULL primary-key value can never be updated or deleted, with a misleading error — `minor`

- **Where:** `packages/server/src/services/row-mutation-validation.ts` (`coerceRowValue` accepts
  `null` for a nullable PK column) + every SQL adapter's key clause (e.g.
  `packages/drivers/sqlite/src/mutations.ts:62` builds `WHERE pk = ?`).
- **Defect:** SQLite permits NULL in non-`INTEGER PRIMARY KEY` primary keys. A key value of `null`
  binds into `pk = NULL`, which matches nothing in SQL, so the mutation reports `matched: 0` and
  the route returns 409 "This row was already changed or removed" — wrong on both counts.
- **Failure scenario:** SQLite table with a nullable TEXT primary key and one row where it's NULL:
  any inline edit or staged delete of that row always fails with the stale-row conflict message.
- **Fix direction:** Either generate `pk IS NULL` for null key values in the adapters, or reject
  null key values at validation with an explicit "rows with a NULL primary key can't be targeted"
  message.

### V5. `--port` flag accepts garbage and fails with a raw Fastify error — `minor`

- **Where:** `packages/cli/src/index.ts` (`.option("-p, --port <port>", ..., (value) =>
parseInt(value, 10))`; `resolvePort` only validates the env var, not the flag).
- **Defect:** `qyre --port abc` yields `NaN`, which flows into `app.listen({ port: NaN })` and
  surfaces Fastify's internal error instead of the friendly message invalid `QYRE_PORT` values
  get (they fall back to the default).
- **Failure scenario:** `npx qyre ./app.db --port 80a0` → "Qyre failed to start: options.port
  should be >= 0 and < 65536" instead of a usage hint.
- **Fix direction:** Validate the parsed flag (reject NaN / out-of-range with commander's
  `InvalidArgumentError`), matching the env-var path's leniency or erroring clearly.

## UI

### U1. SQL Editor permission denials skip the F120 capability-cache refresh — `moderate`

- **Where:** `apps/web/src/features/query/api/query.ts` (`runQuery` and `explainQuery` build their
  errors manually from the response body instead of routing non-2xx bodies through
  `shared/api/permission-denied.ts`'s `apiResponseError`).
- **Defect:** F120's contract is that any structured `permission-denied` 403 notifies
  `subscribePermissionDenied` so capability/table-permission caches refetch. Every `fetchJson`/
  `fetchMutation` path does this; the two SQL Editor fetchers don't, so an engine denial through
  `/api/query` or `/api/query/explain` never triggers the refresh.
- **Failure scenario:** DBA revokes the role's INSERT while Qyre is open; the user runs `INSERT`
  in the SQL Editor and gets the denial message, but every write affordance stays visible until
  the 30-second overview poll happens to run.
- **Fix direction:** In both fetchers, pass the parsed error body through `apiResponseError`
  (which already returns the right `Error` subclass) instead of hand-building the message, keeping
  the existing 409/`cancelled`/`reason` special cases first.

### U2. Inline text/number cell editor can never set NULL or an empty string — `moderate`

- **Where:** `packages/ui/src/data-grid/editable-cell.tsx` (`commitDraft`: `if (draft === "") {
setEditing(false); return; }`; the text-input placeholder says "use null button below to clear"
  but the null button is only rendered for the boolean and date widgets).
- **Defect:** For text and numeric columns there is no way to stage NULL (no null button in that
  editing state) and no way to stage an empty string (empty draft cancels the edit). The
  placeholder references a control that doesn't exist for these widgets.
- **Failure scenario:** Nullable `varchar` column holding `"abc"`: the user wants to clear it to
  NULL (or `""`); double-click, delete the text, Enter → edit silently cancels, value unchanged,
  no feedback.
- **Fix direction:** Render the same null button the date widget gets alongside the text/number
  input when `nullable`, and pick an explicit affordance for empty string (e.g. committing an
  empty draft stages `""`, with the null button covering NULL).

### U3. Document editor can display a stale document after quick reopen — `minor`

- **Where:** `apps/web/src/features/table/ui/tables-tab.tsx` (`openEditDocument`'s un-cancelled
  `fetchDocumentText(...).then(setDocumentText)` chain).
- **Defect:** Opening document A, closing, and quickly opening document B leaves A's fetch in
  flight; if it resolves after B's, it overwrites `documentText` (and `documentLoading` via its
  `finally`) while the drawer header shows B's `_id`. The server-side `originalDocument`
  comparison prevents an actual wrong-document write (save would 409), but the user is shown and
  edits the wrong document's text.
- **Failure scenario:** Slow network + two rapid edit-clicks on different rows → drawer titled
  with B's id shows A's JSON; Save fails with a confusing "already changed or removed".
- **Fix direction:** Guard the `.then` with a request-identity check (compare against the current
  `documentEditor.id`, or use an incrementing ref / AbortController per open).

### U4. Date-widget cell editor has no cancel path — `minor`

- **Where:** `packages/ui/src/data-grid/editable-cell.tsx` (the `date`/`time`/`datetime-local`
  editing branch).
- **Defect:** The boolean branch has an explicit `esc` button and the text branch handles
  Escape/blur, but the date branch handles neither — once open, the only exits are committing via
  Enter or picking null. Escape does nothing; clicking elsewhere doesn't close it.
- **Failure scenario:** User double-clicks a timestamp cell by accident and cannot dismiss the
  editor without staging a change (or reloading).
- **Fix direction:** Handle Escape (and optionally blur) in the date branch the same way
  `handleTextKeyDown` does for text.

### U5. Editing huge integer values loses precision silently — `minor`

- **Where:** `packages/ui/src/data-grid/editable-cell.tsx` (`commitDraft`'s `Number(draft)`) and
  `new-row-cell.tsx` (`commitText`), for columns classified `numeric`.
- **Defect:** SQLite (with `safeIntegers`) and Postgres `bigint` deliver values > 2^53 as strings
  to keep precision; editing such a cell round-trips through `Number()`, so the staged value is
  silently rounded (e.g. `9007199254740993` → `9007199254740992`) and the server's numeric
  coercion accepts it.
- **Failure scenario:** Edit an unrelated column? — no; but editing the bigint column itself (or
  duplicating a row that includes one) corrupts the value by ±1 or more with no warning.
- **Fix direction:** For integer-typed columns, keep the draft as a string when
  `!Number.isSafeInteger(Number(draft))` and let the driver bind it (drivers already accept
  string/bigint), or reject with "value too large for exact editing".

### U6. "New table" always creates in the first schema with no way to choose — `minor`

- **Where:** `apps/web/src/features/schema/ui/schema-tab.tsx:38` (`const targetSchema =
schemas[0]?.name ?? ""`).
- **Defect:** On a multi-schema Postgres database the create-table dialog silently targets
  whichever schema happens to sort first in the overview; there is no schema selector, and the
  dialog header showing the schema is the only hint.
- **Failure scenario:** Database with schemas `analytics` and `public` (alphabetical order puts
  `analytics` first): "New table" creates every table in `analytics` even when the user is working
  in `public`.
- **Fix direction:** Add a schema select to `CreateTableDialog` (defaulting to the current
  sidebar selection if any), passing it through `useCreateTable`.

## CLI

### C1. Ctrl-C during the masked password prompt may leave the terminal in raw mode — `minor`

- **Where:** `packages/cli/src/guided-login-io.ts` (`consume`'s `CTRL_C_CHAR` branch calls
  `process.exit(130)` without first calling `input.setRawMode(false)`).
- **Defect:** During `askMasked`, stdin is in raw mode; the Ctrl-C handler exits immediately
  without restoring cooked mode. Whether the surrounding terminal recovers depends on the shell —
  on some setups the user's terminal is left not echoing input. (Plausible, not live-verified.)
- **Failure scenario:** `npx qyre --login`, reach the Password prompt, press Ctrl-C → shell prompt
  returns but typed characters no longer echo until `reset`/`stty sane`.
- **Fix direction:** Call `input.setRawMode?.(false)` before `process.exit(130)` in that branch.

### C2. Verbose logging is all-or-nothing per request — `minor` (fold into S2)

- Covered by S2's fix: when adding token redaction to the logger, the same serializer change is
  the natural place to redact any future sensitive query params.
