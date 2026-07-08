# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-08.
- Branch: `feature/F077-ui-structure` (tip `eb1fd5a`), already merged into main as PR #78
  (`36fc66e`) - this handoff previously lagged that merge. F078 work continues on this same
  branch; not yet pushed/PR'd itself.
- F001-F077 shipped. F078 is active (this session's work); no further structure migrations are
  queued after it.
- `pnpm verify:pr` passed locally against Docker for F077 (34 package tasks, 5 smoke E2E, 11 full
  E2E across Postgres/MySQL/SQLite/MongoDB, 8 intentional duplicate/inapplicable skips); F078
  instead verified with the narrower `pnpm --filter @qyre/server test/typecheck/build` (see below),
  not yet the full gate.

## Completed

- All product work through F077 is merged and passing. See product specs and Git/PR history.
- The full gate exposed and repaired a corrupt generated SQLite fixture; invalid generated fixtures
  are now recreated after `quick_check`, with a regression test.
- MongoDB now has Playwright browse coverage, including nested documents and disabled SQL Editor;
  SQL-only journeys skip it explicitly.

## In progress

- F078: `packages/server/src/index.ts` (flat, 545 lines) split into `app.ts` (builds Fastify, owns
  the shared mutable `ServerContext`, registers plugins/routes), `routes/<resource>.ts` (health,
  connect, overview, tables, query, console, files), `plugins/<concern>.ts` (host-guard,
  error-handler, static-web), and `services/<concern>.ts` (event-log, csv, files, row-query,
  connection-display, require-adapter). `index.ts` re-exports only the public API - unchanged
  surface, `packages/cli` needed no changes. The former single `src/index.test.ts` (934 lines, 67
  tests) is split into `tests/{routes,plugins,services}/<name>.test.ts` mirroring the source tree,
  plus `tests/support/fake-adapter.ts`; all 67 tests still pass.
  `pnpm --filter @qyre/server test/typecheck/build` all pass; `@qyre/qyre` (cli) and `@qyre/web`
  typecheck and their test suites still pass unchanged against the rebuilt package. Not yet pushed
  or PR'd.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.

## Next steps

- Run `pnpm verify:pr` for F078, push, open a draft PR, and record evidence/PR URL once CI is
  green. No further structure migrations are queued after F078.
