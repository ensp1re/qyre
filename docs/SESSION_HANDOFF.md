# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-09.
- Branch: `feature/F089-filter-table-ux`; F082 is merged to `main` as PR #83 / `7cacbe4`.
- 15 live entries: 8 `passing` (F072, F074-F078, F081-F082), 1 `active` (F089), 6
  `not_started` (F083-F088). `pnpm features:prune` removed F067-F071 and F073 from the live queue.

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

- F089 (filter/table UX): audit and improve Rows table filtering across PostgreSQL, MySQL, SQLite,
  MongoDB, and registered engines. Focus on meaningful per-engine type/operator capabilities,
  server-side rejection of invalid filter combinations, removing MongoDB MinKey/MaxKey as normal
  user-facing filter types, and polishing the filter/table layout with the Qyre design system.
  Implemented: shared `@qyre/core/filter-capabilities`, UI and server both consume it, MongoDB
  sentinels collapse to structured object metadata, and `docs/product-specs/rows-table-filtering.md`
  is updated. Local `pnpm verify:pr` passed.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names) - not fixed yet, unrelated to F081/F082.

## Next steps

- Finish F089: commit, push, open a draft PR, wait for CI, then mark passing with PR/commit
  evidence.
- Then pick from F083-F088 (see `docs/FEATURES.json`), branching off `main` as
  `feature/<ID>-<slug>`, and follow the usual `pnpm verify:pr` -> push -> draft PR -> merge ->
  mark-passing loop.
