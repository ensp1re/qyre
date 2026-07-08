# Web structure

The web app is grouped by the responsibilities proven by its imports and change patterns:

```text
src/
  app/          application composition and shell state
  connection/   connect, health, and recent-target behavior
  console/      event-log API, query state, and tab composition
  files/        file API, query state, and browser composition
  query/        SQL execution, history, and editor composition
  schema/       database overview, schema views, and graph
  table/        table metadata, row browsing, filtering, and export
  shared/       cross-domain HTTP transport and query policy
tests/          mirrors src/ ownership
```

These names describe current ownership; they are not a template for other packages. Peer areas do
not import each other's implementation. `app/` composes them, while genuinely reusable
presentation stays in `@qyre/ui`.

API wrappers, TanStack Query hooks, local state, and composition stay with the concern that owns
them. Tests mirror the production path under `tests/`. `pnpm check:web-structure` rejects the old
flat `api/`, `components/`, and `hooks/` roots and source-colocated tests.
