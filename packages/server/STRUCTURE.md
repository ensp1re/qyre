# STRUCTURE.md (packages/server)

How `packages/server` is organized today, and the structure to grow into as more routes/concerns
are added. See [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md) for the domain map and
[`../../docs/CODE_ORGANIZATION.md`](../../docs/CODE_ORGANIZATION.md) for how this fits the rest of the
monorepo.

Based on Fastify's own recommended patterns - plugin encapsulation via `register()`/`decorate()`,
and `@fastify/autoload` for convention-over-configuration route loading - see the
[Fastify plugins guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) and
[`@fastify/autoload`](https://github.com/fastify/fastify-autoload).

## Current structure (few routes, follow this now)

```
packages/server/src/
  index.ts   # createServer()/startServer() - all routes registered inline, adapter/target/webRoot
             # passed in via a plain options object
```

One file is correct while there are ~5 routes and one cross-cutting concern (static serving). Don't
split into `routes/`/`plugins/` yet - see `docs/CODE_ORGANIZATION.md`'s "3-4 files" rule of tqyre.

## When to migrate: routes as encapsulated plugins

**Trigger:** once route count grows past what's comfortable to read in one file (e.g. F006's query
runner, F007's diagnostics, or a future write-capable engine adding more endpoints) - migrate to:

```
packages/server/src/
  index.ts            # barrel: createServer()/startServer(), unchanged public API
  app.ts               # builds the Fastify instance, registers plugins/routes below
  plugins/
    static.ts           # @fastify/static registration (the webRoot serving behavior)
    adapter.ts            # fastify.decorate("adapter", ...) instead of threading it through options
  routes/
    health.ts             # GET /api/health, one Fastify plugin per resource
    overview.ts
    tables.ts               # /api/tables/:schema/:table and its /rows sub-route
    query.ts                 # POST /api/query
```

### Rules once `routes/`/`plugins/` exist

- **Each route file is a Fastify plugin** (`export default async function (fastify, opts) {...}`),
  registered via `fastify.register(...)` in `app.ts`. This gets Fastify's encapsulation for free:
  each plugin has its own scope, so a decorator or hook added in one route file cannot leak into
  another - a directed acyclic graph, not implicit global state.
- **Inject the adapter via `fastify.decorate()`**, not by threading an options object through every
  route registration. Once there's more than one or two routes needing it, decoration is the
  Fastify-idiomatic way to make it available without manual plumbing, and it's what makes routes
  independently testable via `fastify.inject()` with a decorated test instance.
- **Adopt `@fastify/autoload`** once manually listing `fastify.register(routeA); fastify.register(routeB); ...`
  in `app.ts` becomes its own maintenance burden (rule of tqyre: once you're avoiding adding a route
  because updating the registration list feels like busywork). It scans `routes/` and registers
  everything by convention - don't reach for it before there's enough routes to justify the added
  indirection.
- **Bridge `@qyre/core`'s Zod schemas into Fastify's native schema slot** via
  `@fastify/type-provider-zod`, instead of calling `.parse()`/`.safeParse()` manually inside handlers
  (the current approach). Fastify pre-compiles schemas at startup for both validation and response
  serialization (`fast-json-stringify`) - manual Zod parsing inside a handler gets none of that
  compiled-validator performance. This is a genuine production concern per Fastify's own guidance,
  not just a style preference, so do it when `packages/server` actually needs the performance
  headroom (e.g. before handling non-trivial request volume), not speculatively now.

## Maintenance

- Don't split into `routes/`/`plugins/` speculatively - wait for the trigger above.
- Update this file if the target structure changes, and keep `ARCHITECTURE.md`'s Server domain row
  in sync with whichever structure is actually in use.
