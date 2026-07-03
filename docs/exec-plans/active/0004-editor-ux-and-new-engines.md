# Plan 0004: SQL Editor UX and New Engines (MySQL, MongoDB)

Status: Active
Owner: unassigned
Linked features: F012, F013, F014, F015, F016 (`docs/FEATURES.json`)

## Objective

Five feature slices (four requested together in one session, F016 identified while scoping F015),
queued in this priority order (agreed with the user):

1. **F012** - SQL Editor query history (a right-anchored drawer, `localStorage`-backed).
2. **F013** - SQL Editor autocomplete (keywords + table names), which requires migrating the editor
   off a plain `<textarea>` onto CodeMirror 6.
3. **F014** - MySQL as a third engine.
4. **F016** - structured/nested cell viewer (`RowsTable`/`QueryRunner`), engine-agnostic, a hard
   prerequisite for F015.
5. **F015** - MongoDB as a fourth engine, scoped to basic read-only browsing only.

F012 goes first because it needs no editor migration (smallest, lowest-risk). F013 goes second
because it's the bigger, riskier UI change (editor migration) and should land before new engines add
more surface area for that migration to have touched. F014 goes next as an additive new package,
independent of the SQL Editor work. F016 goes before F015 despite being identified later (and having
a higher ID number, per `docs/NAMING.md`'s "IDs are never reused or renumbered" rule) - F015's
documents render mostly as nested fields, which are unusable as flat JSON text without F016 first.

F016 exists because of a real design question raised while scoping F015: should MongoDB get its own
bespoke document-rendering UI, or should the web UI/server be made genuinely adaptive to any engine
that produces structured (non-flat) values? Decision: the latter. `formatCell` already
`JSON.stringify`s any object/array value today for every engine (Postgres/MySQL `jsonb`/`json`
columns already hit this path, unnoticed so far) - F016 replaces that flat text with a real
expandable viewer, benefiting existing engines immediately and giving F015 a working foundation
instead of a Mongo-only special case. A SQL-to-MongoDB query translation layer was considered and
rejected for F015 (see that spec's "Why this engine is scoped differently") - too large and
correctness-risky (subtle mistranslation returning wrong data silently is worse than an honest "not
supported") for what F015 actually needs.

## Scope

In scope: exactly what each linked feature's spec says. See:

- `docs/product-specs/sql-editor.md` (F012, F013)
- `docs/product-specs/connect-and-inspect-mysql.md` (F014)
- `docs/product-specs/structured-cell-values.md` (F016)
- `docs/product-specs/connect-and-inspect-mongodb.md` (F015)

Out of scope (decided while scoping, not left ambiguous):

- Column-name autocomplete (F013) - table names only for v1.
- A Mongo query runner of any kind (F015) - basic browse only; explicitly a separate, larger product
  surface if ever built. A SQL-to-Mongo translation layer specifically was considered and rejected
  (see "Objective" above).
- Per-connection-scoped history (F012) - one shared history list regardless of which database is
  currently connected.
- History entry editing/deletion beyond the existing 50-entry cap dropping the oldest (F012).
- A full-screen/modal document viewer beyond F016's inline expandable cell - a possible future
  enhancement, not required to prove the concept.

## Verification path

- F012: `pnpm --filter @humbdb/ui test && pnpm --filter @humbdb/ui build/typecheck`, plus
  `pnpm test:e2e:full` for the prefill-from-history journey.
- F013: same package-level commands as F012, plus `pnpm test:e2e:full` covering both the editor
  migration (existing Ctrl/Cmd+Enter, toolbar) and new autocomplete behavior.
- F014: `pnpm --filter @humbdb/core test && pnpm --filter @humbdb/driver-contract test && pnpm --filter @humbdb/mysql test && pnpm --filter humb test`, plus `pnpm test:e2e:full` (a third
  Playwright project/fixture, per F011's precedent) and a manual live-verification pass against a
  real MySQL container (matching F008's pattern for SQLite before its e2e slice existed).
- F016: `pnpm --filter @humbdb/ui test && pnpm --filter @humbdb/ui build/typecheck && pnpm --filter @humbdb/web build`, plus `pnpm test:e2e:full` (a Postgres `jsonb` fixture column exercises this
  without needing Mongo to exist yet).
- F015: `pnpm --filter @humbdb/core test && pnpm --filter @humbdb/driver-contract test && pnpm --filter @humbdb/mongodb test && pnpm --filter humb test`, plus a manual live-verification pass
  against a real MongoDB container. Playwright e2e coverage for Mongo is not required by this plan
  (no query runner to exercise, and DF-05/Schema-tab-style assertions would need a Mongo-shaped
  fixture) - decide when F015 is picked up whether a lightweight smoke-level e2e check is worth
  adding.
- Re-verify unaffected engines after each slice: `pnpm --filter @humbdb/postgres test`,
  `pnpm --filter @humbdb/sqlite test` (with `HUMB_TEST_DATABASE_URL` set), `pnpm test:e2e:full`.

## Risks and blockers

- **Editor migration (F013) is the riskiest single change in this plan.** CodeMirror 6's default
  styling must be reskinned to match `docs/references/design-system.md`, in both light and dark
  mode, without regressing the existing toolbar/gutter/Ctrl+Enter behavior. Do this as its own
  reviewable step before layering autocomplete on top, so a styling regression and an autocomplete
  bug are never entangled in the same diff.
- **MySQL's read-only backstop** (`START TRANSACTION READ ONLY`) must be verified live the same way
  F006 verified Postgres's - a test that tries to sneak a write past the string heuristic and
  confirms only the transaction mode stops it, not the regex.
- **MongoDB's weaker read-only guarantee** (code-level, not driver-level - see that spec's "Read-only
  enforcement" section) is a real, intentional scope reduction. Do not silently strengthen or weaken
  this story without updating the spec first.
- **F016 must not regress existing Postgres/MySQL `jsonb`/`json` rendering** - it's a generalization
  of `formatCell`'s existing (if unnoticed) nested-value path, not a Mongo-only addition; verify
  against a real Postgres `jsonb` fixture, not just against Mongo once F015 exists.
- Both new engines need a real running instance to develop/verify against (Docker, matching how
  Postgres/SQLite work today) - no CI service dependency assumed yet; add one if `pnpm check:ci`
  needs to cover them.

## Progress log

- 2026-07-03: Plan created. Clarified four open decisions with the user before writing this plan or
  any `FEATURES.json` entries (per this repo's working contract): CodeMirror 6 migration (not a
  hand-rolled textarea popup) for F013; table-name-only autocomplete depth for v1; per-browser,
  successful-queries-only history for F012; basic-browse-only scope (no query runner) for F015. All
  four recorded as `not_started` in `docs/FEATURES.json` in the priority order above.
- 2026-07-03: Follow-up in the same session - the user asked whether MongoDB needs its own adapted
  UI or a SQL translation layer. Investigated `formatCell` (`packages/ui/src/format-cell.ts`):
  confirmed nested-value rendering is already a generic gap (Postgres/MySQL `jsonb`/`json` columns
  hit the same flat-text path today), not something specific to Mongo. Split it out as F016, a
  prerequisite for F015, rather than folding bespoke document-rendering into F015 itself - this is
  what makes the UI "adaptive to every database" rather than special-cased per engine. Rejected a
  SQL-to-MongoDB translation layer as an alternative to F015's "no query runner" scope (too large and
  correctness-risky for what F015 needs - see F015's spec).
- 2026-07-03: Implemented F012 (commit `8f86d9a`). Also fixed a real concurrency bug in
  `@humbdb/testing`'s `setupFixture` (Postgres advisory lock around DROP+CREATE), surfaced by adding
  a second `@full` spec against the same live database - see F012's `FEATURES.json` evidence.
  Next up: F013.

## Open decisions

- Whether F015 needs any Playwright e2e coverage at all, or whether package-level integration tests
  plus a manual live pass are sufficient given there's no query runner to exercise - decide when
  F015 is picked up.
- MySQL client library choice (e.g. `mysql2`) - decide when F014 is picked up; no library has been
  evaluated yet.
- MongoDB client library is the official `mongodb` driver by default (no reason to deviate) - decide
  final version pin when F015 is picked up.
