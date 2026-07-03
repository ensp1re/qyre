# Plan 0004: SQL Editor UX and New Engines (MySQL, MongoDB)

Status: Active
Owner: unassigned
Linked features: F012, F013, F014, F015 (`docs/FEATURES.json`)

## Objective

Four feature slices requested together in one session, queued in this priority order (agreed with
the user):

1. **F012** - SQL Editor query history (a right-anchored drawer, `localStorage`-backed).
2. **F013** - SQL Editor autocomplete (keywords + table names), which requires migrating the editor
   off a plain `<textarea>` onto CodeMirror 6.
3. **F014** - MySQL as a third engine.
4. **F015** - MongoDB as a fourth engine, scoped to basic read-only browsing only.

F012 goes first because it needs no editor migration (smallest, lowest-risk). F013 goes second
because it's the bigger, riskier UI change (editor migration) and should land before new engines add
more surface area for that migration to have touched. F014/F015 go last since they're additive new
packages, independent of the SQL Editor work.

## Scope

In scope: exactly what each linked feature's spec says. See:

- `docs/product-specs/sql-editor.md` (F012, F013)
- `docs/product-specs/connect-and-inspect-mysql.md` (F014)
- `docs/product-specs/connect-and-inspect-mongodb.md` (F015)

Out of scope (decided while scoping, not left ambiguous):

- Column-name autocomplete (F013) - table names only for v1.
- A Mongo query runner of any kind (F015) - basic browse only; explicitly a separate, larger product
  surface if ever built.
- Per-connection-scoped history (F012) - one shared history list regardless of which database is
  currently connected.
- History entry editing/deletion beyond the existing 50-entry cap dropping the oldest (F012).

## Verification path

- F012: `pnpm --filter @humbdb/ui test && pnpm --filter @humbdb/ui build/typecheck`, plus
  `pnpm test:e2e:full` for the prefill-from-history journey.
- F013: same package-level commands as F012, plus `pnpm test:e2e:full` covering both the editor
  migration (existing Ctrl/Cmd+Enter, toolbar) and new autocomplete behavior.
- F014: `pnpm --filter @humbdb/core test && pnpm --filter @humbdb/driver-contract test && pnpm --filter @humbdb/mysql test && pnpm --filter humb test`, plus `pnpm test:e2e:full` (a third
  Playwright project/fixture, per F011's precedent) and a manual live-verification pass against a
  real MySQL container (matching F008's pattern for SQLite before its e2e slice existed).
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
- Both new engines need a real running instance to develop/verify against (Docker, matching how
  Postgres/SQLite work today) - no CI service dependency assumed yet; add one if `pnpm check:ci`
  needs to cover them.

## Progress log

- 2026-07-03: Plan created. Clarified four open decisions with the user before writing this plan or
  any `FEATURES.json` entries (per this repo's working contract): CodeMirror 6 migration (not a
  hand-rolled textarea popup) for F013; table-name-only autocomplete depth for v1; per-browser,
  successful-queries-only history for F012; basic-browse-only scope (no query runner) for F015. All
  four recorded as `not_started` in `docs/FEATURES.json` in the priority order above.

## Open decisions

- Whether F015 needs any Playwright e2e coverage at all, or whether package-level integration tests
  plus a manual live pass are sufficient given there's no query runner to exercise - decide when
  F015 is picked up.
- MySQL client library choice (e.g. `mysql2`) - decide when F014 is picked up; no library has been
  evaluated yet.
- MongoDB client library is the official `mongodb` driver by default (no reason to deviate) - decide
  final version pin when F015 is picked up.
