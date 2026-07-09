# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-09.
- Branch: `feature/F082-type-aware-filters`, off `main` tip `2250b62` (merge of F081/PR #82).
- 13 features `passing` (F067-F078, F081), **1 `active` (F082)**, 6 `not_started` (F083-F088).

## Completed

- All product and structure work through F078 is merged and passing. See product specs,
  `docs/CODE_ORGANIZATION.md`, and Git/PR history.
- F081 (date/time type fidelity): merged as PR #82/`2250b62`. TIME no longer routes through the
  date-inspect popover; verbose engine type names get a short label; the header's type badge
  attaches to the column name. See `docs/FEATURES.json`'s F081 evidence.
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

- F082 (type-aware filters): boolean columns now offer only eq/neq/isNull/isNotNull with a
  true/false value picker; date/time/timestamp columns get native `<input type="date"|"time"|
"datetime-local">` pickers instead of free text (`dateInputKind()` in format-cell.ts). MongoDB's
  `_id`/`null` filtering already worked server-side (verified live); `minKeyField`/`maxKeyField`
  now get their own `dataType` (`classifyBsonValue`) and filter coercion (`coerceFilterValue`)
  instead of collapsing into the generic "object" bucket with no way to filter them at all.
  Verified live via Preview against Postgres/Mongo `type_showcase`. Not yet run through
  `pnpm verify:pr` / pushed.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names) - not fixed yet, unrelated to F081/F082.

## Next steps

- Finish F082: run `pnpm verify:pr`, push, open a draft PR, wait for CI, mark passing.
- Then pick from F083-F088 (see `docs/FEATURES.json`), branch off `main` as `feature/<ID>-<slug>`,
  and follow the usual `pnpm verify:pr` -> push -> draft PR -> merge -> mark-passing loop.
