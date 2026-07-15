# Product Contract: Permissions and Capabilities

Qyre is strictly read-only today (`docs/SECURITY.md`): `runReadOnlyQuery` rejects non-SELECT
statements and no adapter exposes a write path. Plan 0006 turns Qyre into a role-aware IDE where a
user with broader database grants progressively gains row editing, SQL execution, schema (DDL)
management, and administration - while a read-only user keeps today's polished experience,
unchanged. None of that can happen safely until the application can ask two questions: "what can
this connection do in general" and "what can it do to this specific table" - and until every write
feature agrees on the same answer to "who actually decides."

This spec is a data-contract and decision spec only. It defines the two-tier capability model, the
per-engine introspection each tier reads, and where the authority boundary sits - turning the
architecture decisions already settled in
`docs/exec-plans/active/0006-role-aware-database-ide.md` into a reviewable product contract. It
does not implement introspection (F092-F095), the `--read-only` guard (F096), or any UI change
(F097) - those build on top of the types this spec fixes.

## One-sentence promise

Every part of Qyre - server routes and the browser UI alike - asks the same two typed questions
("can this connection do X in general" and "can it do X to this table") instead of each feature
re-deriving its own notion of what's allowed, and the connected database's own grants are always
the final word, never Qyre's guess.

## Tier 1: `ConnectionCapabilities` (session-level)

### Behavior

- A new type in `packages/core/src/types/schema/schema.ts`, alongside the existing `AdapterCapabilities`
  (F063):
  ```ts
  export type ReadOnlyReason = "qyre-flag" | "replica" | "connection" | "grants" | null;

  export interface ConnectionCapabilities extends AdapterCapabilities {
    readonly supportsRowMutations: boolean;
    readonly supportsDdl: boolean;
    readonly supportsIndexManagement: boolean;
    readonly supportsDatabaseManagement: boolean;
    readonly supportsTransactions: boolean;
    /** Why writes are unavailable when every `supports*` flag above is false; null once any flag
     * is true. "qyre-flag" - the CLI's `--read-only` flag (F096) forces this regardless of grants.
     * "replica" - the target is a read replica / in recovery (e.g. Postgres `pg_is_in_recovery()`).
     * "connection" - the session itself is read-only (e.g. `default_transaction_read_only`).
     * "grants" - the connected role simply lacks write privileges. */
    readonly readOnlyReason: ReadOnlyReason;
  }
  ```
  `ConnectionCapabilities` extends `AdapterCapabilities` rather than replacing it - `supportsSql`
  keeps its existing meaning (can this engine run arbitrary SQL text at all) and every new flag
  answers "can the _connected role_, not just the engine, do this."
- Each `supports*` flag is `true` only when both (a) the engine/adapter has the mechanism at all
  (e.g. MongoDB has no DDL concept, so `supportsDdl` is always `false` there, independent of
  grants) and (b) the connected role's introspected grants allow it. Engine-level "doesn't exist"
  and role-level "not permitted" collapse into the same `false` - callers never need to distinguish
  them, since the UI treatment (hide/disable the affordance) is identical either way.
- `DatabaseOverview.capabilities` (`packages/core/src/types/schema/schema.ts`) changes type from
  `AdapterCapabilities` to `ConnectionCapabilities` - additive at the field level (every existing
  consumer reading `capabilities.supportsSql` keeps working unchanged), but every adapter's
  `getOverview()` must now compute the new flags, not just `supportsSql`.
- `ConnectionCapabilities` is fetched once per connection: at initial connect and again on
  `POST /api/connect` (F064's database-switching path), matching `capabilities`'s existing
  lifecycle - it is not re-fetched on every request.

### Out of scope (for now)

- Polling specifically for grant changes or a manual capability-refresh button. F120 now refetches
  capabilities and table permissions after a real or advisory write denial; no background grant
  watcher is required because the database remains authoritative on every attempt.

## Tier 2: `TablePermissions` (per-table)

### Behavior

- A new type, also in `packages/core/src/types/schema/schema.ts`:
  ```ts
  export interface TablePermissions {
    readonly select: boolean;
    readonly insert: boolean;
    readonly update: boolean;
    readonly delete: boolean;
  }
  ```
- `TableMetadata` (`packages/core/src/types/query/table.ts`) gains an optional field:
  `readonly permissions?: TablePermissions`. Optional, not required, because F123's batched
  introspection and F124's `kind` field land after this spec and before permissions are actually
  populated (F092-F095) - `TableMetadata` must keep compiling and every existing test passing
  before those slices exist. A table with `permissions` omitted is treated identically to today
  (no permission-based UI change) until its engine's introspection slice lands.
- Once populated, `select` is expected to always be `true` in practice - Qyre only ever lists a
  table it could introspect via a `SELECT`-requiring catalog query, so a table the connection
  truly cannot read never appears in the response at all. The field exists for symmetry and so a
  future engine (or an unusual grant combination) that can prove existence without `SELECT` isn't
  structurally prevented from reporting `select: false`.
- `TablePermissions` is advisory in the exact same sense as `ConnectionCapabilities` (see below):
  some grant mechanisms are invisible to introspection entirely (Postgres row-level security,
  column-level grants, MySQL grants applied only via a role that isn't currently `SET ROLE`'d) -
  a table can report `update: true` and still have an individual write rejected by the database
  for a reason introspection couldn't see. This is expected, not a defect in this spec's contract.

### Out of scope (for now)

- Column-level permissions (e.g. a role that can `UPDATE` some columns but not others). Grid
  editing (F103) gates at the row/table level only; a column-level rejection surfaces the same way
  any other unforeseen grant mismatch does - a real database error, friendly-mapped (F120).
- Schema-level or database-level permission summaries beyond what `ConnectionCapabilities`
  already covers (`supportsDatabaseManagement`) - no `SchemaPermissions` type. Nothing in the
  planned UI needs schema-granularity finer than "can this connection manage databases/schemas at
  all."

## Advisory introspection, authoritative database

### Behavior

- **The connected database is always the final enforcer of every read and write.**
  `ConnectionCapabilities` and `TablePermissions` exist purely to drive UI affordances (show/hide/
  disable a control) and cheap server-side pre-checks (reject an obviously-disallowed request
  before round-tripping to the database) - never to promise a write will succeed.
- Every mutating route re-attempts the operation against the real database regardless of what
  introspection reported, and any permission-denied error the engine returns is mapped to a
  friendly, actionable message (F120) - never a raw driver error, never an unhandled crash.
- **Introspection failure degrades to read-only, never to assumed-writable.** If any introspection
  query itself fails (e.g. the connected role lacks even the catalog-read privilege introspection
  needs, or the engine version doesn't support a query this spec relies on), every `supports*`
  flag defaults to `false` and `readOnlyReason` is set to `"grants"` - the same outward behavior a
  genuinely read-only role gets, so a failure never silently grants an affordance it can't back up.
- `--read-only` (F096, existing CLI-level enforcement extended to a single central server guard)
  always wins regardless of what the database would otherwise allow: when set,
  `ConnectionCapabilities` reports every `supports*` flag `false` and `readOnlyReason: "qyre-flag"`
  without even running the introspection queries that would say otherwise - matching today's
  product promise that `--read-only` is a hard, Qyre-level ceiling.

### Out of scope (for now)

- Live, sub-session enforcement of database-side changes (e.g. detecting a `REVOKE` the instant it
  happens). Covered by "advisory, re-checked on every real attempt" above - this spec deliberately
  does not add polling, triggers, or a push mechanism.

## Structured permission denials (F120)

Every database-mutating route declares three pieces of metadata: its operation, its target kind,
and the engine-appropriate grant the connected role likely needs. Concrete adapters classify only
their own native errors (Postgres SQLSTATE, MySQL error code/errno, SQLite result code, MongoDB
code/codeName); routes never branch on engine names. A native denial or a fresh advisory pre-check
that returns 403 produces one shared response:

```json
{
  "error": "Permission denied while attempting to insert on public.users. The connected role likely needs INSERT.",
  "code": "permission-denied",
  "operation": "insert",
  "object": "public.users",
  "likelyMissingGrant": "INSERT"
}
```

- The status is 403. Raw engine text is absent from the HTTP response, EventLog, and structured
  request log; syntax, constraint, connectivity, and other non-permission failures retain their
  existing behavior.
- Owner-only errors replace the grant suggestion with `ownership of <object>`; read-only session
  errors suggest `write access on the current connection`.
- The EventLog records exactly one warning per denial, and pino receives only the safe operation,
  object, likely grant, and `permission-denied` outcome.
- The browser transport recognizes `code: "permission-denied"` before throwing the friendly
  message. It invalidates/refetches the `overview`, `allTables`, and individual `table` query
  families, so session capabilities and visible table permissions converge after a grant changes.
- Server startup rejects any route registered as `mutating` without denial metadata. This makes
  coverage of future write routes executable rather than relying on review memory.

Live conformance revokes Postgres table/schema grants in-session; MySQL table grants apply
in-session while its cached database-level `CREATE` grant requires reconnect before the DDL
assertion; SQLite uses a read-only file target. MongoDB's shared local/CI fixture runs without
authorization, so a live restricted-user denial is not applicable there; native code 13 is covered
by the shared classifier assertion and driver unit test.

## Per-engine introspection matrix

Each engine populates `ConnectionCapabilities`/`TablePermissions` from different native
mechanisms; the queries themselves are F092 (Postgres), F093 (MySQL), F094 (SQLite), F095
(MongoDB) - this spec only fixes which mechanism each engine is contracted to use, so those four
slices can be built in parallel against one shared understanding.

| Engine   | Session tier (`ConnectionCapabilities`)                                                                                                                                                      | Per-table tier (`TablePermissions`)                                                                                                                                                                                                       | Restricted test fixture                                      |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Postgres | `pg_is_in_recovery()`, `default_transaction_read_only`, role attributes (`pg_roles`), `has_database_privilege`/`has_schema_privilege(CREATE)`                                                | `has_table_privilege(current_user, t, 'SELECT/INSERT/UPDATE/DELETE')`, batched per schema (works for views too - `kind` from F124 decides whether the UI treats a view's `true` flags as usable)                                          | `qyre_readonly` role, `SELECT`-only grants                   |
| MySQL    | `@@global.read_only`, `@@session.transaction_read_only`, `information_schema.USER_PRIVILEGES`/`SCHEMA_PRIVILEGES`                                                                            | Union of `information_schema.TABLE_PRIVILEGES` + schema/user-level grants **and** role grants (`ROLE_TABLE_GRANTS`, MySQL 8.0.19+, or `SHOW GRANTS ... USING`) - plain `TABLE_PRIVILEGES` alone misses privileges granted only via a role | `qyre_readonly` user, `SELECT`-only grants                   |
| SQLite   | file and containing-directory writability (WAL/rollback-journal mode both need directory write, not just file write), `PRAGMA query_only`, whether the file was opened with a read-only flag | Uniform per file: SQLite has no per-table grants, so every table reports the same value the session tier already computed                                                                                                                 | A read-only file copy, or a `?mode=ro` connection URL        |
| MongoDB  | `{ connectionStatus: { showPrivileges: true } }` → `authenticatedUserPrivileges` action sets; an unauthenticated local connection is treated as full access, matching MongoDB's own default  | Map `find`/`insert`/`update`/`remove` actions from the same privilege document, keyed per database/collection resource                                                                                                                    | A user with the built-in `read` role on the fixture database |

### Out of scope (for now)

- Any actual query implementation - that is F092/F093/F094/F095, each shipping its own
  `@qyre/testing-conformance` cases per the cross-engine parity rule (`AGENTS.md`).
- Docker-compose fixture wiring for the "Restricted test fixture" column above - lands with each
  engine's own introspection slice, not this spec.

## API shape

### Behavior

`ConnectionCapabilities` travels inside the existing `GET /api/overview` response, extending its
current `capabilities: AdapterCapabilities` field to `capabilities: ConnectionCapabilities` -
**not** a separate endpoint. `TablePermissions` travels on each `TableMetadata` returned by
`GET /api/tables` and `GET /api/tables/:schema/:table`, alongside F123's batched-introspection
work, the same way `indexes`/`rowCount` already do.

This settles exec plan 0006's open decision #4. Reasoning: `capabilities` already lives on
`DatabaseOverview` per the F063 precedent (`adapter-capabilities.md`) - the browser already fetches
`/api/overview` once per connection and reads `capabilities.supportsSql` from it today, so
`ConnectionCapabilities` is an additive extension of a field and a round trip that already exist,
not a new one. A dedicated `/api/capabilities` endpoint would mean two round trips on every
connect/reconnect for data that changes on exactly the same schedule (`getOverview()`'s own
lifecycle) with no independent reason to be fetched separately.

### Out of scope (for now)

- Any new route. This section is a decision record, not new server code - `GET /api/overview`'s
  actual response shape changes only once an adapter starts populating the new fields (F092-F095).

## How the UI adapts

### Behavior

This spec fixes the contract the UI reads; the UI itself changes in F097 ("permission-aware UI
shell + e2e guard"), not here. The target shape F097 builds toward:

- A read-only connection (every `supports*` flag `false`) renders exactly today's UI - no new
  affordance appears, and a visible badge explains why via `readOnlyReason` (e.g. "Read-only:
  qyre --read-only flag", "Read-only: replica connection", "Read-only: your database role has no
  write grants").
- A connection with some `supports*` flags `true` reveals only the matching affordances (e.g.
  `supportsRowMutations` reveals the editable-grid entry points Phase B builds; `supportsDdl`
  reveals the table-designer entry points Phase D builds) - never an affordance for a capability
  that's `false`.
- A table whose `TablePermissions` don't support a given action (e.g. `update: false`) shows that
  action disabled at the row level even when the connection-level flag is `true` - the two tiers
  narrow independently; neither alone is sufficient to show a control.

### Out of scope (for now)

- Building any of the above - F097 and each write-feature slice (F099-F119) own the actual
  components. This spec only guarantees the data they'll read already exists in the shape
  described above.

## Acceptance criteria

This is a spec-only slice (`verification: pnpm check:state`) - no adapter, route, or type
implementation lands with F090 itself. The criteria below are what this document must fix so
F091-F097 can build against it without re-deciding anything:

- `docs/product-specs/index.md` lists this spec, and `pnpm check:state` passes with no other files
  changed.
- The exact shape of `ConnectionCapabilities`, `ReadOnlyReason`, and `TablePermissions` is fixed
  precisely enough that F091 ("capability plumbing") can add them to
  `packages/core/src/types/schema/schema.ts`/`query/table.ts` without a design decision left open - field names,
  types, and the `AdapterCapabilities`-extension relationship are all specified above, not implied.
- The API-shape decision (extend `GET /api/overview` vs. a new endpoint) is resolved with a
  reasoned answer, so F091 doesn't re-litigate it.
- The advisory-introspection/authoritative-database principle, and its two hard edges (introspection
  failure degrades to read-only; `--read-only` always wins over what grants would otherwise allow),
  are stated precisely enough that every later write-feature slice (F096, F099-F119) can point back
  to this spec instead of re-deciding its own fallback behavior.
- The per-engine introspection matrix above is complete enough that F092/F093/F094/F095 can
  implement each engine's actual queries by reference, not by re-researching which native mechanism
  to use.

Once F091-F097 land, this section should also be checked against their real implementation and
updated (or a follow-up spec added) if anything ended up diverging - per this doc's own "if
implementation diverges from a spec, update one of them in the same session" rule
(`docs/product-specs/index.md`).
