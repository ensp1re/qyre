# Product Contract: Adapter Capability Flags

`DatabaseAdapter` (`packages/drivers/contract`) was designed against Postgres's relational shape
first, then MongoDB (F015) was made to fit it: `getTable` always returns `ColumnMetadata[]` with a
`dataType` string and `isPrimaryKey`/`isForeignKey` booleans, and `indexes` is always an array - so
MongoDB's adapter fakes plausible-looking values (`dataType: "any"` for every field, `indexes: []`,
`isPrimaryKey` only for `_id`) instead of returning something structurally different. Meanwhile
`apps/web` decides what UI to show per engine by string-comparing `overview.engine === "mongodb"` in
two places (`App.tsx`'s `isMongo`, `sql-editor-tab.tsx`) instead of asking the adapter what it
actually supports.

This spec fixes the second problem (string-check branching) with a minimal, real capability flag.
It deliberately does **not** attempt the first problem (MongoDB's data shape) - see "Out of scope."

## One-sentence promise

Adding a future engine that can't run SQL (or otherwise diverges from the relational shape) never
requires touching `apps/web`'s tab-disabling logic by name - it declares what it supports once, in
its own adapter package.

## Behavior

- `DatabaseOverview` (`packages/core/src/types/`, returned by `getOverview()`) gains a new field:
  ```ts
  export interface AdapterCapabilities {
    /** Whether runReadOnlyQuery accepts real SQL text - false disables the SQL Editor tab and the
     * Files tab's "Run in editor" action, which both submit raw SQL. */
    readonly supportsSql: boolean;
  }
  ```
  `DatabaseOverview.capabilities: AdapterCapabilities` sits alongside the existing `engine` field.
- Each `AdapterFactory`/adapter declares its own capabilities: Postgres, MySQL, and SQLite report
  `{ supportsSql: true }`; MongoDB reports `{ supportsSql: false }` - matching today's actual
  behavior (MongoDB's `runReadOnlyQuery` isn't implemented at all; see
  `docs/product-specs/connect-and-inspect-mongodb.md`).
- `apps/web`'s `App.tsx` replaces `const isMongo = overview.data?.engine === "mongodb"` with reading
  `overview.data?.capabilities.supportsSql`. The two existing consumers (the SQL Editor tab's
  disabled-tab tooltip, and the Files tab's "Run in editor" button) change from "is this MongoDB" to
  "does this adapter support SQL" - same UI outcome for today's 4 engines, but no engine name baked
  into `apps/web` anymore.
- A future non-SQL engine (e.g. a key-value or graph store) sets `supportsSql: false` in its own
  adapter package and gets the same UI treatment MongoDB gets today, automatically - no `apps/web`
  change required.

## Out of scope (for now)

- Reshaping `TableMetadata`/`ColumnMetadata` so MongoDB (or a future engine) returns something other
  than the relational shape (e.g. a real per-field type inferred from sampled documents instead of
  `"any"`, or omitting `indexes ` entirely instead of always-empty). No current UI behavior is
  actually broken by the fake values - `RowsTable`'s type column just renders `"any"`, and an empty
  `indexes` array renders nothing - so this is cosmetic imprecision, not a live bug. Revisit if a
  future engine's data model diverges enough that the relational shape becomes actively misleading
  rather than merely imprecise.
- Capability flags for anything beyond `supportsSql` (e.g. `supportsIndexes`, `supportsForeignKeys`,
  `supportsSchemas`). No UI code branches on those today - add a flag only when a real conditional
  needs one, per this repo's Simplicity First rule, not speculatively.
- Changing MongoDB's actual behavior in any way - this is a pure refactor of _how_ the UI decides
  what to show, not a change to _what_ it shows.

## Acceptance criteria

- `GET /api/overview` includes `capabilities: { supportsSql: boolean }` for all 4 engines, matching
  each engine's real SQL support (`true` for Postgres/MySQL/SQLite, `false` for MongoDB).
- `apps/web` contains no remaining `engine === "mongodb"` (or any other engine-name) string
  comparison used to decide UI behavior - `grep -rn '"mongodb"' apps/web/src` returns nothing outside
  comments/doc links.
- Connected to Postgres/MySQL/SQLite: the SQL Editor tab is enabled and the Files tab's "Run in
  editor" button appears for `.sql` files, exactly as today.
- Connected to MongoDB: the SQL Editor tab is disabled with the same tooltip copy as today, and the
  Files tab's "Run in editor" button does not appear - behavior is bit-for-bit unchanged, only the
  mechanism (`capabilities.supportsSql` instead of an engine-name check) is different.
