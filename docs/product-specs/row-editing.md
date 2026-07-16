# Product Contract: Row Editing

Qyre supports role-aware row writes for connected users whose real database grants allow them.
`ConnectionCapabilities.supportsRowMutations`, table permissions, and the hard `--read-only`
override gate every affordance and server route; the database remains the final authority.

This spec is a data-contract and decision spec only, like F090 before it. It fixes the mutation API
shape every engine's adapter implements (F099-F101), the shared pending-changes-buffer and commit
model (F102-F105/F146), MongoDB's BSON-preserving field-mutation model, value validation/coercion, the
audit-event contract, and confirmation thresholds - so those slices build against one settled
contract instead of re-deciding it piecemeal. It does not implement any of them.

## One-sentence promise

A user with real write grants can insert, edit, and delete rows through the same typed, validated,
audited grid regardless of engine. SQL engines preview statements and commit transactionally;
MongoDB previews JSON operations and applies BSON-preserving field changes in order. A user without
the required grants never sees an affordance that would just fail anyway.

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
  case. A row whose key contains `null` cannot be targeted: SQLite permits this for non-`INTEGER`
  primary keys, but SQL equality cannot match the value. Update and delete requests reject it with
  400 `Rows with a NULL primary key cannot be targeted.` before calling the adapter (F137).
- Non-editable **columns** within an otherwise-editable table are decided by the mutation-specific
  editor capability matrix, not the filter classifier. Filtering and mutation have different
  fidelity requirements: a filter may safely accept a coarse search value that would be lossy as a
  stored replacement. JSON and supported native arrays use dedicated validated editors. Binary
  values use an exact hexadecimal contract; unknown types stay read-only because Qyre never guesses
  a coercion. Time and timestamp values are
  editable only through the exact temporal editor that preserves seconds, fractional precision,
  and timezone/offset semantics without a JavaScript `Date` conversion. A primary-key column is always editable
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
- Changing a row's primary key value via update (see above) - delete-and-reinsert is the only path,
  and this spec doesn't wire a combined "rekey" operation for it.

## Mutation API shape

### Behavior

- `DatabaseAdapter` (`packages/drivers/contract`) gains an optional namespace, per exec plan
  decision 3 (`mutations?: RowMutationApi`) - absent means the engine has no write mechanism at all
  (none do today; every engine implements it once its own F099-F101 slice lands), present-but-grants-
  insufficient is a normal per-call rejection, not a missing namespace. Each member of
  `RowMutationApi` is itself optional (not the namespace's own presence/absence) - F099/F100/F101
  each land one method across all four engines, so `updateRowByKey`/`deleteRowsByKey` are simply
  `undefined` on every adapter until their own slice populates them, without forcing an all-or-
  nothing implementation in one giant slice.
  ```ts
  export interface RowMutationApi {
    insertRow?(
      schema: string,
      table: string,
      values: Record<string, unknown>
    ): Promise<InsertRowResult>;
    updateRowByKey?(
      schema: string,
      table: string,
      key: Record<string, unknown>,
      changes: Record<string, unknown>
    ): Promise<UpdateRowResult>;
    deleteRowsByKey?(
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

- Every column's edit value is validated against the mutation contract. The UI's editor capability
  matrix is deliberately separate from `FilterColumnKind`: filterability must not imply that Qyre
  can safely author a replacement value.
  - Single-line scalar editors apply on `Enter`. Multiline and structured editors preserve plain
    `Enter` for new lines and apply on `Ctrl/Cmd+Enter`; every editor also exposes explicit Apply
    and Cancel actions, and `Escape` cancels without staging. Leaving a valid inline scalar input
    with the mouse stages its live input value too, including a final change not yet reflected by a
    React render. Opening an inline scalar editor keeps the shortened display value in table layout
    while the input overlays it, so editing a long value never collapses or expands the column.
  - `text`: JSON string. Long-text families use a multiline editor; fixed/varying character
    families use a single-line editor. An empty string remains distinct from `NULL`.
  - `identifier`: JSON string. UUID columns additionally require the canonical hyphenated UUID
    shape before staging.
  - `numeric`: the UI sends an exact decimal string, not a JavaScript `number`, so integers beyond
    `Number.MAX_SAFE_INTEGER`, fixed-scale decimals, and exponent notation are never rounded in the
    browser. The server accepts that validated decimal grammar and passes the string as a bound
    parameter; existing API callers may still send a finite JSON number for backward compatibility.
    The database remains authoritative for native precision/range.
  - `boolean`: JSON boolean.
  - `enum`: one JSON string selected from authoritative engine metadata. `set` uses a JSON string
    array whose members are each validated against that metadata; the server converts the list to
    the engine's native bound representation.
  - `date` / `time` / local timestamp / timezone timestamp: exact strings with engine-aware lexical
    validation. The editor preserves seconds, fractional precision, and an existing `Z`/numeric
    offset, and shows the original and draft together before Apply. Neither browser nor server
    constructs a JavaScript `Date`; the driver binds the validated string unchanged. MySQL `TIME`
    retains its signed-duration range, while PostgreSQL time-of-day and timezone shapes remain
    distinct. Timestamp calendar editing reuses the same shared calendar panel as row filtering;
    choosing a day replaces only the date prefix and preserves the exact separator, time, fractional
    seconds, and timezone suffix.
  - `JSON` / `JSONB`: the editor parses JSON, reports line and column, formats on explicit request,
    and stages the parsed JSON value. Editing opens directly in the established right-side drawer,
    with the column named once in its header and no intermediate popover or duplicated metadata.
    The viewport-bounded drawer retains Format, Minify, Copy, validation errors, nullable selection,
    Cancel, and Apply; its action row remains visible without scrolling below the editor. The server
    serializes the value exactly once for the SQL driver.
    PostgreSQL native scalar arrays use the same full-value surface but require a JSON array and
    remain native arrays at the driver boundary. SQLite has no native array contract; MySQL arrays
    remain JSON values rather than a separate native array kind.
  - `binary`: the right-side drawer displays canonical lowercase hexadecimal bytes grouped into
    readable 16-byte rows, with a byte count and ASCII preview. It accepts optional `\\x`/`0x`
    prefixes and whitespace, rejects non-hex or incomplete bytes, and normalizes the value before
    staging. The server converts the validated hex to a bound `Buffer`; PostgreSQL `bytea`, MySQL
    binary/blob families, and SQLite `BLOB` therefore share one lossless byte contract. Grid chrome
    uses the friendly type label `bytes`; schema details retain the exact engine type. Duplicate row
    converts the source row's transport-level Buffer object to the same canonical hex draft before
    staging, so an untouched duplicated binary value remains insertable.
  - PostgreSQL `interval`: the driver preserves raw database text. If an already-open or legacy
    connection still returns `pg`'s parsed object shape, the editor converts its year/month/day/time
    fields back to PostgreSQL interval text instead of displaying `[object Object]`. The right-side
    drawer binds edited text unchanged, leaving grammar and range validation to PostgreSQL.
  - Every right-side drawer derives Apply availability from the same parser used to stage the
    value. Invalid JSON/array syntax, malformed binary hex, and empty invalid interval drafts show
    their error and disable Apply; Ctrl/Cmd+Enter follows the same guard.
  - PostgreSQL `bit` / `bit varying`: a scalar string containing only `0` and `1`, preserving
    leading zeroes. MySQL `BIT` remains read-only until column bit length is carried with the row
    value so its Buffer representation can be decoded without guessing.
  - PostgreSQL `inet` / `cidr` / `macaddr`: exact text bound unchanged. PostgreSQL remains
    authoritative for address syntax and range semantics.
  - `XML`: raw multiline text in the right-side drawer, bound unchanged. The native database type
    remains authoritative for XML validity.
  - `objectId` (MongoDB only): JSON string, further validated as a syntactically valid 24-hex-char
    ObjectId before the adapter constructs a real `ObjectId` from it.
  - `null`: only accepted when the column is `nullable`; identical to how `RowFilter`'s `isNull`
    already respects nullability.
  - `unknown`: never accepted - see "Row identity and editability" above.
- Only one grid editor is active at a time. Clicking a different body cell dismisses any scalar,
  structured, or inserted-row editor after the current scalar input has had a chance to stage its
  blur result; interaction inside the active cell or its portalled editor does not dismiss it.
- This validation happens **before** the adapter is called, using the table's own freshly-
  introspected columns (never a client-supplied schema) - the same trust boundary `resolveRowSort`/
  filter-column validation already enforces.
- A `key`/`changes`/`values` map with an unrecognized column name is rejected `400`, same treatment
  an unrecognized `sortColumn`/filter `column` already gets.

### Per-engine editor matrix

| Editor kind                | PostgreSQL                              | MySQL                                 | SQLite                                   | MongoDB                                             |
| -------------------------- | --------------------------------------- | ------------------------------------- | ---------------------------------------- | --------------------------------------------------- |
| Text / multiline / UUID    | scalar cell                             | scalar cell                           | scalar cell                              | scalar cell                                         |
| Exact integer / decimal    | decimal-string binding                  | decimal-string binding                | decimal-string binding                   | numeric cell; preserves current BSON type on update |
| Boolean / nullable boolean | tri-state selector                      | tri-state selector                    | tri-state selector when declared boolean | tri-state selector                                  |
| Enum / set                 | catalog enum selector; no native set    | `ENUM` selector; `SET` multiselect    | not applicable                           | not applicable                                      |
| Date / time / timestamp    | exact date/time/local/offset editors    | exact date/time/local editors         | exact declared-type editor               | offset timestamp editor                             |
| Interval                   | raw-text drawer                         | not applicable                        | not applicable                           | not applicable                                      |
| JSON / object              | JSON/JSONB editor                       | JSON editor                           | declared JSON editor                     | shared JSON drawer                                  |
| Native scalar array        | JSON-array editor with element metadata | not applicable outside JSON           | not applicable                           | shared JSON-array drawer                            |
| Binary                     | hex drawer -> bound `Buffer`            | hex drawer -> bound `Buffer`          | hex drawer -> bound `Buffer`             | hex drawer -> BSON Binary                           |
| Bit string                 | validated `0`/`1` scalar                | read-only pending bit-length metadata | not applicable                           | not applicable                                      |
| Network                    | exact native text                       | not applicable                        | not applicable                           | not applicable                                      |
| XML                        | raw multiline drawer                    | not applicable natively               | declared XML text drawer                 | not applicable                                      |
| Unknown / mixed            | explained read-only                     | explained read-only                   | explained read-only                      | explained read-only                                 |

`ColumnMetadata.allowedValues` carries authoritative enum/set values when the engine exposes them;
`elementDataType` identifies a supported native array's element type. Missing metadata fails closed
instead of degrading to a free-text field. These fields are advisory UI metadata only: the server
re-introspects and validates the same contract before any adapter call.

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
  - MongoDB uses the same endpoint and operation shapes, but a standalone deployment cannot provide
    a cross-document transaction. Its fully validated operations run in order; a conflict stops the
    sequence and reports both the failing index and how many earlier operations were applied. The UI
    refreshes after a partial result instead of presenting it as a rollback.
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

## MongoDB: shared grid editing with BSON-preserving JSON operations

### Behavior

- MongoDB collections use the same selection, double-click/Enter/F2 activation, typed editors, Add
  row, Duplicate row, staged delete, Commit bar, and discard/revert interactions as SQL tables.
  `_id` is the row key: ObjectIds cross the adapter boundary as stable lowercase hexadecimal text,
  and the server also normalizes the safe Extended JSON `{ "$oid": "..." }` wire form plus the
  exact legacy 12-byte buffer shape emitted by an already-open pre-fix browser session. `_id` may
  be supplied on insert but is immutable afterward.
- Sampled field metadata selects the editor. Plain objects and arrays use the shared structured
  drawer; strings, numbers, booleans, dates, ObjectIds, and binary values reuse the corresponding
  scalar or full-value editor. BSON regex, timestamp, code, MinKey, and MaxKey values use validated
  JSON shapes in that same drawer and are converted back to their real BSON types on commit. Add
  row prefills a valid type-specific JSON template. `mixed`, null-only, and unrecognized BSON
  types still fail closed rather than guessing a lossy conversion.
- `POST /api/mutations/commit` receives JSON operation objects, never Mongo shell/query text.
  Inserts are converted to relaxed EJSON/BSON server-side. Updates send `key`, `changes`, each
  changed field's `originalValues`, and `missingOriginalFields` for fields absent in the loaded
  document.
- Updates use `$set` for changed top-level fields only. The adapter reads the current document,
  checks every edited field against the value originally displayed, preserves that field's current
  BSON type recursively where possible, and includes the current BSON values in the update filter.
  A same-field concurrent change therefore returns `matched: 0`; unrelated concurrent fields are
  neither overwritten nor treated as conflicts.
- MongoDB is schemaless, but the grid can only author sampled columns it can display. An untouched
  field is omitted on insert. `_id` may be omitted so MongoDB generates it. New unsampled field
  authoring and field removal require a future schema-free composer rather than overloading SQL's
  column grid with an ambiguous control.
- Successful ordered operations share the normal commit result and refresh behavior. MongoDB
  standalone deployments do not guarantee an all-or-nothing multi-document transaction; if a later
  operation conflicts, the response includes `appliedCount`, the UI clears stale staged state, and
  rows refresh to show the authoritative database result.

### Out of scope (for now)

- Arbitrary new field names or removing a field from an existing document.
- Editing BSON types still classified as mixed or unsupported from the bounded schema sample,
  such as the deprecated BSON Symbol type.
- Claiming SQL-style rollback semantics where a MongoDB deployment cannot provide transactions.

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

- **Insert**: no extra confirmation beyond the pending-buffer preview - additive,
  non-destructive, and consistent across engines.
- **Update**: the pending-buffer preview is the confirmation. SQL shows a statement preview and
  MongoDB shows the corresponding JSON operation; no separate modal appears per cell edit.
- **Delete**: always requires its own explicit confirming click at the moment it's staged, in
  addition to the buffer/commit review - deletion is irreversible data
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
- MongoDB uses field-level JSON changes with original-value conflict guards and BSON-preserving
  coercion; whole-document replacement remains an adapter compatibility path, not the Tables UI.
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
  non-editable column kinds) let the shared editable grid gate every engine without re-deriving the
  rules from first principles.

Once F099-F105/F125 land, this section should also be checked against their real implementation and
updated (or a follow-up spec added) if anything ended up diverging - per `docs/product-specs/
index.md`'s own "if implementation diverges from a spec, update one of them in the same session"
rule.
