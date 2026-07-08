# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-08.
- Branch: `feature/F076-web-structure`, stacked on the merge-ready F075 PR #76 branch.
- F001-F075 shipped. F076 is active; F077-F080 are queued structure migrations.
- `pnpm verify:pr` passes locally against Docker: 34 package tasks, 5 smoke E2E, and 11 full E2E
  tests across Postgres/MySQL/SQLite/MongoDB (8 intentional duplicate/inapplicable skips).

## Completed

- All product work through F074 is merged and passing. See product specs and Git/PR history.
- Official guidance reviewed for Fastify plugin encapsulation, Vitest test discovery, and
  TypeScript type-only imports. Qyre will use cohesion-based folders and mirrored test trees.
- The full gate exposed and repaired a corrupt generated SQLite fixture; invalid generated fixtures
  are now recreated after `quick_check`, with a regression test.
- MongoDB now has Playwright browse coverage, including nested documents and disabled SQL Editor;
  SQL-only journeys skip it explicitly.

## In progress

- F076: finalize the enforced `shared -> features -> app` web architecture, state ownership,
  versioned persistence, credential-safe recent targets, and mirrored tests in draft PR #77.

## Known issues / blockers

- Full `pnpm check` requires Docker plus the Postgres/MySQL/MongoDB URLs in `AGENTS.md`.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.

## Next steps

- Complete F076 without behavior changes, then continue F077 UI/tests, F078 server/tests, F079
  drivers/tests, and F080 root Playwright layout.
- Add structural enforcement per area immediately after each migration passes.
