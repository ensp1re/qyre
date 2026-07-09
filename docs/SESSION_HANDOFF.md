# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-09.
- Branch: `feature/F088-cli-guided-login`; F088 is open as PR #90, CI green, not yet merged.
- 15 live entries: all 15 `passing` (F072, F074-F078, F081-F089). No `active` or `not_started`
  entries remain - the next feature ID is F090. `pnpm features:prune` removed F067-F071 and F073
  from the live queue.

## Completed

- All product and structure work through F078 is merged and passing. See product specs,
  `docs/CODE_ORGANIZATION.md`, and Git/PR history.
- F081 (date/time type fidelity): merged as PR #82/`2250b62`. TIME no longer routes through the
  date-inspect popover; verbose engine type names get a short label; the header's type badge
  attaches to the column name. See `docs/FEATURES.json`'s F081 evidence.
- F082 (type-aware filters): merged as PR #83/`7cacbe4`. Boolean columns offer only
  eq/neq/isNull/isNotNull with a true/false picker; date/time/timestamp columns use native
  date/time/datetime inputs; MongoDB MinKey/MaxKey values classify and coerce as BSON sentinels.
  Local `pnpm verify:pr` passed, and GitHub CI passed both End-to-end and
  Lint/typecheck/test/build.
- F089 (filter/table UX): merged as PR #84/`4f8ffe6`. Shared
  `@qyre/core/filter-capabilities` now drives UI operator/value controls and server-side rejection
  of invalid filter combinations; MongoDB MinKey/MaxKey display as structured values rather than
  scalar filter types. Local `pnpm verify:pr` passed, and GitHub CI passed both End-to-end and
  Lint/typecheck/test/build.
- F083 (row selection/export): merged as PR #85/`3bfde82`. RowsTable now supports clear selection,
  select-all-current-page, pointer drag selection, and selected-row CSV export while preserving the
  existing full filtered export when nothing is selected. Local `pnpm verify:pr` passed, and GitHub
  CI passed both End-to-end and Lint/typecheck/test/build.
- F084 (schema graph relationships): merged as PR #86/`c2160d8`. The Schema graph now highlights
  connected relationship chains, explains disconnected/no-FK graphs, uses a stable MySQL
  `qyre_demo_orders -> qyre_demo_users` fixture edge, and keeps MongoDB `_id` out of relationship
  edges. Local `pnpm verify:pr` and pre-push `pnpm verify:pr` passed.
- F085 (database switching sync): merged as PR #87/`78912a5`. Switching the active connection now
  resets/refetches database-owned React Query caches, clears stale local table/file/query metrics
  while preserving the SQL draft, hides unsupported tabs, and moves the active tab off SQL when
  `supportsSql=false`. Local `pnpm verify:pr`, pre-push `pnpm verify:pr`, and GitHub CI passed.
- F086 (URL cell previews): merged as PR #88/`060f6c7`-ancestor (pre-F087 merge). Shared cell
  rendering now classifies strict http(s) URLs, renders image URL thumbnails and plain URL link
  chips, opens URL values in `CellValueDrawer`, gives long raw text a distinct bordered muted
  treatment, and clarifies the Files tab disabled copy as `--files-dir`-gated rather than
  engine-gated. Local `pnpm verify:pr`, pre-push `pnpm verify:pr`, and GitHub CI passed.
- F087 (settings UI): merged as PR #89/`060f6c7`. See `docs/FEATURES.json`'s F087 evidence.
- F088 (CLI guided login): open as PR #90/`c283172`. `--login` prompts interactively for engine
  (Postgres/MySQL/MongoDB)/user/masked password/host/port/database, retrying the connect attempt
  on failure; a direct target with no username is prompted for just the missing credentials when
  stdin is a TTY. `connectToRaw` now also `ping()`s after `connect()` so a bad Postgres/MySQL
  target (whose `connect()` alone doesn't test connectivity) is caught immediately instead of
  surfacing later as a broken schema load. `--help` and the guided prompts explain the npx
  protocol:// pitfall and share the startup banner's gradient "QYRE" title. See `docs/FEATURES.json`'s
  F088 evidence.
- The QA demo dataset (28-table B2B logistics/e-commerce set, 52k rows/table, plus `type_showcase`
  exercising each engine's native type system) now lives in a separate `qyre_demo` database
  (Postgres/MySQL/MongoDB) so it no longer collides with `qyre_test`, which the E2E fixtures expect
  to stay minimal - see the `qyre-preview-demo` launch config. `.local/demo.sqlite` (gitignored)
  covers SQLite, unaffected by the split since it was never a shared container.
- `e2e/connect-and-inspect.spec.ts`'s schema-grid assertions are now scoped to the fixture's own
  card by name (`qyre_demo_users`) instead of assuming it's the only table present - the unscoped
  version broke under Playwright's strict mode as soon as a target database held more than one
  table.

## In progress

- Nothing active. F088 is merge-ready (PR #90, CI green) but not yet merged into `main`.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names) - not fixed yet, unrelated to F081/F082.

## Next steps

- Merge PR #90 (F088) once reviewed. No feature is queued after it - the next feature ID is F090;
  pick the next slice of work with the user before starting it.
