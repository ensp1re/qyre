# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-10.
- Branch: `main`, clean. PR #90 (F088) is merged; v0.3.0 released via PR #91.
- Queue: 7 `passing` entries (F083-F089, pruned to 24h retention) plus 32 `not_started`
  entries (F090-F121) - the full plan for evolving the read-only MVP into a role-aware,
  write-capable database IDE. `nextIds.F` is 122.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Planning session (2026-07-10): full-codebase analysis produced
  `docs/exec-plans/active/0006-role-aware-database-ide.md` - the architectural decisions
  (two-tier advisory capability model, optional adapter namespaces `mutations`/`ddl`/`admin`,
  structured row mutations, pending-changes batch commit, statement classification for SQL
  writes, `--read-only` central guard, per-engine introspection matrix) plus F090-F121 queued in
  `docs/FEATURES.json` in dependency order across six phases (A capability foundation, B row
  editing, C SQL write mode, D schema editing, E admin/data flows, F hardening + exit gate).

## In progress

- Nothing active. The next slice is F090 (permissions/capabilities product spec). Read the exec
  plan 0006 before starting any F090+ slice - it carries the settled decisions and open questions.

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

- Pick up F090: write `docs/product-specs/permissions-and-capabilities.md` per exec plan 0006's
  decisions, resolve the plan's open decision on the capabilities API surface, then proceed down
  the queue in ID order (F091 -> F092-F095 -> F096 -> F097 before any write feature).
- Planning-session changes (FEATURES.json, exec plan 0006, this handoff) are uncommitted on
  `main`; commit them on a branch per the delivery workflow.
