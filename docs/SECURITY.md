# SECURITY.md

Security and safety rules that agents must not guess at. Qyre connects to real databases, so these
rules are first-class.

## Local-first boundary

- Qyre binds to localhost only. It must never expose the server on a public interface by default.
- Qyre must never transmit database contents, schemas, or credentials off the local machine.
- The server has no authentication, so a malicious page the developer visits could otherwise reach
  it via DNS rebinding (resolving its own hostname to `127.0.0.1`). Every request is rejected unless
  its `Host` header is a loopback hostname (`127.0.0.1`, `localhost`, or the IPv6 loopback) -
  `packages/server/src/plugins/host-guard.ts`'s `onRequest` hook, F025.

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
