# SECURITY.md

Security and safety rules that agents must not guess at. Humb connects to real databases, so these
rules are first-class.

## Local-first boundary

- Humb binds to localhost only. It must never expose the server on a public interface by default.
- Humb must never transmit database contents, schemas, or credentials off the local machine.

## Secrets and credentials

- Never hard-code secrets in source, tests, or docs.
- Connection strings may contain passwords: never log them in full. Redact credentials in logs,
  errors, screenshots, and diagnostics.
- Real credentials never go in the repo. Use `.env` (gitignored) and `.env.example` for templates.

## Database safety (read-only)

- Humb is strictly read-only for now. The query runner must reject non-SELECT/mutating statements.
- Use parameterized queries / safe identifier quoting in adapters. Never build SQL by naive string
  concatenation of untrusted input.
- When write features are eventually added, destructive actions (DROP, DELETE, TRUNCATE, UPDATE
  without WHERE, schema changes) require explicit, unambiguous user confirmation and must never be
  the default path.

## Untrusted input

- Treat connection targets, SQL input, and API request bodies as untrusted until validated.
- Parse and validate at the boundary (e.g. Zod) before use.

## External actions

- No telemetry or external network calls without an explicit, documented decision and user opt-in.
- Production or destructive database commands must not be run by default in any automated flow.

## Dependency and review rules

- New dependencies need justification in the active plan.
- Security-sensitive changes require explicit verification steps.
- Repeated security review comments should become checks, not tribal knowledge.
