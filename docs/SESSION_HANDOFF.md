# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-10.
- Branch: `feature/F122-server-auth-token`, pushed. PR #94 (F122) is open with CI green, not yet
  merged.
- Queue: 1 `passing` entry (F122, pruned to 24h retention) plus 39 `not_started` entries
  (F090-F121, F123-F128) - the rest of plan 0006's role-aware database IDE. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for planning
  history).
- F122 (session-token auth + security headers) implemented and merged into CI: every `/api/*`
  route requires a per-session bearer token (`Authorization: Bearer`, or `?token=` for the CSV
  export's plain `<a href>` download); `static-web.ts` injects the token into the served
  `index.html`; a CSP/nosniff/X-Frame-Options land on every response. PR #94.

## In progress

- Nothing active. Waiting on PR #94 (F122) to merge to `main`.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names).
- Restricted-user database fixtures (read-only Postgres/MySQL/Mongo users) do not exist yet; they
  land with F092/F093/F095.

## Next steps

- Merge PR #94 (`feature/F122-server-auth-token`).
- Then pick up F090 (permission/capability spec), and proceed in the queue's array order
  (Phase A: F090 -> F091 -> F123 -> F124 -> F092-F095 -> F096 -> F097 before any write feature).
  The exec plan's "Feature order and dependencies" section is the authoritative order.
