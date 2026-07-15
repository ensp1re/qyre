# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-15.
- Branch: `feature/DF-12-shared-typed-editors`, based on `main` at `ab9406a` (merged PR #158).
- Queue: DF-12 is active; DF-10 and DF-11 are passing. The next approved slice is DF-13.
- DF-12 implementation and local verification are complete; it is not yet committed, pushed, or in
  a PR.

## Completed

- DF-10 captured the evidence-based product audit and approved nine-slice plan in PR #157.
- DF-11 delivered lossless temporal/editing integrity and stable scalar interaction in PR #158.
- DF-12 now provides shared Button, IconButton, Field, custom Select/Combobox, and editor-action
  primitives; lossless typed row/Mongo editors; authoritative PostgreSQL enum/array and MySQL
  enum/set metadata; exact server-side mutation validation; and explained fail-closed handling for
  unsupported types.
- Live browser validation covered JSON error/recovery, inspection versus editing, add/commit,
  keyboard focus, selector keyboard behavior, and 848px/640px editor collision containment.
- Final local `pnpm verify:pr` passed: 34/34 package tasks, 11 smoke E2E (4 expected skips), and 29
  full E2E (43 expected skips), including write, read-only, structured-value, and MongoDB workflows.

## In progress

- Review the complete DF-12 diff, commit, push, open a draft PR, wait for both CI jobs, then record
  PR/commit evidence and mark DF-12 passing.

## Known issues / blockers

- No DF-12 blocker is known.
- Repository verification must use Node 22; Node 24 cannot load the current `better-sqlite3` native
  binding.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.

## Next steps

- Deliver DF-12 through its draft PR and CI lifecycle.
- After DF-12 merges, return to `main` and activate DF-13, the guided Add/Duplicate row composer.
