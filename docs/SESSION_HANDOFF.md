# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-08.
- Branch: `main`, tip `d2e2edc` (merge of F078/PR #79).
- **All 12 features in `docs/FEATURES.json` are `passing`, 0 `active`, 0 `not_started`.** F078
  (PR #79) was verified with `pnpm verify:pr` locally against Docker and confirmed again by CI on
  `main` after merge (both "Lint, typecheck, test, build" and "End-to-end" jobs green).
- The `packages/{server,ui}` and `apps/web` structure migrations (F076-F078) are all complete; no
  further structure migrations are queued.

## Completed

- All product and structure work through F078 is merged and passing. See product specs,
  `docs/CODE_ORGANIZATION.md`, and Git/PR history.
- The full gate exposed and repaired a corrupt generated SQLite fixture; invalid generated fixtures
  are now recreated after `quick_check`, with a regression test.
- MongoDB now has Playwright browse coverage, including nested documents and disabled SQL Editor;
  SQL-only journeys skip it explicitly.
- **F078 `passing`** ([PR #79](https://github.com/ensp1re/qyre/pull/79), merged as `d2e2edc`):
  `packages/server/src/index.ts` (flat, 545 lines) split per `docs/CODE_ORGANIZATION.md`'s server
  contract into `app.ts` (builds Fastify, owns the shared mutable `ServerContext`, registers
  plugins/routes), `routes/<resource>.ts` (health, connect, overview, tables, query, console,
  files), `plugins/<concern>.ts` (host-guard, error-handler, static-web), and
  `services/<concern>.ts` (event-log, csv, files, row-query, connection-display,
  require-adapter). `index.ts` re-exports only the public API - unchanged surface, `packages/cli`
  needed no changes. The former single `src/index.test.ts` (934 lines, 67 tests) is split into
  `tests/{routes,plugins,services}/<name>.test.ts` mirroring the source tree, plus
  `tests/support/fake-adapter.ts`; all 67 tests still pass.

## In progress

- Nothing in flight. All 12 features are `passing` - see "Next steps".

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.

## Next steps

- No queued feature work. Pick the next `F###`/`DF-##` from product priorities, branch off `main`
  as `feature/<ID>-<slug>`, and follow the usual `pnpm verify:pr` -> push -> draft PR -> merge ->
  mark-passing loop.
