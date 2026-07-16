# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-16.
- Branch: `feature/F146-grid-editing-ux-polish`; draft PR #160 contains F146.
- Queue: DF-10 through DF-12 are passing. F146 is active, continuing the same 0007 audit plan on
  the grid-editing surface. DF-13 (guided Add/Duplicate row composer) is next after F146.

## Completed

- DF-10 through DF-12 (audit, editing integrity, shared typed editors) are passing and merged.
- F146 rounds 1-5 (PR #160): whole-cell scalar editing, stable selection, keyboard/copy/paste/undo,
  staged commits, single-editor coordination, responsive controls, and Explain-only SQL behavior.
- Rounds 6-8: compact validated drawers for structured/binary/XML/interval values, lossless temporal
  editing, cross-engine byte handling, enum selectors, containment filters, and post-write refresh.
- Rounds 9-11: stable long-text geometry, plain substring SQL JSON/array filters, invalid-Apply
  blocking, legacy interval normalization, and insert-safe binary duplication.

## In progress

- Round 12 is implemented locally and intentionally uncommitted/unpushed pending user UI approval.
  MongoDB now uses the shared typed grid for Add/Duplicate/edit/delete/Commit, previews JSON
  operations, preserves BSON types in field-level `$set` updates, and rejects same-field concurrent
  edits. Focused core/UI/web/server tests, live MongoDB integration, and MongoDB browser E2E pass.
  The full local `pnpm verify:pr` gate passes with 34/34 package tasks, check:state, smoke E2E
  (11 passed, 4 skipped), and full E2E (30 passed, 47 skipped). Current step: rebuild the CLI bundle,
  open the UI, and wait for user approval before any commit or push.
- Round 13 is in progress locally: MongoDB regex, timestamp, code, MinKey, and MaxKey fields now
  receive dedicated validated JSON drawer editors instead of `unsupported`; Add row prefills valid
  type templates, and the server/driver round-trip them as native BSON values. The full local
  `pnpm verify:pr` gate passes with 34/34 package tasks, check:state, smoke E2E (11 passed, 4
  skipped), and full E2E (30 passed, 47 skipped). Current step: rebuild and reopen the UI, then wait
  for user approval. Do not commit or push before approval.
- Round 14 fixes MongoDB row commits that received `_id` as an ObjectId/Extended JSON object instead
  of plain text. The adapter now emits ObjectIds as stable lowercase hex row keys across BSON
  package boundaries, while server validation safely accepts and normalizes `$oid`. Server tests
  pass 308/308, live MongoDB passes 77/77, the focused Mongo browser commit journey passes, and the
  full local gate passes with 34/34 package tasks, smoke E2E (11 passed, 4 skipped), and full E2E
  (30 passed, 47 skipped). Current step: reopen the rebuilt app and wait for user validation; do not
  commit or push before approval.
- Round 15 handles a pre-fix browser page that still submits the exact legacy 12-byte ObjectId
  buffer shape. The rebuilt production server accepted that payload and restored the edited demo
  row, then the rebuilt browser UI committed and restored the row again without error. Server tests
  pass 309/309 and the Node 22 full gate passes unchanged. Port 7717 is running the rebuilt CLI;
  do not commit or push before approval.
- Round 16 fixes fast click-away staging for inline scalar inputs by committing the DOM input's live
  value instead of a potentially one-render-old React draft. All 421 UI tests pass, and rebuilt
  production browser checks stage the changed value on click-away in MongoDB and PostgreSQL. The
  user approved commit and push; run the Node 22 full gate, commit, and push normally.

## Known issues / blockers

- Repository verification must use Node 22; Node 24+ cannot load the current `better-sqlite3` native
  binding.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`; the
  CLI (`@qyre/qyre`) also bundles a copy of `apps/web/dist` into its own `dist/web` at build time
  (F010) - rebuild `@qyre/qyre` too after changing `apps/web`, or a running `qyre <target>` session
  will keep serving the stale bundled copy instead of the fresh one.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.
- GitHub Actions credits are exhausted, so PR #160 cannot currently obtain CI results; local
  `pnpm verify:pr` is the available verification evidence.
- Deferred by explicit scoping decision, not oversight: full column resize/reorder/frozen columns,
  a complete toolbar regroup into 4 sections with an overflow menu (only a light-touch separator was
  added), full drag-to-select multi-cell copy/paste (only single-cell and best-effort TSV-block
  paste from one anchor cell are implemented), and JSON syntax highlighting (kept plain monospace
  with inline validation errors instead). Revisit only if explicitly requested - the grid-editing
  interaction model was the higher-impact target per the audit's own prioritization.

## Next steps

- When GitHub Actions credits return, run CI on PR #160; after it passes, record the PR/commit, move
  F146 to `passing`, and run `pnpm features:prune`.
- Then return to `main` and activate DF-13, the guided Add/Duplicate row composer.
