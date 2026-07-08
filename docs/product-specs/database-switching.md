# Product Contract: Switching Database Connections Without Restarting

Today `npx qyre <target>` resolves and connects exactly one `DatabaseAdapter` at CLI startup
(`packages/cli/src/index.ts`'s `main()`), and `createServer` closes over that single `adapter`/
`target` for the lifetime of the process - every route reads the same closure-captured constants.
Pointing Qyre at a different database means killing the process and re-running the CLI with a new
argument. This spec lets a developer switch targets from the running UI instead.

## One-sentence promise

A developer inspecting one database can point the same running Qyre instance at a different one,
without restarting the CLI or losing their place more than switching targets inherently requires.

## Behavior

### Connect UI

- The title bar's existing "Settings" button (`packages/ui/src/components/title-bar.tsx`) is
  currently a disabled placeholder (`aria-label="Settings"`, `disabled`) with no behavior wired to
  it. This spec enables it: clicking it opens a drawer (same pattern as `QueryHistoryDrawer`/
  `CellValueDrawer` - right-anchored slide-in, `useFocusTrap`) showing:
  - The current target (redacted, matching `/api/health`'s existing `target` field).
  - A text input for a new connection string or SQLite file path, and a "Connect" button.
  - A list of recently-used targets (see "Recent targets" below), each one-click reconnectable.
- Submitting a target shows a loading state on the Connect button and disables the input until the
  attempt resolves (success or failure) - no double-submit race.
- **Guided no-target startup (F073).** `npx qyre` with no target argument no longer fails with "no
  database target provided" - it starts the server with `adapter`/`target` both `undefined` (the
  same "unconfigured" shape `POST /api/connect` already produces for a fresh connection) and opens
  the browser straight into this same drawer, auto-opened once on load when `/api/health` reports
  `database: "unconfigured"`. Closing it doesn't reopen it on the next health poll - the auto-open
  fires once per page load, not every time the status happens to be unconfigured.
- **Field entry mode (F073).** A "Use fields instead" toggle swaps the single text input for
  discrete engine/host/port/user/password/database inputs (Postgres/MySQL/MongoDB only - SQLite's
  file-path shape doesn't fit this form, so it stays URL/path-only), composed into a connection
  string client-side (`composeConnectionString` in `connect-drawer.tsx`) before submitting through
  the exact same `onConnect` path as the URL form. Blank host/port fall back to `localhost`/each
  engine's documented default port; user/password/database are percent-encoded so a special
  character doesn't corrupt the resulting URL.

### Server-side switching

- `CreateServerOptions` gains an optional `adapterFactories: AdapterFactory[]` field. When provided,
  a new endpoint is registered:
  - `POST /api/connect` with body `{ target: string }`. The server parses `target` via
    `parseConnectionTarget`, resolves an adapter via `resolveAdapter(adapterFactories, parsed)`, and
    calls `adapter.connect()` followed by a `ping()` check.
  - On success: the OLD adapter is disconnected only _after_ the new one is confirmed live (ping
    succeeds), and the server's internal `adapter`/`target` state (currently `const`-destructured
    closure captures - becomes a small mutable holder) is swapped. All subsequent requests
    (`/api/health`, `/api/overview`, etc.) now serve the new database.
  - On failure (bad credentials, unreachable host, invalid file path, ping fails): the OLD connection
    is left completely untouched - no partial disconnect - and the endpoint returns a 4xx with the
    real underlying error message (same normalized `{ error: string }` shape every other route uses).
  - When `adapterFactories` is omitted (every existing caller/test that doesn't opt in), `/api/connect`
    is not registered at all - `POST /api/connect` 404s, matching today's behavior everywhere this
    feature isn't wired up. `packages/cli`'s real `main()` passes its existing factory list
    (`[postgresAdapterFactory, sqliteAdapterFactory, mysqlAdapterFactory, mongodbAdapterFactory]`,
    the same one it already uses to resolve the initial target) so the real CLI gets this feature by
    default.

### Client-side state reset on switch

- On a successful switch, `apps/web` invalidates every React Query cache keyed to the old database
  (`overview`, `tables`, `rows`, `console`, `files`) so nothing stale renders under the new target's
  name.
- Selected table/schema and current page reset (the new database likely doesn't have the same
  tables) - same reset `selectTable` already performs when switching tables, applied here too.
- The SQL Editor's current draft text is **not** cleared - a query someone was mid-editing shouldn't
  vanish just because the target changed underneath it, even though it may now fail against the new
  target (a `runReadOnlyQuery` error is a normal, recoverable outcome the editor already handles).
- Query History (`localStorage`-backed, shared across all connections per `sql-editor.md`) is
  unaffected - it was already deliberately not scoped per-connection.

### Recent targets

- The last 5 successfully-connected targets (redacted display string + the raw connection string,
  so reconnecting doesn't require retyping credentials) are kept in `localStorage`, most-recent
  first, oldest dropped past the cap - same bounded-list shape Query History (F012) and the Console
  event log (DF-07) already use. Reconnecting to a listed target is one click (fills the input and
  submits), not a retype.
- Raw connection strings in this list never leave the browser except in the `POST /api/connect`
  body itself when the developer actually chooses to connect to one - never logged, never sent in a
  GET request or query string.

### CLI startup error messages (F073)

Every known way `npx qyre <target>` can fail at startup gets a distinct, actionable message
instead of a raw driver/Node error propagating to `bin.ts`'s generic `"Qyre failed to start: ..."`
catch-all:

- **Unparseable/unsupported target**: `parseConnectionTarget` (already existed) - names the exact
  problem and lists every supported target shape.
- **Unreachable host / auth failure during the initial connect**: `main()`'s own `adapter.connect()`
  call is now wrapped and passed through `describeError()` (exported from `@qyre/server`, F064's
  existing `AggregateError`-unwrapping helper) - previously this call had the same "empty message"
  `AggregateError` bug `describeError` was built to fix for the `/api/health`/`/api/connect` paths,
  just never routed through it. The message names the target (redacted) and the underlying reason.
- **Port already in use**: `startServer`'s `EADDRINUSE` is caught and rethrown as `Port <port> is
already in use. Try a different one with --port <port>, or stop whatever else is using it.`

### Trust model note

This adds a new mutation endpoint that can make the local server connect to an arbitrary
attacker-influenced target. Qyre's existing trust model (`docs/SECURITY.md`, `docs/CONNECTING.md`)
already assumes anyone who can reach `/api/*` on the loopback address has full read access to
whatever database is currently connected - the Host-header check (F030) is what actually keeps a
remote page from reaching this endpoint via DNS rebinding, not the absence of a connect endpoint.
`/api/connect` doesn't create a new class of remote risk beyond what already exists for every other
route; it's called out here so it isn't accidentally treated as a bigger trust boundary change than
it is.

## Out of scope (for now)

- Multiple simultaneous connections (browsing two databases at once in separate tabs/panes) - this
  spec is "switch the one active connection," not multi-connection support.
- Server-side encrypted storage or any server-side persistence of recent targets - client-side
  `localStorage` only, matching Query History's existing precedent (`sql-editor.md`).
- Auto-detecting or listing databases reachable on the local network - the developer still types or
  pastes a connection string themselves, same as the CLI's own argument today.

## Acceptance criteria

- The title bar's Settings button opens a connection-switch drawer instead of being permanently
  disabled.
- Submitting a valid new connection string switches the running server to the new database with no
  process restart: `/api/health`'s `target` changes, `/api/overview` reflects the new database's
  actual schemas/tables, and the previously selected table/page resets.
- Submitting an invalid or unreachable target shows an error in the drawer and leaves the previous
  connection fully working - verified by running a query against the old database immediately after
  a failed switch attempt.
- A list of up to 5 recently-used targets is shown and one-click reconnectable.
- `npx qyre <url>` with the connect UI never used behaves identically to today - no regression for
  the existing single-target workflow.
- `npx qyre` with no target starts successfully (not an error exit) and opens the browser straight
  into the connect drawer.
- The field-entry form composes a working connection string for Postgres, MySQL, and MongoDB and
  connects successfully through it.
- A deliberately wrong port on `npx qyre <bad-target>` fails with a message naming the actual
  problem, not an empty or generic one.
