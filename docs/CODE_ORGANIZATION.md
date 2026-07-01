# CODE_ORGANIZATION.md

Folder-level rules for how code is organized within packages. `ARCHITECTURE.md` says which packages
may depend on which; this file says how code inside those packages is laid out. Both exist so a
fresh agent adding a type, a component, or a database engine has one obvious place to put it.

## Why this exists

`@humb/core` is imported by both `packages/server` (backend) and `apps/web` (frontend). A single,
well-organized source of truth for the types (and their runtime validation) that cross that
boundary is what prevents the two sides from silently drifting apart - e.g. the frontend assuming a
field is always present that the backend doesn't actually guarantee. That is a correctness and
security concern (see `docs/SECURITY.md`'s "validate at the boundary" rule), not just tidiness.

## `@humb/core`: shared types and validation

`packages/core/src/` is organized by concern, never one flat `index.ts`:

- `types/<concern>.ts` - pure TypeScript types/interfaces with no logic (`connection.ts`,
  `table.ts`, `schema.ts`, `query.ts`, `health.ts`).
- `errors.ts` - shared error classes.
- `connection-target.ts` - parsing/validation logic for the connection target (not a pure type).
- `validation/<concern>.ts` - Zod schemas for HTTP API request/response boundaries. These are the
  single source of truth for both the server's runtime enforcement and any client-side validation
  (e.g. a future query-runner form validating input before it ever hits the network).
- `index.ts` is a barrel only: `export * from "./..."`. It never defines anything itself.

Rule of thumb: if both `packages/server` and `apps/web` need to know a shape (an API request or
response type), it belongs in `@humb/core`, not hand-duplicated in each. `HealthResponse` and
`ConnectionStatus` are the canonical example - they used to be redefined separately in `apps/web`
and `packages/ui`; now both import them from here.

## `@humb/ui`: one component per file

`packages/ui/src/components/<component-name>.tsx`, kebab-case, shadcn-style (matches
`docs/design-docs/stack-and-structure.md`). `index.tsx` is a barrel only.

`@humb/ui` may depend on `@humb/core` for shared domain types when a component's prop is genuinely a
shared domain concept (e.g. `StatusBadge`'s `status: ConnectionStatus`). It must not fetch data or
import server/driver packages - see `FRONTEND.md`.

## `apps/web`: composition, not one giant component

- `api/<resource>.ts` - typed `fetch` wrappers returning `@humb/core` types.
- `hooks/use-<resource>.ts` - React Query hooks wrapping the `api/` fetchers.
- `App.tsx` (and future route/page components) - composition only: wire hooks to `@humb/ui`
  components. No inline `fetch` calls or hand-rolled response types.

This flat shape is deliberate while the app is small. See
[`apps/web/STRUCTURE.md`](../apps/web/STRUCTURE.md) for the feature-based structure to migrate to
once it grows (multiple routes/pages, or `api/`/`hooks/` stop reading as one coherent unit) - do not
migrate speculatively.

## `packages/server`: routes inline until they don't fit in one file

Currently one file (`packages/server/src/index.ts`) registering all routes directly - correct while
there are only a handful of routes and one cross-cutting concern (static serving). See
[`packages/server/STRUCTURE.md`](../packages/server/STRUCTURE.md) for the Fastify plugin/route/schema
structure to migrate to once that stops being true.

## Database drivers: `packages/drivers/`

Every engine-related package lives under `packages/drivers/`:

- `packages/drivers/contract` (`@humb/driver-contract`) - the engine-agnostic `DatabaseAdapter` /
  `AdapterFactory` contract, plus genuinely engine-agnostic shared utilities (e.g. pagination
  clamping via `resolvePageRequest`). It must not depend on a concrete engine.
- `packages/drivers/<engine>` (`@humb/<engine>`, e.g. `@humb/postgres`) - one package per engine,
  implementing the contract. Named `<engine>` alone, not `db-<engine>` - the `drivers/` folder
  already conveys what these packages are.

**Only move logic into `driver-contract` if it is truly identical across every engine.** Some logic
looks generic but isn't - SQL identifier quoting is the canonical trap: Postgres uses `"..."`, MySQL
uses `` `...` ``, and a shared "generic" implementation would silently be wrong for the next engine.
When in doubt, leave it in the engine's own package; only promote it once a second engine proves it's
actually the same.

## Maintenance

- If a package's `src/` grows past ~3-4 files serving different concerns without a folder split,
  that's the signal to apply this rule, not a later cleanup task.
- Update this file (and `ARCHITECTURE.md`'s domain map) if the rules above change.
