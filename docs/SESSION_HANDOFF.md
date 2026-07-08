# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-08.
- Branch: `feature/F075-agent-harness`, based on the F074 passing-state commit after PR #74 merged.
- F001-F074 shipped. F075 is active: compact agent context, feature pruning, tracked skills, and
  scalable organization and delivery workflow.
- `pnpm verify:pr` passes locally against Docker: 34 package tasks, 4 smoke E2E, and 11 full E2E
  tests across Postgres/MySQL/SQLite/MongoDB (5 intentional engine-inapplicable skips).

## Completed

- All product work through F074 is merged and passing. See product specs and Git/PR history.
- Official guidance reviewed for Fastify plugin encapsulation, Vitest test discovery, and
  TypeScript type-only imports. Qyre will use cohesion-based folders and mirrored test trees.
- The full gate exposed and repaired a corrupt generated SQLite fixture; invalid generated fixtures
  are now recreated after `quick_check`, with a regression test.
- MongoDB now has Playwright browse coverage, including nested documents and disabled SQL Editor;
  SQL-only journeys skip it explicitly.

## In progress

- F075 implementation and full local verification are complete. Commit/push/draft PR are blocked
  only by invalid local GitHub CLI authentication.
- Later slices will physically move web, UI, server, driver, and test files; F075 does not mix a
  repository-wide import rewrite into the harness change.

## Known issues / blockers

- Full `pnpm check` requires Docker plus the Postgres/MySQL/MongoDB URLs in `AGENTS.md`.
- GitHub publishing is blocked until `gh auth login -h github.com` repairs the invalid local token.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.

## Next steps

- Run `gh auth login -h github.com`, then commit, normal push, draft PR, and verify both CI jobs.
- Continue the queued behavior-preserving migrations: F076 web/tests, F077 UI/tests, F078
  server/tests, F079 drivers/tests, and F080 root Playwright layout.
- Add structural enforcement per area immediately after each migration passes.
