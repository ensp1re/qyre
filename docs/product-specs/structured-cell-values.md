# Product Contract: Structured Cell Values (Nested Objects & Arrays)

`RowsTable` (Tables tab) and `QueryRunner`'s result table (SQL Editor) both render arbitrary cell
values via `formatCell` (`packages/ui/src/format-cell.ts`), which today `JSON.stringify`s anything
that isn't a plain string or `null`/`undefined`. This is not a Mongo-only concern: Postgres/MySQL
`json`/`jsonb` columns already produce nested objects and arrays that hit this exact flat-text path,
they've just gone unnoticed so far. This spec covers replacing that flat text with a real, expandable
viewer - engine-agnostic, driven entirely by a cell value's actual shape, not by which engine
produced it.

## Why this is its own spec, not folded into the MongoDB spec

MongoDB (`connect-and-inspect-mongodb.md`, F015) is what surfaces this gap in practice - most of a
Mongo document's fields are exactly this kind of nested value - but the capability itself belongs
to `RowsTable`/`QueryRunner` generically, benefits every existing engine's JSON columns today, and
is independently useful without Mongo ever shipping. Building it as a dedicated, engine-agnostic
feature (rather than Mongo-specific UI work) is what "the web UI is adaptive to every database"
means concretely: new engines with structured values (Mongo now, anything else later) get a working
viewer for free, instead of each engine needing its own bespoke rendering path.

## One-sentence promise

Any cell containing an object or array renders as something a developer can actually read and
explore (expand/collapse nested structure), not a raw JSON string crammed into a table cell.

## Behavior

Revised after the first implementation: inline expansion inside the cell blew up row heights and
broke the table layout in practice (user feedback), so the viewer moved to a drawer - the cell
itself now never changes size.

- A cell whose value is a plain string, number, boolean, or `null`/`undefined` renders exactly as
  today (`formatCell`'s existing primitive path is unchanged).
- A cell whose value is an object or array renders as a compact, single-line summary chip (e.g.
  `{ 3 keys }` or `[ 5 items ]`) plus a dimmed, truncated one-line JSON preview, so rows with
  different content are distinguishable at a glance - and the row never grows. Clicking the chip
  opens a right-anchored inspector drawer (following the query-history drawer's pattern) showing
  the value as an expandable tree - keys/values or array items - recursively, so a nested object
  inside a nested object is still explorable rather than falling back to a JSON string once you're
  more than one level deep. The drawer shows the source column name and offers copy-as-JSON (with
  visible confirmation); it closes via its close button, the backdrop, or Esc.
- Expansion state is local to that drawer instance (not persisted across reloads or synced
  anywhere) - this is a viewer, not new application state.
- Values that are themselves very large (e.g. a huge array or deeply nested document) should not
  freeze the UI - the drawer opens with only the root level expanded and builds deeper levels
  lazily when the developer actually expands them, rather than eagerly rendering every nested
  level up front.

## Scope

In scope:

- `packages/ui`'s `RowsTable` and `QueryRunner` result table, for every engine that can produce a
  structured cell value (Postgres/MySQL `json`/`jsonb` columns today, MongoDB documents once F015
  ships).
- Read-only viewing only - no inline editing of nested values (matches this product's read-only
  posture everywhere else).

Out of scope (for now):

- Search/filter within a single expanded document's fields.
- Editing anything from the drawer (matches the read-only posture; copy-as-JSON is the only
  affordance beyond viewing).

## Acceptance criteria

- A Postgres table with a `jsonb` column showing a nested object renders that cell as a compact
  summary chip, not a raw JSON string, in both the Tables tab and a SQL Editor query result - and
  the row's height stays single-line regardless of the value's size.
- Clicking the chip opens the inspector drawer; expanding a nested value there reveals further
  levels, to at least 3 levels deep without falling back to flat text. Closing the drawer returns
  to the untouched table.
- A primitive-valued cell (string/number/boolean/null) is visually unchanged from today.
- Rendering a table page containing several structured-value cells does not visibly block the UI
  (no long synchronous render pause) even before any drawer is opened.
