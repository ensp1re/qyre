# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-08.
- Branch: `feature/F077-ui-structure`, branched off merged main (F076/PR #77 landed as 88cbe28).
- F001-F076 shipped. F077 is active (not yet pushed/PR'd); F078 is the only remaining queued
  structure migration.
- `pnpm verify:pr` passes locally against Docker: 34 package tasks, 5 smoke E2E, and 11 full E2E
  tests across Postgres/MySQL/SQLite/MongoDB (8 intentional duplicate/inapplicable skips), captured
  before this session's F077 work; not yet re-run with it.

## Completed

- All product work through F076 is merged and passing. See product specs and Git/PR history.
- The full gate exposed and repaired a corrupt generated SQLite fixture; invalid generated fixtures
  are now recreated after `quick_check`, with a regression test.
- MongoDB now has Playwright browse coverage, including nested documents and disabled SQL Editor;
  SQL-only journeys skip it explicitly.

## In progress

- F077: `packages/ui/src/components/` (flat) reorganized into seven cohesion-based families
  (`data-grid`, `schema`, `query`, `connection`, `shell`, `feedback`, `primitives`), tests moved to
  a mirrored `packages/ui/tests/` tree. Public `@qyre/ui` barrel API unchanged.
  `pnpm --filter @qyre/ui test/typecheck/build` all pass and `@qyre/web` typechecks against the
  rebuilt package. Verified live in Preview (unconfigured target) with no console errors. Not yet
  pushed or PR'd.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.

## Next steps

- Run `pnpm verify:pr` for F077, push, open a draft PR, and record evidence/PR URL once CI is green.
- Then continue F078 server/tests.
