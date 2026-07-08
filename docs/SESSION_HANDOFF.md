# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-08.
- Branch: `feature/F077-ui-structure` (F077 tip `eb1fd5a`, merged into main as PR #78 / `36fc66e`).
  F078 continues on this same branch, pushed as commit `6d78647`; PR #79 is open as a **draft**,
  not yet merged, with CI green (End-to-end and Lint/typecheck/test/build both pass).
- F001-F077 shipped. F078 is active (CI-green, unmerged); no further structure migrations are
  queued after it.
- `pnpm verify:pr` passed locally against Docker for both F077 and F078 (34 package tasks, 5 smoke
  E2E, 11 full E2E across Postgres/MySQL/SQLite/MongoDB, 8 intentional duplicate/inapplicable
  skips); GitHub Actions confirmed the same on PR #79.

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
  typecheck and their test suites still pass unchanged against the rebuilt package. Pushed as
  `6d78647`; PR #79 open as a draft with CI green, awaiting merge.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.

## Next steps

- Mark PR #79 ready for review and merge it, then mark F078 `passing` in `FEATURES.json` with the
  merge commit hash (mirroring F074/F076/F077). No further structure migrations are queued after
  F078.
