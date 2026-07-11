# Product Contract: Row Editing

Qyre is strictly read-only today (`docs/SECURITY.md`) - no adapter exposes a write path, and every
route only ever reads. Plan 0006's Phase B turns a session with real database write grants
(`ConnectionCapabilities.supportsRowMutations`, `docs/product-specs/permissions-and-capabilities.md`)
into one that can insert, edit, and delete rows, gated by both session- and table-level permissions
and never available to a `--read-only` session regardless of grants (F096).

This spec is a data-contract and decision spec only, like F090 before it. It fixes the mutation API
shape every engine's adapter implements (F099-F101), the SQL pending-changes-buffer and batch-commit
model (F102-F105), MongoDB's document-editing model (F125), value validation/coercion, the
audit-event contract, and confirmation thresholds - so those slices build against one settled
contract instead of re-deciding it piecemeal. It does not implement any of them.

## One-sentence promise

A user with real write grants can insert, edit, and delete rows through the same typed, validated,
audited path regardless of engine - SQL engines through a reviewable pending-changes buffer with a
generated-statement preview and one transactional commit, MongoDB through a whole-document Extended
JSON editor - and a user without those grants never sees an affordance that would just fail anyway.

## Row identity and editability

### Behavior

- A table/collection is eligible for row mutation only when **all** of the following hold; each is
  already fully derivable from existing `TableMetadata`/`ConnectionCapabilities` fields, so **no new
  "why can't I edit this" field is added** - the UI computes the reason from what's already there:
  1. `kind === "table"` (SQL engines) or `kind === "collection"` (MongoDB) - F124. A view or
     materialized view is never editable: a view has no rows of its own to update, and a
     materialized view is refreshed, not edited row-by-row.
  2. At least one column has `isPrimaryKey: true`. A table with no primary key stays read-only in
     the grid - there is no reliable way to target one specific row for `UPDATE`/`DELETE` without
     one, and guessing from "all columns" risks matching the wrong row silently.
  3. Session capabilities allow it (`supportsRowMutations`, `docs/product-specs/permissions-and-
capabilities.md`) **and** the table's own `TablePermissions.insert`/`update`/`delete` allow the
     specific action - the two tiers narrow independently, exactly as that spec already states.
- **Row identity is the full primary key**, not just the first PK column. A composite key (multiple
  columns with `isPrimaryKey: true`) is matched as a set - every PK column's current value must be
  supplied and must match for an update/delete to apply. MongoDB's single-field `_id` (already
  marked `isPrimaryKey: true` per F068) is handled by the exact same general logic, not a special
  case.
- Non-editable **columns** within an otherwise-editable table: a `structured` or `binary`
  `FilterColumnKind` (`packages/core/src/filter-capabilities.ts`, F082/F089) is not editable through
  the flat cell/insert editors this spec covers - the same reasoning that spec already gives for
  excluding them from scalar filtering (a JSON/array or binary value needs a dedicated editor
  surface, not a text box) applies identically to editing. `unknown`-kind columns are also excluded
  - Qyre never guesses a coercion it isn't confident about. A primary-key column is always editable
    when inserting a new row (it must be supplied, unless the engine auto-generates it - see below) but
    is **never** editable when updating an existing row - changing a row's identity mid-edit is
    indistinguishable from "insert a new row and delete the old one" and this spec doesn't support that
    as a single operation.
- Auto-generated primary keys (Postgres `serial`/`identity`, MySQL `AUTO_INCREMENT`, SQLite
  `INTEGER PRIMARY KEY` rowid alias) may be omitted on insert; the engine assigns the value and it is
  reported back in the result (see "Mutation API shape" below) rather than guessed client-side.
  MongoDB's `_id` is always engine-generated when omitted (the driver's own `ObjectId` default).

### Out of scope (for now)

- Column-level edit permissions finer than what `TablePermissions` already expresses - same
  exclusion `permissions-and-capabilities.md` already states for column-level grants generally; a
  column-level rejection surfaces as a real database error, friendly-mapped (F120).
- A dedicated structured (JSON/array) or binary value editor. Revisit only with real demand; today
  those columns simply aren't editable, same treatment as filtering.
- Changing a row's primary key value via update (see above) - delete-and-reinsert is the only path,
  and this spec doesn't wire a combined "rekey" operation for it.

## Mutation API shape

### Behavior

- `DatabaseAdapter` (`packages/drivers/contract`) gains an optional namespace, per exec plan
  decision 3 (`mutations?: RowMutationApi`) - absent means the engine has no write mechanism at all
  (none do today; every engine implements it once its own F099-F101 slice lands), present-but-grants-
  insufficient is a normal per-call rejection, not a missing namespace.
  ```ts
  export interface RowMutationApi {
    insertRow(
      schema: string,
      table: string,
      values: Record<string, unknown>
    ): Promise<InsertRowResult>;
    updateRowByKey(
      schema: string,
      table: string,
      key: Record<string, unknown>,
      changes: Record<string, unknown>
    ): Promise<UpdateRowResult>;
    deleteRowsByKey(
      schema: string,
      table: string,
      keys: Array<Record<string, unknown>>
    ): Promise<DeleteRowsResult>;
  }

  export interface InsertRowResult {
    /** The inserted row, when the engine can report it (Postgres `RETURNING *`, MySQL re-fetched by
     * `insertId`, MongoDB the inserted document). Absent only if the engine truly cannot - never
     * guessed or partially reconstructed client-side. */
    readonly row?: Record<string, unknown>;
  }
  export interface UpdateRowResult {
    /** 0 or 1 for a single-key match; a composite key still identifies at most one row. 0 is a
     * distinct outcome ("stale row" - see below), never treated as trivially-successful no-op. */
    readonly matched: number;
  }
  export interface DeleteRowsResult {
    /** May be less than `keys.length` if some keys no longer match (stale) - the caller reports
     * exactly how many of the requested keys actually deleted something. */
    readonly deleted: number;
  }
  ```
- `key`/each entry of `keys` is a column -> value map covering **every** `isPrimaryKey` column (the
  server validates this before calling the adapter - see "Value validation and coercion"). MongoDB's
  key map always has exactly one entry, `_id`.
- All three methods are parameterized/bound the same way every existing read path already is (F072's
  "browser never builds SQL" principle extends unchanged to writes) - `values`/`changes` become a
  parameterized `INSERT`/`UPDATE ... SET` on SQL engines, or a native driver document/update-document
  on MongoDB; never string-interpolated.
- Server routes (F099-F101), all under `/api/tables/:schema/:table/rows` since a row's identity
  (composite keys, MongoDB `_id`) doesn't cleanly fit in URL path segments:
  - `POST /api/tables/:schema/:table/rows` - body is the flat `values` map (SQL) or an Extended JSON
    document (MongoDB, see below) - **insert**.
  - `PATCH /api/tables/:schema/:table/rows` - body `{ key: Record<string, unknown>; changes:
Record<string, unknown> }` (SQL) or `{ key: { _id: string }; document: <EJSON> }` (MongoDB,
    changed-fields vs. replace decided below) - **update**.
  - `DELETE /api/tables/:schema/:table/rows` - body `{ keys: Array<Record<string, unknown>> }` - a
    request body on `DELETE` is valid HTTP and Fastify supports it natively; this is an internal
    `fetch()` call from the SPA, not a form submission, so the historical browser/proxy caveats about
    `DELETE` bodies don't apply.
  - Every route is gated by **both** the F096 central read-only guard (`config: { mutating: true }`)
    and the table's specific `TablePermissions` action, validates the target's `kind`/columns the
    same way `resolveRowSort`/filter validation already does (F065/F072's injection-surface
    pattern), and produces the audit event described below.
- These per-op routes are the same primitives F102's batch-commit endpoint calls internally (in a
  loop, inside one transaction) - they are not superseded by it. The V1 UI (F103-F105) drives every
  edit through the batch-commit endpoint exclusively (see below), but the per-op routes remain real,
  independently callable, and independently conformance-tested (F099-F101) - useful for direct/
  scripted use and as the batch endpoint's own implementation, not dead API surface.
- `matched: 0` on update and any `deleted < keys.length` on delete are reported by the route as
  `409 Conflict` (SQL engines) with a message naming the stale row(s) - "this row was already changed
  or removed" - never as a `200` that silently did nothing. This is the one place a mutation route's
  HTTP status is driven by adapter-reported counts rather than success/failure alone.

### Out of scope (for now)

- Filter-based bulk update/delete ("update every row matching X"). `deleteRowsByKey`/
  `updateRowByKey` only ever target an explicit, already-loaded set of primary keys - never a
  server-evaluated `WHERE`. Revisit only with a dedicated, more heavily confirmed bulk-operation
  spec; the risk profile of "guess how many rows a filter matches before running it" is materially
  different from single-row edits.
- Upsert (`INSERT ... ON CONFLICT`). Insert and update stay distinct operations.

## Value validation and coercion

### Behavior

- Every column's edit value is validated against the **same** `FilterColumnKind` classification
  F082/F089 already computes (`classifyFilterColumnKind`, `packages/core/src/filter-capabilities.ts`)
  - reused, not reimplemented, so a column's filterability and editability agree by construction:
  - `text` / `identifier`: JSON string.
  - `numeric`: JSON number - **not** a numeric string. Unlike `RowFilter.value` (always a URL query
    string, F072), insert/update bodies are real JSON, so the client sends a real typed number and
    the server rejects a string here rather than silently coercing one, closing a class of "silently
    stored `'42'` instead of `42`" bugs.
  - `boolean`: JSON boolean.
  - `date` / `time` / `datetime`: JSON string, further validated as a parseable ISO-8601-shaped
    value before it reaches the adapter (reject garbage early, same principle `resolveRowSort`
    already applies to column names). The adapter passes the validated string straight through as a
    bound parameter - the SQL driver itself converts it to the column's native date/timestamp type,
    the same "let the driver own type conversion" precedent `column-type-fidelity.md` (F019)
    established for reads, now applied symmetrically to writes, avoiding a manual JS `Date`
    round-trip and the timezone bugs F019 fixed in the first place.
  - `objectId` (MongoDB only): JSON string, further validated as a syntactically valid 24-hex-char
    ObjectId before the adapter constructs a real `ObjectId` from it.
  - `null`: only accepted when the column is `nullable`; identical to how `RowFilter`'s `isNull`
    already respects nullability.
  - `structured` / `binary` / `unknown`: never accepted - see "Row identity and editability" above.
- This validation happens **before** the adapter is called, using the table's own freshly-
  introspected columns (never a client-supplied schema) - the same trust boundary `resolveRowSort`/
  filter-column validation already enforces.
- A `key`/`changes`/`values` map with an unrecognized column name is rejected `400`, same treatment
  an unrecognized `sortColumn`/filter `column` already gets.

### Out of scope (for now)

- Business-rule validation beyond type/nullability (string length limits, numeric ranges, regex
  patterns, cross-column constraints). The connected database is still the authoritative enforcer
  (`permissions-and-capabilities.md`'s advisory principle, extended to constraints as well as
  grants) - a `CHECK`/`UNIQUE`/`NOT NULL` violation surfaces as a real database error, friendly-
  mapped (F120), not pre-validated client- or server-side.

## SQL engines: pending-changes buffer and batch commit

### Behavior

- Postgres/MySQL/SQLite share one editing model (exec plan decision 5, the "TablePlus model"):
  edits, inserts, and deletes made in the grid (F103-F105) stage into a **client-side pending-
  changes buffer scoped to the currently-selected table** - not a server round trip per keystroke or
  per cell. The buffer lives in `features/table` model state (F103).
  - Scoped per-table, not a cross-table global buffer, matching how TablePlus itself actually works
    (its "unsaved changes" indicator and commit action are per open tab, not a single app-wide
    buffer) - switching tables while a buffer is dirty is out of scope for this spec (see below),
    not silently discarded or silently carried over.
  - The buffer renders a **generated-statement preview**: for each staged op, the exact SQL that
    committing it will run (parameter placeholders shown with their bound values inline for
    readability, not literally interpolated - this is a preview, not the real query text sent to the
    driver). This is what makes the buffer reviewable before commit, not just a diff indicator.
- **Commit is one connection-wide endpoint, not one per table** (resolves exec plan open decision 5):
  `POST /api/mutations/commit`. Body: an ordered array of staged operations, each
  `{ type: "insert" | "update" | "delete"; schema: string; table: string; ...op-specific payload
matching insertRow/updateRowByKey/deleteRowsByKey's own shape }`. A single endpoint (rather than
  submitting each table's buffer to its own `/api/tables/:schema/:table/rows` calls) is what makes
  the batch genuinely transactional and keeps the API open to a future multi-table buffer without a
  redesign, even though the V1 UI only ever sends one table's worth of ops today.
  - The server validates **every** operation - columns, `kind`, session + table permissions - before
    starting the transaction, exactly as each per-op route already does individually. Validation
    failure on any operation aborts the whole commit before any write happens; nothing partially
    validated ever partially runs.
  - Every operation then runs inside **one native transaction** (`BEGIN`/`COMMIT` semantics native
    to each SQL engine - Postgres/MySQL both already have real transaction support; SQLite's
    single-writer model gives the same effective guarantee). All-or-nothing: the first operation
    failure (a constraint violation, a stale `matched: 0`/`deleted < requested`) rolls back
    everything already applied in that commit and reports the failing operation's **index** in the
    submitted array, so the UI can highlight exactly which staged change failed.
  - This endpoint is registered for every engine (never a bare `404`, which could read as a routing
    bug) but responds `400` for MongoDB with a message explaining documents save individually - see
    the MongoDB section below.
- Confirmation: the pending-changes-buffer preview **is** the confirmation surface for ordinary
  inserts/updates/deletes - reviewing the generated statements before clicking Commit satisfies
  `docs/SECURITY.md`'s "explicit, unambiguous user confirmation" for row-level writes. No separate
  per-cell-edit modal. A **delete** additionally requires a distinct, explicit confirming click when
  it's staged (not just at commit time) - matching `docs/SECURITY.md`'s treatment of `DELETE` as
  needing confirmation "and must never be the default path," and because an accidentally-staged
  delete is otherwise indistinguishable from an edit until commit.

### Out of scope (for now)

- Multi-table pending buffers / multiple simultaneous open table tabs. The API (single commit
  endpoint) doesn't block this later, but the UI (F103-F105) and this spec's UX only cover one
  table's buffer at a time.
- Warning or auto-saving a dirty buffer when switching tables/tabs/navigating away. Revisit with
  real usage data; today the buffer is simply per-table state that isn't carried anywhere.
- Undo/redo within the buffer beyond a per-cell "revert" (F103 already covers reverting a single
  staged cell edit before commit).

## MongoDB: whole-document Extended JSON editing

This is exec plan open decision 1, the highest-risk decision in the plan - the wrong choice here
silently corrupts data types on save, not just at the UI layer.

### Behavior

- MongoDB does not use the SQL grid's flat cell/buffer model - flat cell edits cannot express nested
  documents, and the grid's own display values are already lossy-by-design for editing purposes (see
  below). Instead, editing a document opens a **whole-document editor** (the "Compass model": edit
  the full document as text, save the whole thing, one document at a time with its own confirmation
  - no cross-document buffer). This is F125's UI; this spec fixes the wire format and save semantics
    it must use.
- **The editor's text format is real MongoDB Extended JSON, relaxed mode** (`bson`'s
  `EJSON.stringify(doc, { relaxed: true })`/`EJSON.parse(text, { relaxed: true })` - `bson` already
  ships as a transitive dependency of the `mongodb` driver Qyre already uses; F125 adds it as an
  explicit `@qyre/mongodb` dependency) - **not** the same friendly serialization the read-only grid
  already displays (`normalizeBsonValue`/`normalizeDocument`, `packages/drivers/mongodb/src/
bson-values.ts`). This is a deliberate, explicit divergence, decided here rather than left for
  F125 to discover:
  - The existing read-only display format is intentionally ambiguous by design for readability -
    `ObjectId` renders as a bare hex string and `Date` as a bare ISO string (F081), indistinguishable
    from a `string` field that merely looks like one. That ambiguity is fine for _display_, where
    the app already knows each field's real type from `getTable`'s sampled inference and only needs
    to _show_ a value - but it is unsafe for _editing_, where the only source of truth once the user
    starts typing is the text itself. A hand-edited `"2024-01-01"` string is genuinely ambiguous
    between "a Date the user wants to keep as a Date" and "a string field the user wants to change
    to that text" without an unambiguous wrapper.
    Relaxed Extended JSON resolves this while staying close to genuinely readable for the common
    types: `ObjectId` as `{"$oid": "507f1f77bcf86cd799439011"}`, `Date` as `{"$date":
"2024-01-01T00:00:00.000Z"}`, oversized integers as `{"$numberLong": "..."}"`, binary as
    `{"$binary": {"base64": "...", "subType": "00"}}` - genuinely-JSON-native types (plain numbers,
    strings, booleans, arrays, nested objects) stay as plain JSON, unwrapped, which is what "relaxed"
    (as opposed to "canonical", which wraps even a plain number as `{"$numberInt": "42"}`) buys over
    the fully-canonical form: maximum readability without the ambiguity the grid's display format
    has.
  - This intentionally differs from MongoDB Compass's own default editor, which uses a shell-helper
    syntax (`ObjectId("...")`, `ISODate("...")`) that is not valid JSON and needs a bespoke parser.
    `bson`'s `EJSON` is the officially-maintained, already-available library implementation with the
    identical _goal_ (unambiguous typed round-trip) and a real JSON grammar `JSON.parse`-compatible
    tooling (syntax highlighting, formatting) already understands - a deliberately lower-risk choice
    than reimplementing Compass's shell grammar, at the cost of the wrapper-object syntax reading
    slightly less "shell-native." Revisit only if user feedback strongly prefers the shell syntax.
- **Save semantics are whole-document replace, not changed-fields update** - `findOneAndReplace`
  keyed on `_id`, matching the "Compass model" the exec plan names (Compass's own default document
  editor replaces the whole document, not a computed field-level diff). A diff-based `$set` of only
  the changed top-level keys was considered and rejected: correctly detecting field _removals_ (not
  just changed values) requires the same full-document comparison a replace already does for free,
  and diffing does not by itself solve the lost-update race below any better than a whole-document
  compare-then-replace does - so it adds complexity without a matching safety win.
- **Lost-update protection**: the editor captures the full document (via EJSON) at load time. On
  save, the server re-fetches the document by `_id` and compares it (structurally, not by a version
  field - MongoDB documents have no built-in version counter here) to what was originally loaded; if
  they differ, the save is rejected as a conflict (same `409` treatment SQL's `matched: 0` gets) with
  the current document's data available for the user to reload and re-apply their edit, rather than
  silently overwriting a concurrent change.
- Route: `PATCH /api/tables/:schema/:table/rows` (the same route SQL update uses - see "Mutation API
  shape") with `key: { _id: string }` and `document` as the full relaxed-EJSON document text, parsed
  server-side into real BSON before the `findOneAndReplace` call - the browser never sends raw BSON,
  only EJSON text, same "typed JSON in, adapter translates" principle as every SQL mutation.
- Document **insert** (MongoDB's `insertRow`) takes the same relaxed-EJSON format for the whole new
  document, parsed the same way; `_id` may be omitted (the driver assigns one) exactly as an
  auto-generated SQL primary key may be.

### Out of scope (for now)

- Canonical (as opposed to relaxed) EJSON as a user-facing toggle. Relaxed is the only supported
  mode for the editor text; revisit only with real demand for the fully-unambiguous-but-verbose form.
- Field-level (as opposed to whole-document) MongoDB editing, and any cross-document MongoDB
  transaction/batch - explicitly not part of this spec, matching exec plan decision 5 and F102's own
  scope ("MongoDB is deliberately NOT part of \[the batch commit\] endpoint").
- A JSON schema/shape validator beyond "is this parseable, unambiguous EJSON" - MongoDB is
  schemaless by design; Qyre doesn't invent document-shape constraints it doesn't enforce.

## Audit-event contract

### Behavior

- Every mutation - a single per-op route call (F099-F101), a batch-commit operation (F102), or a
  MongoDB document save (F125) - produces exactly one audit record in **both** places exec plan
  decision 8 names, so the trail survives the EventLog's 200-entry in-memory cap:
  1. `EventLog.log(level, message)` (Console tab, already existing infrastructure, F028) - a single
     human-readable line: operation kind, target `schema.table`, affected row count, outcome.
     `level` is `"info"` on success, `"warn"` on a reported conflict (`409`), `"error"` on an
     unexpected failure. Example: `Inserted 1 row into public.users.` /
     `Update rejected: public.users row no longer matches (stale).`
  2. A structured `request.log.info(...)` (or `.warn`/`.error` to match) call in the route handler
     itself - Fastify's already-configured pino logger (`packages/server/src/app.ts`), not a new
     logging dependency - with fields: `{ operation: "insert" | "update" | "delete" | "commit",
schema, table, rowCount, durationMs, outcome: "success" | "conflict" | "error" }`. This is what
     survives past the EventLog's 200-entry cap in the terminal's own scrollback/log file, per exec
     plan decision 8's "audit trail survives the EventLog cap" requirement - the EventLog entry is
     for the Console tab's UX, the pino line is the durable record.
- A batch commit (F102) logs **one** audit record for the whole commit (not one per staged
  operation) with the aggregate row count and outcome, plus - on a mid-batch failure - the failing
  operation's index and kind, so the Console/log line for a 12-op commit that failed on op 7 reads as
  one coherent event, not 12.
- No off-machine telemetry (`docs/SECURITY.md`) - both audit channels are local-only, matching every
  other logging path in the app today.

### Out of scope (for now)

- Persisted audit history beyond the EventLog's existing 200-entry cap and the terminal's own log
  retention. No database-backed audit table; Qyre is local-first and doesn't introduce its own
  storage for this.
- Per-user attribution beyond "the current Qyre session" - Qyre has no user accounts.

## Confirmation thresholds

### Behavior

Restates and applies `docs/SECURITY.md`'s existing "destructive actions... require explicit,
unambiguous user confirmation and must never be the default path" rule concretely for this spec's
scope:

- **Insert**: no extra confirmation beyond the pending-buffer preview (SQL) or the document editor's
  own save action (MongoDB) - additive, non-destructive, matches how every other non-destructive
  action in the app already works.
- **Update**: the pending-buffer preview (SQL) or an explicit save click showing what changed
  (MongoDB) is the confirmation - reviewing the generated statement/diff before committing is itself
  the "explicit, unambiguous" step; no separate modal per cell edit.
- **Delete**: always requires its own explicit confirming click at the moment it's staged (SQL) or
  triggered (MongoDB, F125), in addition to the buffer/commit review - deletion is irreversible data
  loss, the clearest case `docs/SECURITY.md`'s rule exists for, and staging one silently alongside
  ordinary edits would violate "must never be the default path."
- **Batch commit**: the buffer preview already lists every staged operation (including any deletes,
  each already individually confirmed when staged) before the user clicks Commit - this is the final
  confirmation for the whole batch, not a re-confirmation of each already-confirmed delete.

### Out of scope (for now)

- Configurable confirmation thresholds (e.g. "always confirm updates too", "skip delete
  confirmation"). One fixed policy for now; revisit only with real demand.
- A typed "type the table name to confirm" pattern (common for whole-table-destructive actions like
  `DROP TABLE`) - out of scope for _row_-level operations, which this spec covers; Phase D's DDL
  slices (F109 onward) own that decision for schema-destructive actions.

## Acceptance criteria

This is a spec-only slice (`verification: pnpm check:state`) - no adapter, route, or type
implementation lands with F098 itself, matching F090's precedent exactly.

- `docs/product-specs/index.md` lists this spec, and `pnpm check:state` passes with no other files
  changed.
- `RowMutationApi`'s exact shape (`insertRow`/`updateRowByKey`/`deleteRowsByKey`, their
  result types, and the `matched`/`deleted`-count "stale row" semantics) is fixed precisely enough
  that F099/F100/F101 can implement it per engine without a design decision left open.
- The three per-op routes' exact paths/methods/body shapes are fixed, so F099-F101 don't re-decide
  them.
- Exec plan open decision 5 (commit endpoint shape) is resolved with a reasoned answer (single
  `POST /api/mutations/commit`, not per-table) that F102 can build against directly.
- Exec plan open decision 1 (MongoDB EJSON flavor and replace-vs-changed-fields semantics) is
  resolved with a reasoned answer - relaxed Extended JSON via `bson`'s `EJSON`, whole-document
  `findOneAndReplace` with a compare-then-replace conflict check - precise enough that F125 can
  build the document editor against it without re-deciding either question, and explicit about why
  it diverges from both the grid's own display format and from Compass's shell-helper syntax.
- Value validation/coercion per column type is fixed by reference to the existing F082/F089
  `FilterColumnKind` classification (reused, not reimplemented) precisely enough that F099/F100 can
  implement the same rule server-side without inventing a parallel classification.
- The audit-event contract (EventLog line + structured pino fields, one record per per-op call and
  one aggregate record per batch commit) is fixed precisely enough that F099-F102/F125 can implement
  logging identically instead of each inventing its own shape.
- Confirmation thresholds per action (insert/update/delete/batch-commit) are stated precisely enough
  that F103-F105/F125's UI slices implement one consistent policy instead of each re-deciding when a
  confirmation click is required.
- Row identity/editability rules (full PK required, composite keys, MongoDB `_id`, `kind`-gating,
  non-editable column kinds) are stated precisely enough that F103 (the editable grid) and F125 (the
  document editor) can gate their own affordances without re-deriving the rules from first
  principles.

Once F099-F105/F125 land, this section should also be checked against their real implementation and
updated (or a follow-up spec added) if anything ended up diverging - per `docs/product-specs/
index.md`'s own "if implementation diverges from a spec, update one of them in the same session"
rule.
