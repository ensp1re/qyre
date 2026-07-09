# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-09.
- Branch: `feature/F084-schema-graph-relationships`; F083 is merged to `main` as PR #85 /
  `3bfde82`.
- 15 live entries: 10 `passing` (F072, F074-F078, F081-F083, F089), 1 `active` (F084), 4
  `not_started` (F085-F088). `pnpm features:prune` removed F067-F071 and F073 from the live queue.

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

- F084 (schema graph relationships): make the Schema graph reflect real relationships. Scope from
  the queue: MySQL foreign keys should introspect/draw as edges, disconnected clusters need a clear
  explanation, clicking a table or edge should highlight its relationship chain, and MongoDB should
  not treat `_id` as a relationship. Current implementation adds graph connected-component
  highlighting, cluster/no-FK notices, and a stable MySQL `qyre_demo_orders -> qyre_demo_users`
  fixture relationship. `pnpm --filter @qyre/web test`, MySQL tests through `with-local-env`,
  targeted typechecks, `pnpm check:quiet`, `pnpm verify:pr`, and pre-push `pnpm verify:pr` are
  green. Draft PR #86 is open at https://github.com/ensp1re/qyre/pull/86; GitHub Actions run
  29018185156 is queued.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names) - not fixed yet, unrelated to F081/F082.

## Next steps

- Wait for PR #86 CI. If both jobs pass, record the PR URL and pushed commit, move F084 to
  `passing`, run `pnpm features:prune`, push the state update, then start F085.
