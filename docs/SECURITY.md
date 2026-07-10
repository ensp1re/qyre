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
  `packages/server/src/plugins/auth-guard.ts`, F122. This is what stops any other local
  process/user, or a cross-origin page's plain request, from calling the API - the Host guard alone
  only stops DNS rebinding, not a same-origin-looking request from an unrelated local caller.
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

## Database safety (read-only)

- Qyre is strictly read-only for now. The query runner must reject non-SELECT/mutating statements.
- Use parameterized queries / safe identifier quoting in adapters. Never build SQL by naive string
  concatenation of untrusted input.
- When write features are eventually added, destructive actions (DROP, DELETE, TRUNCATE, UPDATE
  without WHERE, schema changes) require explicit, unambiguous user confirmation and must never be
  the default path.

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
