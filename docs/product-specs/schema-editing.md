# Product Contract: Schema Editing

Plan 0006's Phase D turns Qyre from a database an editor can only put _rows_ into (Phase B) into
one that can change _structure_ - create/rename/drop tables and collections, add/rename/drop/alter
columns, and manage indexes - gated by the same two-tier capability model
(`docs/product-specs/permissions-and-capabilities.md`) and never available to a `--read-only`
session regardless of grants (F096).

This spec is a data-contract and decision spec only, like F090 and F098 before it. It fixes the DDL
adapter namespace every engine's adapter implements (F110-F112), the per-engine DDL matrix
(including SQLite's constrained `ALTER TABLE` and the rebuild pattern it falls back to), the
kind-gating rules DDL operates under, the column type catalog the table designer offers, typed
confirmation for destructive DDL, and the API shapes - so those slices build against one settled
contract instead of re-deciding it piecemeal. It does not implement any of them.

## One-sentence promise

A user with real schema-change grants can create, rename, and drop tables/collections, add/rename/
drop/alter columns, and manage indexes through the same typed, validated, audited path regardless
of engine, with every destructive operation requiring the user to type the target's name before it
runs - and a user without those grants never sees an affordance that would just fail anyway.

## Scope and kind-gating

### Behavior

- DDL applies only to `kind === "table"` (SQL engines) or `kind === "collection"` (MongoDB) - F124.
  A view or materialized view is never a DDL target through this surface: dropping/altering a view
  changes its defining query, not a structure this spec's operations model, and materialized-view
  refresh is a distinct concern this plan doesn't cover. This mirrors `row-editing.md`'s identical
  `kind`-gating rule for row mutation exactly - the same field, the same rule, applied to a
  different action.
- Session-level gating uses the two `ConnectionCapabilities` flags F090 already reserved for this:
  `supportsDdl` gates table/column lifecycle operations, `supportsIndexManagement` gates index
  create/drop. Both are independent of `supportsRowMutations` (Phase B) - a role can have row-write
  grants without schema-change grants, or vice versa (an admin-owned schema a row-writer role can't
  alter). No new per-table permission field is added: unlike row-level `select`/`insert`/`update`/
  `delete`, which genuinely vary per table under Postgres RLS/column grants, DDL privilege in every
  engine here is granted at the schema/database level (Postgres `CREATE`/`ALTER` on a schema, MySQL
  `ALTER`/`CREATE`/`DROP` on a database, MongoDB `dbAdmin`-family roles) - there is no per-table DDL
  grant to introspect, so `TablePermissions` stays exactly as `row-editing.md` left it.
- Creating a **new** table/collection is scoped to an existing schema/database - this spec does not
  cover creating a new schema/database itself (that is Phase E's `F115`, "database/schema
  lifecycle").

### Out of scope (for now)

- View/materialized-view DDL (`CREATE VIEW`, `REFRESH MATERIALIZED VIEW`). Revisit only with real
  demand; today those `kind`s stay read-only end to end, matching `row-editing.md`.
- Schema/database creation, rename, or drop - F115.
- Per-table DDL permission introspection finer than the session-level `supportsDdl`/
  `supportsIndexManagement` flags - see above; revisit only if a real engine surfaces genuinely
  per-table DDL grants Qyre should model.

## DDL adapter namespace

### Behavior

- `DatabaseAdapter` gains a second optional namespace alongside `mutations?` (exec plan decision 3):
  `ddl?: SchemaDdlApi`. Absent means the engine has no DDL mechanism Qyre models at all (none do
  today); present-but-grants-insufficient is a normal per-call rejection surfaced as a friendly-
  mapped database error (F120), not a missing namespace. Every member is itself independently
  optional, exactly like `RowMutationApi` - F110 lands table lifecycle, F111 lands column ops, F112
  lands index ops, each across all four engines, without forcing an all-or-nothing implementation.

  ```ts
  export interface SchemaDdlApi {
    // --- Table/collection lifecycle (F110) ---
    createTable?(schema: string, table: string, columns: ColumnDefinition[]): Promise<void>;
    renameTable?(schema: string, table: string, newName: string): Promise<void>;
    /** Deletes every row but keeps the table/collection itself. Postgres/MySQL: native `TRUNCATE`.
     * SQLite: `DELETE FROM` + `VACUUM` is NOT run automatically (a full-database operation, out of
     * scope for a single-table action) - just the delete, matching TRUNCATE's own row-removal
     * effect without SQLite's lack of a real TRUNCATE statement. MongoDB: `deleteMany({})`. */
    truncateTable?(schema: string, table: string): Promise<void>;
    dropTable?(schema: string, table: string): Promise<void>;

    // --- Column operations (F111, SQL engines only - absent on MongoDB, see below) ---
    addColumn?(schema: string, table: string, column: ColumnDefinition): Promise<void>;
    renameColumn?(schema: string, table: string, column: string, newName: string): Promise<void>;
    /** `changes` covers only what's actually changing - type, nullable, default - so an adapter
     * that can express a partial ALTER (Postgres/MySQL) doesn't have to reconstruct the column's
     * full definition, and SQLite's rebuild path (see the per-engine matrix) knows exactly what
     * changed without diffing itself. */
    alterColumn?(
      schema: string,
      table: string,
      column: string,
      changes: Partial<Pick<ColumnDefinition, "dataType" | "nullable" | "default">>
    ): Promise<void>;
    dropColumn?(schema: string, table: string, column: string): Promise<void>;

    // --- Index operations (F112) ---
    createIndex?(schema: string, table: string, definition: IndexDefinition): Promise<void>;
    dropIndex?(schema: string, table: string, indexName: string): Promise<void>;
  }

  /** A column to create, or a new column's full definition - deliberately the same shape
   * `ColumnMetadata` already reports for reads, minus the fields only introspection can produce
   * (`isForeignKey`/`references` - foreign key authoring is out of scope, see below). */
  export interface ColumnDefinition {
    readonly name: string;
    /** One entry from that engine's type catalog - see "Column type catalog" below. Never a raw,
     * unvalidated string the browser made up. */
    readonly dataType: string;
    readonly nullable: boolean;
    /** A literal default value, or `null` for "no default" - never a raw SQL expression string
     * (e.g. `now()`); expression defaults are out of scope, see below. */
    readonly default: string | number | boolean | null;
  }

  /** An index to create. MongoDB expresses `unique` the same way SQL engines do; a MongoDB
   * `IndexDefinition.columns` entry is a top-level or dotted field path, not a SQL column name, but
   * the shape is otherwise identical - deliberately one type, not an engine-specific pair, since
   * every engine here already returns index metadata in this same shape (`IndexMetadata`,
   * `packages/core`) for reads. */
  export interface IndexDefinition {
    readonly name: string;
    readonly columns: string[];
    readonly unique: boolean;
  }
  ```

- Every `SchemaDdlApi` method is parameterized/identifier-quoted internally by the adapter - the
  same "browser never builds SQL" principle F072/`row-editing.md` already establish for reads and
  row writes extends unchanged to structure changes. `schema`/`table`/`column`/index names are
  validated against the connected database's real, freshly-introspected identifiers before an
  adapter method is ever invoked (an unrecognized target is rejected `400`, same treatment an
  unrecognized `sortColumn` already gets) - **except** the handful of genuinely new names an
  operation itself introduces (`createTable`'s `table`, `renameTable`'s `newName`, `addColumn`'s
  `column.name`, `renameColumn`'s `newName`, `createIndex`'s `name`), which are validated instead
  against a conservative identifier pattern (matches the "safe unquoted identifier" shape most
  engines accept without requiring the user to already know their target engine's quoting rules)
  and always passed through the adapter's own identifier-quoting path before reaching the
  database - never string-interpolated.
- **MongoDB's column operations are `undefined`, by design, not an oversight.** MongoDB is
  schemaless - there is no `ALTER COLLECTION` concept, and a "column" only exists as a matter of
  aggregate observation across a collection's documents (F094's field-sampling introspection). The
  server routes for `addColumn`/`renameColumn`/`alterColumn`/`dropColumn` (see "API shapes" below)
  respond `400` for MongoDB with a message explaining collections don't have a fixed structure to
  alter, same treatment `runQuery`'s absence on MongoDB and `commitBatch`'s absence get in
  `sql-editor.md`/`row-editing.md`. `createTable`/`renameTable`/`truncateTable`/`dropTable` map onto
  `createCollection`/`renameCollection`/`deleteMany({})`/`dropCollection` respectively.
  `createIndex`/`dropIndex` map onto MongoDB's own index API.

### Out of scope (for now)

- Foreign key authoring (add/drop a `REFERENCES` constraint). `ColumnDefinition` deliberately omits
  it - reads already resolve/display foreign keys (F061/F068), but _creating_ one interacts with
  referential-integrity ordering (which table exists first) and cascade-behavior choices this spec
  doesn't want to under-specify. Revisit as its own follow-up once basic column/table DDL has real
  usage.
- Expression/function defaults (`DEFAULT now()`, `DEFAULT gen_random_uuid()`). `ColumnDefinition.
default` is a literal value only; an expression default is a distinct, higher-risk feature
  (arbitrary-SQL-in-a-default surface) better scoped separately if real demand appears.
- `CHECK`/`UNIQUE`/other table-level constraints beyond what `IndexDefinition.unique` already
  covers, and multi-column primary key authoring beyond what `createTable`'s column list can express
  (an engine may still require its own primary-key declaration mechanism the adapter handles
  internally - this spec doesn't add a first-class API for it beyond "the columns you pass are
  enough to define the table").
- Bulk/scripted schema migrations (running a `.sql` migration file). The Files tab already lets a
  developer run arbitrary read-only/write-capable SQL through the SQL Editor (F107) for that; this
  spec's structured API is for the guided table-designer UI (F113), not a migration runner.

## Per-engine DDL matrix

### Behavior

| Operation                          | Postgres                                                                                              | MySQL                                                          | SQLite                                                                                   | MongoDB            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------ |
| Create table/collection            | `CREATE TABLE`                                                                                        | `CREATE TABLE`                                                 | `CREATE TABLE`                                                                           | `createCollection` |
| Rename table/collection            | `ALTER TABLE ... RENAME TO`                                                                           | `RENAME TABLE`                                                 | `ALTER TABLE ... RENAME TO` (3.25+)                                                      | `renameCollection` |
| Truncate                           | `TRUNCATE`                                                                                            | `TRUNCATE`                                                     | `DELETE FROM` (no native TRUNCATE)                                                       | `deleteMany({})`   |
| Drop table/collection              | `DROP TABLE`                                                                                          | `DROP TABLE`                                                   | `DROP TABLE`                                                                             | `dropCollection`   |
| Add column                         | `ALTER TABLE ... ADD COLUMN`                                                                          | `ALTER TABLE ... ADD COLUMN`                                   | `ALTER TABLE ... ADD COLUMN` (native, no constraint-bearing default that isn't constant) | not applicable     |
| Rename column                      | `ALTER TABLE ... RENAME COLUMN`                                                                       | `ALTER TABLE ... RENAME COLUMN` (8.0+) / `CHANGE COLUMN` (5.7) | `ALTER TABLE ... RENAME COLUMN` (3.25+)                                                  | not applicable     |
| Alter column type/nullable/default | `ALTER TABLE ... ALTER COLUMN` (separate clauses for type/`SET`/`DROP NOT NULL`/`SET`/`DROP DEFAULT`) | `MODIFY COLUMN` (full redefinition in one statement)           | **rebuild only** - see below                                                             | not applicable     |
| Drop column                        | `ALTER TABLE ... DROP COLUMN`                                                                         | `ALTER TABLE ... DROP COLUMN`                                  | `ALTER TABLE ... DROP COLUMN` (3.35+, no FK-referenced/PK/generated/indexed column)      | not applicable     |
| Create/drop index                  | `CREATE`/`DROP INDEX`                                                                                 | `CREATE`/`DROP INDEX` (via `ALTER TABLE` for `DROP`)           | `CREATE`/`DROP INDEX`                                                                    | native index API   |

- **SQLite's `ALTER TABLE` is intentionally constrained by the engine itself**, not by this spec:
  it can `ADD COLUMN` (with real limits - no non-constant default, no `PRIMARY KEY`/`UNIQUE`,
  no `NOT NULL` unless a default is given), `RENAME COLUMN`/`RENAME TO` (3.25+), and `DROP COLUMN`
  (3.35+, refusing a column that's part of a primary key, a foreign key, an index, or a generated
  column). `alterColumn` (type change, or a nullable/default change SQLite's own `ADD COLUMN`
  limits can't express) has **no native single-statement equivalent** - SQLite's own documented
  workaround, and what `alterColumn` implements when the direct path isn't available, is the
  **12-step rebuild pattern** SQLite's own documentation prescribes: `PRAGMA foreign_keys=OFF`,
  begin a transaction, create a new table with the desired final schema, copy every row across,
  drop the old table, rename the new one into its place, recreate every index/trigger/view that
  referenced the old table, `PRAGMA foreign_key_check`, commit, `PRAGMA foreign_keys=ON`. This is
  the only `SchemaDdlApi` operation whose SQLite implementation is a multi-statement transaction
  rather than one native DDL statement - callers see the same `Promise<void>` either way; the
  rebuild is an implementation detail SQLite's adapter owns, not a different API shape.
- **A destructive/data-affecting SQLite `alterColumn` always goes through the rebuild path**, even
  for a change SQLite's `ADD COLUMN`-family limits could theoretically approximate, so every
  `alterColumn` call has one consistent, fully-tested code path per engine rather than two
  (a fast path for "safe" changes and a rebuild path for others) that could silently diverge.
- **MySQL's `MODIFY COLUMN` requires the caller to supply the column's full resulting definition**,
  not just the changed field - MySQL has no separate "just change the type" / "just change
  nullability" clause the way Postgres does. The adapter reads the column's current
  `ColumnMetadata` first and merges `changes` onto it before issuing one `MODIFY COLUMN` statement,
  so the caller-facing contract (`changes` only covers what's different) stays identical across
  engines even though MySQL's own SQL doesn't work that way under the hood.
- Every operation above runs against the connected engine's real `statement_timeout`/equivalent
  where one is configured (matching every other adapter call in this codebase); DDL is not exempted
  from that bound.

### Out of scope (for now)

- Zero-downtime/online-schema-change tooling (`pt-online-schema-change`, `gh-ost`, Postgres's own
  `CREATE INDEX CONCURRENTLY` as a first-class distinct mode). Every operation here runs as a plain
  blocking DDL statement (or, for `CREATE INDEX`, whatever the adapter's default `createIndex`
  issues) - acceptable for Qyre's target use (a developer's own database, not a zero-downtime
  production migration tool). Revisit only if that positioning changes.
- SQLite's `PRAGMA foreign_key_check` failure recovery beyond "the rebuild transaction rolls back
  and the operation reports a real error" - there is no partial-rebuild retry/repair flow.

## Column type catalog

### Behavior

**Resolves exec plan open decision 6**: the table designer's type dropdown (F113) offers a **static,
curated, per-engine list**, not one introspected from the engine's own type catalog
(Postgres `pg_type`, MySQL/SQLite's information_schema-adjacent sources). Reasoning:

- Postgres's real `pg_type` alone lists hundreds of rows - the vast majority internal, extension-
  provided (PostGIS, `pgcrypto`), array/range/composite variants, or otherwise not something a
  developer picking a column type for a new table is choosing between. Introspecting it wholesale
  and showing it raw would overwhelm the exact UI (a guided table designer) this decision is meant
  to keep approachable; a hand-curated list of the common, broadly-useful types is what every
  comparable tool (TablePlus, DataGrip, DBeaver's "common types" mode) actually does.
- SQLite has no real type catalog to introspect at all - it accepts (almost) any declared type
  string, mapped internally to one of five storage classes/type affinities by name-matching rules.
  A curated list mapping directly to those five affinities (`INTEGER`, `TEXT`, `REAL`, `BLOB`,
  `NUMERIC`) is the only choice that's both meaningful and consistent with how SQLite actually
  stores the value, and is not something "introspection" could produce differently anyway.
- Each curated list is a plain, static array baked into the relevant package (`@qyre/core` or each
  driver package, whichever proves the more natural home once F113 implements the picker) - not
  fetched from the server per connection, since the list is a property of the _engine_, not the
  specific database. A future engine-specific extension-provided type is simply not offered by the
  picker; `alterColumn`/`createTable`'s server-side validation (see "DDL adapter namespace" above)
  still only ever accepts one of the catalog's entries, so this is a UI-affordance limitation, not
  a security boundary.
- Starting catalogs (exact membership refined during F113's implementation, not frozen here):
  Postgres - `text`, `varchar`, `integer`, `bigint`, `numeric`, `boolean`, `date`, `timestamp`,
  `timestamptz`, `uuid`, `jsonb`. MySQL - `VARCHAR(255)`, `TEXT`, `INT`, `BIGINT`, `DECIMAL`, `BOOLEAN`
  (`TINYINT(1)`), `DATE`, `DATETIME`, `TIMESTAMP`, `JSON`. SQLite - `TEXT`, `INTEGER`, `REAL`,
  `BLOB`, `NUMERIC`.

### Out of scope (for now)

- A "custom type" free-text escape hatch in the picker. Revisit only with real demand; today an
  unlisted type is reachable only through the SQL Editor's arbitrary DDL execution (F107), not the
  guided designer.
- Engine-specific extension type support (PostGIS geometry columns, Postgres arrays/ranges/
  composites, MySQL `ENUM`/`SET`). Same reasoning as above.

## Typed-confirmation for destructive DDL

### Behavior

Restates and applies `docs/SECURITY.md`'s "destructive actions... require explicit, unambiguous
user confirmation and must never be the default path" rule concretely for schema-destructive
operations, going one step beyond `row-editing.md`'s buffer-preview-as-confirmation model because a
dropped/truncated table (unlike a staged row edit sitting in a reviewable, cancelable buffer) is
immediate and irreversible the instant it's confirmed:

- **`dropTable`, `truncateTable`, and `dropColumn`** require the user to type the exact target name
  (the table name for `dropTable`/`truncateTable`, the column name for `dropColumn`) into a
  confirmation field before the action is enabled - the same "type to confirm" pattern common to
  destructive actions across professional tools (GitHub's repo-deletion flow, TablePlus's own
  drop-table confirmation), not a plain Yes/No dialog a habituated user could reflexively click
  through.
- **`dropIndex`** uses a plain explicit confirming click (not typed confirmation) - an index carries
  no user data of its own; dropping one is recoverable by recreating it (aside from the cost of
  rebuilding it), a materially lower-risk action than losing table structure or row data.
- **`renameTable`/`renameColumn`/`alterColumn`/`addColumn`/`createIndex`/`createTable`** are
  non-destructive (nothing is deleted) and use a plain review-before-submit step (the designer UI,
  F113, shows the generated DDL statement(s) before running them, mirroring `row-editing.md`'s
  buffer-preview precedent) - no typed confirmation.
- The server independently re-validates that a destructive request's `confirmedName` (see "API
  shapes" below) exactly matches the real target before executing - the client-side typed-
  confirmation gate is UX, not the enforcement boundary; a request missing or mismatching
  `confirmedName` is rejected `400` server-side regardless of what the UI already gated, the same
  "server-enforced round-trip, never client-only" principle `sql-editor.md`'s destructive-statement
  confirmation already established for F107.

### Out of scope (for now)

- Configurable confirmation thresholds (e.g. "always require typed confirmation", "skip it for
  empty tables"). One fixed policy for now, matching `row-editing.md`'s identical exclusion.
- A "type DELETE to confirm" generic phrase instead of the target's own name. Naming the actual
  target is more specific (and more effective at forcing the user to actually read what they're
  about to destroy) than a fixed phrase every confirmation would share.

## API shapes

### Behavior

- Routes live under `/api/tables/:schema/:table/ddl` for table/column/index operations scoped to
  one existing table, and `/api/schemas/:schema/tables` for creating a new table (there is no
  existing `:table` to scope the URL to yet):
  - `POST /api/schemas/:schema/tables` - body `{ table: string; columns: ColumnDefinition[] }` -
    **create table/collection**.
  - `POST /api/tables/:schema/:table/ddl/rename` - body `{ newName: string }` - **rename**.
  - `POST /api/tables/:schema/:table/ddl/truncate` - body `{ confirmedName: string }` - **truncate**.
  - `DELETE /api/tables/:schema/:table` - body `{ confirmedName: string }` - **drop table**. (A
    request body on `DELETE` is valid HTTP, matching `row-editing.md`'s identical precedent for its
    own `DELETE` route.)
  - `POST /api/tables/:schema/:table/ddl/columns` - body `ColumnDefinition` - **add column**.
  - `PATCH /api/tables/:schema/:table/ddl/columns/:column` - body
    `{ newName?: string; changes?: Partial<Pick<ColumnDefinition, "dataType" | "nullable" |
"default">> }`, at least one of `newName`/`changes` required - **rename and/or alter column** in
    one request (the UI may offer them as separate actions; the API allows either or both together
    so a single designer-form submission doesn't need two round trips when a developer both renames
    and retypes a column at once).
  - `DELETE /api/tables/:schema/:table/ddl/columns/:column` - body `{ confirmedName: string }` -
    **drop column**.
  - `POST /api/tables/:schema/:table/ddl/indexes` - body `IndexDefinition` - **create index**.
  - `DELETE /api/tables/:schema/:table/ddl/indexes/:indexName` - **drop index** (plain confirming
    click per "Typed-confirmation" above - no `confirmedName` body needed).
  - Every route is gated by **both** the F096 central read-only guard (`config: { mutating: true }`)
    and the relevant session capability (`supportsDdl` for table/column routes,
    `supportsIndexManagement` for index routes) - the same two-tier gate every mutating route in
    this plan already applies, just checking the DDL-specific capability flags instead of
    `supportsRowMutations`.
  - A destructive route (`truncate`, `DELETE` table, `DELETE` column) whose body's `confirmedName`
    doesn't match the real target responds `400` before touching the database, per "Typed-
    confirmation" above.
  - Column/index routes validate `:column`/`:indexName`/body identifiers against the table's real,
    freshly-introspected structure the same way row-mutation routes already validate column names
    (F099-F101) - an unrecognized target is `400`, not a database-level error.
  - A column route called against a MongoDB target responds `400` with a message explaining
    collections don't have columns to alter (see "MongoDB's column operations" above) - registered
    for every engine (never a bare `404`) but engine-conditionally rejected, the same pattern
    `POST /api/mutations/commit` already uses for MongoDB (`row-editing.md`).

### Out of scope (for now)

- A single combined "apply this whole set of DDL changes transactionally" endpoint analogous to
  `POST /api/mutations/commit`. Each DDL operation here is typically a standalone action the
  designer UI (F113) runs and immediately reflects (create this one column, drop that one index),
  not a batch of changes staged together the way row edits are - revisit only if F113's real UX
  needs multi-op batching.

## Database and schema lifecycle (F115)

### Behavior

- Adapters gain the `admin` namespace (`DatabaseAdminApi`), mirroring `mutations`/`ddl`'s
  optional-namespace pattern, with `listDatabases`/`createDatabase`/`dropDatabase` and - Postgres
  only - `createSchema`/`dropSchema`. Per-engine membership follows what each engine genuinely has:
  - **Postgres**: all five. `listDatabases` reads `pg_database` (non-template databases);
    `dropSchema` never adds `CASCADE` - dropping a non-empty schema surfaces Postgres's own
    dependency error rather than silently taking every contained table with it.
  - **MySQL**: `listDatabases`/`createDatabase`/`dropDatabase` only - a MySQL "schema" IS its
    database (`CREATE SCHEMA` is a literal synonym), so modeling the schema pair would offer the
    same operation twice.
  - **MongoDB**: `listDatabases`/`dropDatabase` only - databases come into existence implicitly on
    the first write into them, so there is no create operation to model; the create route responds
    `400` explaining that. System databases (`admin`/`local`/`config`) are filtered from the list.
  - **SQLite**: no `admin` namespace at all - one file is one database; the routes respond `400`
    with a clean "one database per connection" message, never a bare `404`.
- `supportsDatabaseManagement` comes from the real F092-F095 permission introspection: Postgres
  (superuser or `CREATEDB`/database `CREATE` privilege) and MySQL (SUPER or global `CREATE`)
  already computed it; MongoDB now derives it from the `dropDatabase` privilege action (the only
  database-management action its privilege model has); SQLite stays engine-level false.
- Routes: `GET /api/databases` (a read - no mutating gate or capability check; the underlying
  catalogs are readable regardless of write grants), `POST /api/databases` - body
  `{ database: string }`, `DELETE /api/databases/:database` - body `{ confirmedName: string }`,
  `POST /api/schemas` - body `{ schema: string }`, `DELETE /api/schemas/:schema` - body
  `{ confirmedName: string }`. Mutating routes carry the same two-tier gate as every DDL route
  (F096 central guard + `supportsDatabaseManagement`); both drops require the typed-confirmation
  token re-validated server-side. `DELETE .../databases/:database` validates the target exists via
  `listDatabases` first (`404` otherwise); `DELETE .../schemas/:schema` deliberately does not -
  `getOverview()` derives schemas from tables, so a legitimately empty schema (the most common drop
  target) never appears in it; a nonexistent schema surfaces Postgres's own error instead.
- Audit events follow the "Audit-event contract" below with
  `operation: "createDatabase" | "dropDatabase" | "createSchema" | "dropSchema"` and a `target`
  field (a database/schema name - there is no `schema.table` pair at this level). `listDatabases`
  is a read, never audited.
- No guard against dropping the currently connected database beyond what the engine itself
  enforces - Postgres rejects it natively ("cannot drop the currently open database");
  MySQL/MongoDB allow it. The typed confirmation is the deliberate-action gate.

### Out of scope (for now)

- A database/schema-management UI - this slice is the adapter/route surface only, matching
  F110-F112's backend-first split; the UI slice decides its own affordances later.
- Cross-database introspection or switching the connected database server-side -
  `POST /api/connect` (F064) already covers moving the whole session to another database.
- MongoDB database creation via an implicit first write (e.g. auto-creating a collection) - a
  create that works by side effect would surprise more than it helps; Compass's own "create
  database" requires naming an initial collection, which is F113's create-collection flow, not a
  database operation.

## Audit-event contract

### Behavior

Identical shape to `row-editing.md`'s existing contract, applied to DDL operations instead of row
mutations - reused, not reinvented:

- Every DDL call produces one `EventLog.log(level, message)` record (Console tab) - a human-readable
  line naming the operation, the target (`schema.table`/`schema.table.column`/`schema.table
(index)`), and outcome. Example: `Dropped table public.old_customers.` /
  `Rename rejected: confirmedName did not match.`
- Every DDL call also produces one structured `request.log.info/.warn/.error(...)` record with
  fields `{ operation: "createTable" | "renameTable" | "truncateTable" | "dropTable" |
"addColumn" | "renameColumn" | "alterColumn" | "dropColumn" | "createIndex" | "dropIndex", schema,
table, column?, indexName?, durationMs, outcome: "success" | "rejected" | "error" }`.
- `level`/`outcome` is `"info"`/`"success"` on success, `"warn"`/`"rejected"` on a confirmed-name
  mismatch or capability rejection, `"error"` on an unexpected failure (a real database error).

### Out of scope (for now)

- Everything `row-editing.md`'s own audit-event "Out of scope" already excludes (persisted history
  beyond the EventLog cap, per-user attribution) - identical reasoning, not restated.

## Acceptance criteria

This is a spec-only slice (`verification: pnpm check:state`) - no adapter, route, or type
implementation lands with F109 itself, matching F090's and F098's precedent exactly.

- `docs/product-specs/index.md` lists this spec, and `pnpm check:state` passes with no other files
  changed.
- `SchemaDdlApi`'s exact shape (table/column/index lifecycle methods, `ColumnDefinition`/
  `IndexDefinition`), and MongoDB's column-operations exclusion, is fixed precisely enough that
  F110/F111/F112 can implement it per engine without a design decision left open.
- The per-engine DDL matrix - including SQLite's constrained native `ALTER TABLE` surface and the
  12-step rebuild pattern `alterColumn` falls back to - is fixed precisely enough that F110/F111 can
  implement each engine's adapter without re-deriving SQLite's own documented limitations from
  scratch.
- Exec plan open decision 6 (type catalog: static vs. introspected) is resolved with a reasoned
  answer (static, curated, per-engine) precise enough that F113 can build the designer's type
  picker against it without re-deciding the question, with starting catalogs named (exact
  membership left to F113's own judgment).
- Kind-gating and session-capability gating (`supportsDdl`/`supportsIndexManagement`, no new
  per-table DDL permission field) are fixed precisely enough that F110-F114 can gate their own
  affordances without re-deriving the rule from `row-editing.md`'s precedent.
- Typed-confirmation rules (which operations require typing the target's name vs. a plain confirm
  click, and that the server independently re-validates it) are fixed precisely enough that F113's
  UI and F110-F112's routes implement one consistent policy instead of each re-deciding it.
- Every route's exact path/method/body shape is fixed, so F110-F112 don't re-decide them.
- The audit-event contract is fixed by reference to `row-editing.md`'s existing shape, applied to
  DDL's own operation/outcome vocabulary, precisely enough that F110-F112 implement logging
  identically instead of each inventing its own shape.

Once F110-F114 land, this section should also be checked against their real implementation and
updated (or a follow-up spec added) if anything ended up diverging - per `docs/product-specs/
index.md`'s own "if implementation diverges from a spec, update one of them in the same session"
rule.
