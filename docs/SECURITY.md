# SECURITY.md

Security and safety rules that agents must not guess at. Qyre connects to real databases, so these
rules are first-class.

## Local-first boundary

- Qyre binds to localhost only. It must never expose the server on a public interface by default.
- Qyre must never transmit database contents, schemas, or credentials off the local machine.
- Every request is rejected unless its `Host` header is a loopback hostname (`127.0.0.1`,
  `localhost`, or the IPv6 loopback), closing the DNS-rebinding vector (a malicious page the
  developer visits resolving its own hostname to `127.0.0.1`) -
  `packages/server/src/plugins/host-guard.ts`'s `onRequest` hook, F025.
- Every `/api/*` route requires a per-session bearer token: the CLI mints a cryptographically
  random token at startup (`packages/server/src/services/auth-token.ts`) and the served UI receives
  it embedded in `index.html` (`packages/server/src/plugins/static-web.ts`); requests present it as
  an `Authorization: Bearer <token>` header (every `fetchJson` call) or a `token` query param (the
  CSV export's plain `<a href>` download, which can't set headers) -
  `packages/server/src/plugins/auth-guard.ts`, F122. This stops a cross-origin page's plain
  request from calling the API (it can't read the token out of `index.html`'s response to embed in
  its own requests) - the Host guard alone only stops DNS rebinding, not a same-origin-looking
  request from an unrelated caller.
  **Accepted limitation:** the token itself is not access-controlled - `GET /` returns it embedded
  in `index.html` to any requester that can reach the port, so another local OS user or process on
  a shared machine can retrieve it the same way the browser does and then call every `/api/*`
  route. This is a deliberate simplicity/UX tradeoff (the CLI auto-opens the browser with no
  separate handshake, and a page refresh must keep working) rather than a gap the token is meant to
  close - the token's actual job is the cross-origin/CSRF-shaped request above, not defending a
  genuinely shared or multi-tenant machine. Qyre is a single-developer local tool; running it on a
  host other logins can reach is out of its trust model, the same category of accepted risk as this
  file's other same-machine notes.
- Every response carries a CSP plus `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`
  (`packages/server/src/plugins/security-headers.ts`, F122). `connect-src 'self'` stops the served
  page from ever fetching out to a third-party host; `img-src` stays open to http/https so the F086
  DB-driven image previews keep working - the narrower channel that leaves open is accepted, not
  eliminated.

## Secrets and credentials

- Never hard-code secrets in source, tests, or docs.
- Connection strings may contain passwords: never log them in full. Redact credentials in logs,
  errors, screenshots, and diagnostics - including a credential passed as a query parameter (e.g.
  `?password=...`, MySQL/Mongo's alternative to the `user:pass@host` form), not only the standard
  URL-userinfo form (`@qyre/core`'s `redactConnectionString`, F024).
- Never persist raw credential-bearing connection targets in browser storage. They may remain in
  memory for the current local session; persisted recent targets must be credential-free.
- Real credentials never go in the repo. Use `.env` (gitignored) and `.env.example` for templates.

## Database safety and writes

- Qyre is role-aware. `ConnectionCapabilities` and per-table permissions drive visible
  affordances and server pre-checks, but they are advisory; the connected database is the
  authoritative enforcer on every operation. Missing or failed introspection gates closed.
- The CLI's `--read-only` flag (F096) is a hard, Qyre-level ceiling that always wins over whatever
  the connected database role would otherwise allow - `ConnectionCapabilities` reports every
  `supports*` flag `false` and `readOnlyReason: "qyre-flag"` regardless of grants
  (`packages/server/src/services/read-only-capabilities.ts`), and the read-only guard plugin
  (`packages/server/src/plugins/read-only-guard.ts`) rejects any route registered as mutating before
  its handler runs. Every future write route must register under this
  choke point - it is the single place session read-only mode is enforced server-side, not
  something each write route may reimplement or bypass. Its stable 403 response carries
  `reason: "qyre-flag"`.
- Every database-mutating route also declares permission-denial metadata through
  `permissionRoute`; server startup rejects an uncovered mutating route. Concrete adapters classify
  stable native permission codes, and the global handler returns the shared redacted
  `permission-denied` 403 plus one safe audit entry - raw engine text is never returned or logged
  for a denial.
- Read statements still use the adapter's authoritative read-only path (Postgres/MySQL read-only
  transactions and SQLite `PRAGMA query_only`). A write-capable SQL session classifies other
  statements separately; destructive classes require a confirmed second request.
- Structured row mutations and DDL use parameterized values and safe identifier quoting inside
  adapters. Never build SQL by naive string concatenation of untrusted input.
- Staged SQL-grid writes commit in one native transaction on Postgres, MySQL, and SQLite. MongoDB
  document writes use explicit whole-document Extended JSON operations because the standalone test
  topology cannot promise multi-document transactions.
- Destructive actions (DROP, DELETE, TRUNCATE, UPDATE without WHERE, destructive schema changes)
  require explicit, unambiguous confirmation and must never be the default path. Every mutation is
  audited in the in-app EventLog and structured server log.

## Untrusted input

- Treat connection targets, SQL input, and API request bodies as untrusted until validated.
- Parse and validate at the boundary (e.g. Zod) before use.
- Treat the connected database's own row data as untrusted once it leaves Qyre into another
  application's trust boundary - e.g. CSV export/copy (`rows-table.tsx`'s `toCsv`, F035) prefixes a
  leading apostrophe on any cell value starting with `=`/`+`/`-`/`@` so Excel/Sheets can't execute it
  as a formula.

## External actions

- No telemetry or external network calls without an explicit, documented decision and user opt-in.
- Production or destructive database commands must not be run by default in any automated flow.

## Dependency and review rules

- New dependencies need justification in the active plan.
- Security-sensitive changes require explicit verification steps.
- Repeated security review comments should become checks, not tribal knowledge.
