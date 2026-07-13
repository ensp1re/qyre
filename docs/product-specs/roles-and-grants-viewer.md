# Product Contract: Roles & grants viewer

## One-sentence promise

Qyre shows which database identity, roles, effective grants, and connection facts explain the
current session's affordances without exposing credentials or offering role-management mutations.

## Shared contract

`AdapterCapabilities.supportsAccessInspection` advertises the read-only viewer independently of
write capabilities. When true, `DatabaseAdminApi.inspectAccess()` returns an `AccessOverview`:

- `identity`: the database-authenticated identity, never a connection URL or credential.
- `roles`: sorted role records with a name, `isCurrent`, and short engine-owned attributes.
- `grants`: sorted, human-readable effective privilege lines.
- `facts`: labeled session or filesystem facts that clarify access behavior.
- `notices`: non-fatal omissions, permission denials, or truncation messages.

The HTTP boundary is `GET /api/access`. It is always read-only, including under `--read-only`, and
returns `400` only when the connected adapter does not advertise access inspection. Genuine
connection/query failures remain errors; a denied optional catalog is represented by a notice and
the other readable sections still render.

Results are bounded to 500 roles and 1,000 grant lines. An engine that reaches either limit adds a
notice instead of returning an unbounded catalog. Individual strings are derived from database
identifiers/privileges and remain display-only; the browser never sends them back as SQL.

## Engine behavior

### Postgres

- `identity` is `current_user`; `session_user` appears as a fact when different.
- Roles come from explicit non-secret `pg_roles` columns (name plus boolean role attributes), with
  the current identity marked.
- Grants summarize rows visible for the current identity through `information_schema` role/table
  grant views. A catalog denial keeps identity available and adds a notice.

### MySQL

- `identity` is `CURRENT_USER()`; `USER()` and `CURRENT_ROLE()` appear as facts.
- `SHOW GRANTS` is the canonical effective-grant source because it includes grants resolved through
  active roles, unlike a plain `TABLE_PRIVILEGES` lookup.
- Role names are derived from `CURRENT_ROLE()` and grant lines; authentication clauses, hashes, and
  secrets are redacted if a server ever includes them.

### MongoDB

- Authenticated identities come from `connectionStatus`. An unauthenticated local server reports
  that state explicitly rather than inventing a user.
- `usersInfo`/`rolesInfo` enrich the current identities when permitted, always with credentials
  excluded. Their denial falls back to the safe `connectionStatus` identity/privilege summary and
  adds a notice.
- Privilege entries are reduced to action plus resource text; raw command responses are never sent
  to the browser.

### SQLite

- `identity` is `Local filesystem process`; roles and grants are empty because SQLite has neither.
- Facts include the database file, file/parent writability, connection read-only state, and
  `PRAGMA query_only`. They explain why write affordances may be unavailable without pretending
  SQLite has database roles.

## UI

Settings gains an **Access** section because it explains the current connection rather than a
specific table. It is capability-driven and handles disconnected/unsupported, loading, success,
empty, and error-with-retry states. The successful view shows identity first, then compact facts,
roles, grants, and notices. Database-supplied text uses the mono font; role accents use the design
system's purple semantic token. No UI branch checks the engine name.

## Security and out of scope

- No password, password hash, authentication mechanism payload, MongoDB credential document,
  connection URL, or environment secret may enter `AccessOverview`.
- Every catalog query is read-only. There are no create/alter/drop role or grant/revoke controls,
  routes, or adapter members in F119.
- Cross-database role graphs, inheritance visualization, privilege simulation, and permission
  editing are out of scope.

## Acceptance criteria

- Postgres, MySQL, SQLite, and MongoDB each implement the same adapter method and shared
  conformance shape; engine-specific non-applicable sections are explicit empty arrays.
- Restricted catalog access produces useful partial data plus a notice rather than hiding the
  viewer or failing the whole response.
- `--read-only` preserves access inspection while keeping every write capability disabled.
- The Settings view renders all required states, only from advertised capabilities, and contains no
  mutation-shaped control.
- Tests cover bounds, secret redaction, degraded sections, the HTTP route, browser query wiring,
  presentation states, and cross-engine live conformance.
