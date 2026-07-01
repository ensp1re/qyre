# ARCHITECTURE.md

Top-level map of the Humb system. Keep this concise and point to deeper docs when needed.

## System shape

- Product: Humb, a local-first database management UI launched from the CLI for any database engine.
- Primary user workflow: `npx humb <database-url>` -> engine auto-detected from the target -> local
  server -> browser UI -> inspect database.
- Runtime surfaces: CLI, local HTTP server, browser SPA.
- Source of truth for product behavior: [`docs/product-specs/`](docs/product-specs/).

## Runtime flow

```mermaid
flowchart LR
  cli["packages/cli (humb)"] --> server["packages/server (Fastify)"]
  server --> core["packages/core (contracts)"]
  server --> adapterApi["packages/drivers/contract (interfaces)"]
  adapterApi --> pg["packages/drivers/postgres (pg)"]
  server --> static["apps/web build (served static)"]
  browser["Browser SPA (apps/web)"] -->|HTTP /api| server
  web2ui["apps/web"] --> uikit["packages/ui"]
```

## Domain map

| Domain     | Purpose                                                  | Primary entry points                                     | Related spec                                         |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| CLI        | Parse target, start server, open browser, clean shutdown | `packages/cli/src/index.ts`                              | `docs/product-specs/connect-and-inspect-postgres.md` |
| Server     | Local HTTP API, health, static UI serving                | `packages/server/src/index.ts`                           | `packages/server/STRUCTURE.md`                       |
| Core       | Shared domain types, validation, and contracts           | `packages/core/src/` (`types/`, `validation/`)           | same                                                 |
| DB drivers | Engine-agnostic interface + concrete engine drivers      | `packages/drivers/contract`, `packages/drivers/<engine>` | same                                                 |
| Web UI     | Browser interface for inspection                         | `apps/web/src`                                           | `apps/web/STRUCTURE.md`                              |
| UI kit     | Reusable presentation components                         | `packages/ui/src/components/`                            | `FRONTEND.md`                                        |

## Folder organization

Every package that grows past a handful of exports is organized by concern, not left as one flat
`index.ts`/`index.tsx`. See [`docs/CODE_ORGANIZATION.md`](docs/CODE_ORGANIZATION.md) for the concrete
rules (types vs. validation vs. errors in `core`, one component per file in `ui`, driver packages
grouped under `packages/drivers/`). `index.ts`/`index.tsx` is a barrel only - it re-exports, it does
not define things.

## Layer model

Use a fixed directional model so agents do not invent ad hoc architecture:

`Types (core) -> Driver contract (drivers/contract) -> Driver impls (drivers/*) -> Server -> CLI`
and separately `UI kit (ui) -> Web app (apps/web)`. `ui` may depend on `core` for shared domain types
(e.g. `ConnectionStatus`) so the same type isn't hand-duplicated in both places - see
`docs/CODE_ORGANIZATION.md`.

The browser talks to the server only over the local HTTP API. The web app never imports server or
driver packages directly.

## Hard dependency rules

- Lower layers must not depend on higher layers.
- `packages/core` must not depend on server, CLI, drivers, or UI.
- `packages/drivers/contract` defines interfaces; it must not depend on a concrete engine.
- `packages/drivers/postgres` (and future `packages/drivers/<engine>`) depends on
  `driver-contract` and `core` only.
- `packages/server` may depend on `core`, `driver-contract`, and concrete driver packages.
- `packages/cli` depends on `server` (and `core`); it must not talk to drivers directly.
- `apps/web` depends on `ui` and `core` types only; all data access goes through the HTTP API.
- New database engines are added as new `packages/drivers/<engine>` packages, never by branching
  inside existing packages on engine type.

## Adding a new database engine

Postgres is the first supported engine, not the only one the architecture allows. Every additional
engine follows the same recipe:

1. Create `packages/drivers/<engine>` implementing the `DatabaseAdapter` contract from
   `@humb/driver-contract`.
2. Register it behind the server's adapter resolution, which detects the engine from the connection
   target (URL scheme, file extension, etc.) rather than requiring the user to name it.
3. Reuse genuinely engine-agnostic logic from `@humb/driver-contract` (e.g. pagination clamping).
   Do not reuse logic that only looks generic but actually differs per engine (e.g. SQL identifier
   quoting - `"..."` in Postgres, `` `...` `` in MySQL); keep that in the engine's own package.
4. Add a product spec and feature entries.
5. Add integration + end-to-end (connect-and-inspect) coverage.
6. If the engine's client library uses a connection pool, attach an error listener to it so a
   dropped connection (DB restart, network blip) degrades to `/api/health` reporting
   `"disconnected"` instead of crashing the whole process - see F007's audit of
   `packages/drivers/postgres`, where a missing `pool.on("error", ...)` listener did exactly that.

This keeps engine-specific logic isolated so adding a database is additive, never a branch inside
existing packages.

## Cross-cutting interfaces

| Concern    | Approved boundary              | Notes                                                      |
| ---------- | ------------------------------ | ---------------------------------------------------------- |
| Logging    | server logger (Fastify/pino)   | structured logs only, no ad hoc console in product code    |
| DB access  | `DatabaseAdapter` interface    | UI/server never embed engine-specific SQL outside adapters |
| Config     | `packages/config`              | shared TS/lint/test/build config                           |
| Validation | parse at boundaries (e.g. Zod) | validate untrusted input before use                        |

## Change checklist

When you touch architecture-relevant code:

1. Update this file if the domain map or boundaries changed.
2. Update the related design doc in [`docs/design-docs/`](docs/design-docs/) if reasoning changed.
3. Add or update an executable check if a rule should be enforced mechanically.
