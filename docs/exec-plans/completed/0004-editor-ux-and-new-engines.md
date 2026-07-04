# Plan 0004: SQL Editor UX and New Engines (MySQL, MongoDB)

Status: Done - all six slices passing.
Owner: unassigned
Linked features: F012, F017, F013, F014, F015, F016 (`docs/FEATURES.json`)

F018 and F019 are related but separate bug fixes (not among this plan's six slices). F018 was found
live while the user was trying F013, tracked in `docs/FEATURES.json` and
`docs/product-specs/sql-editor.md`'s new "Double-quoted string values" section. F019 was prompted
by the user asking to systematically test every column type across all three engines while F016
was fresh, tracked in `docs/FEATURES.json` and `docs/product-specs/column-type-fidelity.md`. See
the progress log below.

## Objective

Six feature slices (four requested together in one session; F016 identified while scoping F015;
F017 identified while testing F012), queued in this priority order (agreed with the user):

1. **F012** - SQL Editor query history (a right-anchored drawer, `localStorage`-backed). Done.
2. **F017** - error handling: a global Fastify error handler plus a shared `ErrorState` UI component,
   replacing today's inconsistent inline error text everywhere. Done.
3. **F013** - SQL Editor autocomplete (keywords + table names), which requires migrating the editor
   off a plain `<textarea>` onto CodeMirror 6. Done.
4. **F014** - MySQL as a third engine. Done.
5. **F016** - structured/nested cell viewer (`RowsTable`/`QueryRunner`), engine-agnostic, a hard
   prerequisite for F015. Done.
6. **F015** - MongoDB as a fourth engine, scoped to basic read-only browsing only. Done.

F012 goes first because it needs no editor migration (smallest, lowest-risk). F017 goes next -
found while testing F012 (a real query-error bug), and the user asked for it explicitly as the next
task right after F012, ahead of F013, despite F013 having been next in line before this came up.
F013 goes after that because it's the bigger, riskier UI change (editor migration) and should land
before new engines add more surface area for that migration to have touched. F014 goes next as an
additive new package, independent of the SQL Editor work. F016 goes before F015 despite being
identified later (and having a higher ID number, per `docs/NAMING.md`'s "IDs are never reused or
renumbered" rule) - F015's documents render mostly as nested fields, which are unusable as flat JSON
text without F016 first.

F017 exists because testing F012 surfaced a real bug, not just a UX gap: running a query against a
non-existent table showed a raw, useless error (see that feature's `FEATURES.json` behavior and
`docs/product-specs/error-handling.md` for the root cause - `POST /api/query` re-throws any
non-`ReadOnlyViolationError` failure, which falls through to Fastify's default handler and returns
the wrong field for the frontend to read). The user asked to scope this broadly - server AND UI,
across every data-driven view (Tables/Schema/Files/Console, not just the SQL Editor) - rather than a
narrow one-off fix to the single route that happened to surface it.

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
- `docs/product-specs/error-handling.md` (F017)
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
- F017: `pnpm --filter @humbdb/server test && pnpm --filter @humbdb/ui test && pnpm --filter @humbdb/ui build/typecheck && pnpm --filter @humbdb/web build`, plus `pnpm test:e2e:full` -
  a query against a fixture-guaranteed-missing table exercises the real-message-surfaces-correctly
  path without needing a new fixture.
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

- **F017's global error handler must not swallow existing specific error handling.**
  `ReadOnlyViolationError`'s explicit 400 (F006) must keep working exactly as it does today - the
  global `setErrorHandler` is the catch-all beneath route-level handling, not a replacement for it.
  Verify both cases explicitly: a read-only violation still returns its existing message/400, and a
  genuine unexpected error (bad table name) now returns the _real_ message instead of Fastify's
  generic reason phrase.
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
- 2026-07-03: Follow-up fix on F012 - moved the history toolbar icon from next to Run/the
  Ctrl+Enter hint to the right-aligned group with the line count, per feedback.
- 2026-07-03: While testing F012, found a real bug (see "Objective" above) and scoped it as F017,
  inserted right after F012 in priority order per the user's explicit request. Wrote
  `docs/product-specs/error-handling.md` and the `FEATURES.json` entry; not yet implemented.
- 2026-07-03: Implemented F017 (commit `053b023`). Next up: F013.
- 2026-07-03: Implemented F013 (commit `d315870`) - see `FEATURES.json`'s evidence for full detail.
  Migrated `QueryRunner` to CodeMirror 6 with schema-aware autocomplete (keywords + table names).
  Found and fixed a real bug during live verification: CodeMirror's own `defaultKeymap` binds
  `Mod-Enter` to `insertBlankLine`, silently intercepting the Ctrl/Cmd+Enter-to-run binding (it was
  inserting a blank line instead of running the query) - fixed with `Prec.highest`. Next up: F014
  (MySQL).
- 2026-07-03: User hit a real bug live while trying F013: `SELECT * FROM employees WHERE
department="Support"` failed with `column "Support" does not exist`. Not a Humb bug - standard
  SQL reserves `""` for identifiers - but confirmed Postgres is stricter about it than MySQL
  (treats `"..."` as a string by default) or SQLite (falls back to a string when the token isn't a
  real identifier, a documented quirk). Asked the user how strictly to handle it before writing any
  code - confirmed rewriting only double-quoted tokens that match no real identifier (never
  changing a currently-working query), Postgres-only. Scoped and implemented as F018 (commit
  `a316bd3`), tracked separately from this plan's six slices since it isn't one of them - see
  `docs/product-specs/sql-editor.md`'s new "Double-quoted string values" section and F018's
  `FEATURES.json` evidence.
- 2026-07-03: Implemented F014 (commit `9ccde55`) - see `FEATURES.json`'s evidence for full detail.
  New `@humbdb/mysql` on `mysql2/promise`, mirroring `@humbdb/postgres`'s shape. Found and fixed two
  real bugs while wiring up the third e2e engine project: every webServer instance was silently
  inheriting every test-DB env var at once (fixed with an explicit `HUMB_E2E_ENGINE` per instance),
  and a reproduced `setupSqliteFixture` concurrency race once total Playwright parallelism went up
  (fixed the same way F012 fixed the analogous Postgres race). Next up: F016 (structured-cell
  viewer).
- 2026-07-03: Implemented F016 (commit `070f995`) - see `FEATURES.json`'s evidence for full detail.
  New `CellValue` component (`packages/ui/src/components/cell-value.tsx`) replaces `formatCell`'s
  flat-text rendering in `RowsTable`/`QueryRunner` for object/array values with a recursive,
  lazily-expanding tree. Found and fixed two real bugs during live/e2e verification, not just a
  coverage gap: (1) the original plan for verifying against "a Postgres jsonb fixture column"
  turned into a second fixture _table_ on the first pass, which made the Schema tab render two
  table-detail cards and broke `connect-and-inspect.spec.ts`'s singular-card assertion under
  concurrent `@full` specs - fixed by adding the jsonb column to the existing shared
  `humb_demo_users` fixture instead (populated for one row only); (2) a primitive value nested
  inside an expanded structured value rendered as a bare text node with no element boundary of its
  own (indistinguishable from its sibling key label to Playwright or any other DOM consumer) - fixed
  by wrapping `CellValue`'s primitive branch in its own `<span>`. Next up: F015 (MongoDB).
- 2026-07-03: F016 redesigned (commit `57fd354`) after user feedback that the inline expansion
  broke the table layout (row heights blew up, "not comfortable and not user friendly") - the
  exact outcome the spec's original out-of-scope note anticipated. The cell is now a compact
  single-line chip that never grows the row; clicking it opens a new right-anchored
  `CellValueDrawer` (`QueryHistoryDrawer`'s pattern) with the expandable tree, syntax-colored
  primitives, the source column name, and copy-as-JSON. Spec's Behavior/Acceptance sections
  revised to match; e2e spec now walks chip -> drawer -> three levels -> close. Still next up:
  F015 (MongoDB).
- 2026-07-03: F016 polish (commit `16dfd4b`) after the user asked whether chip + drawer is the
  best-in-class UX: the pattern matched Supabase/TablePlus/DataGrip already, but three gaps
  didn't - identical `{ N keys }` chips made rows indistinguishable without opening each drawer
  (fixed: dimmed truncated JSON preview in the chip, capped at 80 chars/280px), no Esc-to-close
  (fixed), and no copy confirmation (fixed: green check flash). Deliberately not added, possible
  future follow-ups: a raw-JSON/tree view toggle in the drawer, search within a document, and
  keeping the drawer pinned while clicking between cells.
- 2026-07-03: User asked to systematically test every column type across all three engines while
  F016 was fresh, not just JSON - scoped and implemented as F019 (commit `f850c43`), tracked
  separately from this plan's six slices (same precedent as F018). Seeded a wide-type fixture
  table against live Postgres/MySQL/SQLite and inspected actual JSON responses rather than
  assuming driver defaults were safe - found and fixed three real defect categories (date/timestamp
  timezone shift in Postgres+MySQL, BIGINT precision loss in MySQL+SQLite, confusing binary-value
  rendering in all three) - see `docs/product-specs/column-type-fidelity.md` and F019's
  `FEATURES.json` evidence for full detail, including two second-order regressions caught before
  shipping (MySQL's blanket `bigNumberStrings` broke `ping()`/`rowCount`; SQLite's database-wide
  `defaultSafeIntegers` would have broken internal pragma comparisons the same way). Still next up:
  F015 (MongoDB).
- 2026-07-04: Implemented F015 (commit `44a4f15`) - see `FEATURES.json`'s evidence for full detail.
  New `@humbdb/mongodb` on the official `mongodb` driver (v7.4.0). Resolved both open decisions
  below while picking this up: no Playwright e2e project for Mongo (package-level integration tests
  against a real container, plus a manual live-verification pass, matched the spec's own suggested
  bar - no query runner to exercise and the existing generic connect-and-inspect spec would need a
  Mongo-shaped fixture); `mongodb` is the client library, no reason to deviate. Applied F019's
  column-type-fidelity rigor proactively rather than discovering it live later: confirmed against a
  real container before writing any fix that `Long`/`Decimal128` serialize to useless shapes by
  default (`{high,low,unsigned}` and `{"$numberDecimal":...}`) and normalized them to a plain
  number/string; reused F019's existing binary-value chip/hex-dump viewer for BSON `Binary` instead
  of inventing a second representation. This is this plan's sixth and last slice - plan complete.

## Open decisions

None remaining - both resolved when F015 was picked up (see the progress log entry above).
