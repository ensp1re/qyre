# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-10.
- Branch: `main`, clean. PR #90 (F088) is merged; v0.3.0 released via PR #91.
- Queue: 7 `passing` entries (F083-F089, pruned to 24h retention) plus 39 `not_started`
  entries (F090-F128) - the full plan for evolving the read-only MVP into a role-aware,
  write-capable database IDE. `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Planning session (2026-07-10): full-codebase analysis produced
  `docs/exec-plans/active/0006-role-aware-database-ide.md` (two-tier advisory capability model,
  adapter namespaces `mutations`/`ddl`/`admin`, structured row mutations, pending-changes batch
  commit, statement classification for SQL writes, `--read-only` central guard, per-engine
  introspection matrix), queued as F090-F121.
- Second-pass adversarial review (same day, code audit + market research) revised the plan: added
  F122 (session-token auth + CSP - the no-auth local server was the biggest missed risk), F123
  (batched introspection), F124 (table/view kinds), F125 (MongoDB EJSON document editor - flat
  cell edits were the wrong model for Mongo), F126 (query cancellation; better-sqlite3 blocks the
  event loop), F127 (column autocomplete), F128 (EXPLAIN viewer); hardened F093 (MySQL role
  grants), F107 (bypass Postgres identifier coercion on writes), F109/F110/F114 (kind-gated DDL),
  F117 (upload caps), F118 (single-pass streaming export), F121 (token assertions). See the exec
  plan's "Second-pass revisions" section.

## In progress

- Nothing active. The next slice is F122 (server auth token + security headers). Read the exec
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

- Merge PR #92 (`chore/plan-0006-role-aware-ide`) - the planning branch with exec plan 0006 and
  the F090-F128 queue.
- Then pick up F122 (server auth token + headers), and proceed in the queue's array order
  (Phase A: F122 -> F090 -> F091 -> F123 -> F124 -> F092-F095 -> F096 -> F097 before any write
  feature). The exec plan's "Feature order and dependencies" section is the authoritative order.
