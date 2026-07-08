# Server structure

The server follows Fastify's plugin encapsulation model. See
[`../../docs/CODE_ORGANIZATION.md`](../../docs/CODE_ORGANIZATION.md) for the complete contract.

```text
src/app.ts                    builds Fastify, wires the shared ServerContext, registers plugins/routes
src/index.ts                  public exports only: createServer, startServer, EventLog, displayTarget, describeError
src/routes/<resource>.ts      one resource-oriented route registrar (health, connect, overview, tables, query, console, files)
src/services/<concern>.ts     reusable, HTTP-independent behavior (event-log, csv, files, row-query, connection-display, require-adapter)
src/plugins/<concern>.ts      Fastify cross-cutting infrastructure (host-guard, error-handler, static-web)
tests/routes/<resource>.test.ts
tests/plugins/<concern>.test.ts
tests/services/<concern>.test.ts
tests/support/                shared test fixtures (e.g. fake-adapter.ts)
```

Every route/plugin registrar takes the shared, mutable `ServerContext` (defined in `app.ts`) by
reference rather than closing over local variables directly - this is how `POST /api/connect`
(F064) swaps in a new adapter/target that every other route sees on its very next request, without
restarting the server. `requireAdapter` and the `resolveRowSort`/`resolveRowFilters`/
`resolveRowQuery` trio also throw `statusCode`-annotated errors, caught by `plugins/error-handler.ts`'s
global handler.

Route/plugin tests exercise the composed server through `createServer(...).inject(...)` (integration
style), so they import the public `src/index.ts` barrel rather than a route module directly.
