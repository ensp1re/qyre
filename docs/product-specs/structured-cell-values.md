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

- A cell whose value is a plain string, number, boolean, or `null`/`undefined` renders exactly as
  today (`formatCell`'s existing primitive path is unchanged).
- A cell whose value is an object or array renders as a compact, expandable summary (e.g.
  `{ 3 keys }` or `[ 5 items ]`) that expands inline on click to show its structure - keys/values or
  array items - recursively, so a nested object inside a nested object is still explorable rather
  than falling back to a JSON string once you're more than one level deep.
- Expansion state is local to that cell/render (not persisted across reloads or synced anywhere) -
  this is a viewer, not new application state.
- Values that are themselves very large (e.g. a huge array or deeply nested document) should not
  freeze the UI - render collapsed by default and only build the expanded view when the developer
  actually expands it, rather than eagerly rendering every nested level up front.

## Scope

In scope:

- `packages/ui`'s `RowsTable` and `QueryRunner` result table, for every engine that can produce a
  structured cell value (Postgres/MySQL `json`/`jsonb` columns today, MongoDB documents once F015
  ships).
- Read-only viewing only - no inline editing of nested values (matches this product's read-only
  posture everywhere else).

Out of scope (for now):

- A dedicated full-screen/modal "document viewer" beyond the inline expandable cell - a legitimate
  future enhancement if inline expansion proves too cramped for genuinely large documents, but not
  required to prove the concept.
- Search/filter within a single expanded document's fields.

## Acceptance criteria

- A Postgres table with a `jsonb` column showing a nested object renders that cell as an expandable
  summary, not a raw JSON string, in both the Tables tab and a SQL Editor query result.
- Expanding a cell reveals its nested keys/values (or array items); expanding a nested value within
  that reveals further levels, to at least 3 levels deep without falling back to flat text.
- A primitive-valued cell (string/number/boolean/null) is visually unchanged from today.
- Rendering a table page containing several structured-value cells does not visibly block the UI
  (no long synchronous render pause) even before any cell is expanded.
