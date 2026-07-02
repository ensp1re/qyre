# STRUCTURE.md (apps/web)

How `apps/web` is organized today, and the structure to grow into as it gets bigger. See
[`../../FRONTEND.md`](../../FRONTEND.md) for stack/UI rules and [`../../docs/CODE_ORGANIZATION.md`](../../docs/CODE_ORGANIZATION.md)
for how this fits the rest of the monorepo.

This is based on how production React+Vite apps scale in practice - feature-based organization with
unidirectional imports, as documented by
[bulletproof-react](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
(one of the most widely adopted reference structures) - adapted to Humb's size and stack (no Redux,
TanStack Router/Query instead of custom routing/fetching).

## Current structure (small app, follow this now)

```
apps/web/src/
  main.tsx            # entry point: React root, QueryClientProvider
  App.tsx             # composition only: wires hooks to @humbdb/ui components
  api/<resource>.ts    # typed fetch wrappers returning @humbdb/core types
  hooks/use-<resource>.ts  # TanStack Query hooks wrapping the api/ fetchers
```

This is deliberately flat. With a handful of resources (health, overview, table, rows) a
`features/` split would be overhead with nothing to separate - see `docs/CODE_ORGANIZATION.md`'s
"3-4 files" rule of thumb. Keep using this shape until the trigger below fires.

## When to migrate: feature-based structure

**Trigger:** once `apps/web` has multiple distinct pages/routes (TanStack Router is already the
committed stack per `docs/design-docs/stack-and-structure.md`, just not wired in yet) or enough
resources that `api/`/`hooks/` stop reading as one coherent unit - migrate to:

```
apps/web/src/
  main.tsx
  app/
    routes/            # TanStack Router route tree and route components
    providers.tsx        # QueryClientProvider, router provider, etc.
  features/
    <feature-name>/
      api/               # this feature's fetch wrappers
      hooks/              # this feature's TanStack Query hooks
      components/          # components used only within this feature
  components/           # shared composition components used across features (not @humbdb/ui - that's
                         # the cross-app reusable design system, this is apps/web-only composition)
  lib/                  # preconfigured singletons (query client instance, etc.)
```

Likely first features, based on current functionality: `connection` (health/status),
`schema-browser` (nav tree + table metadata), `table-rows` (pagination). A future query runner
(F006) would be its own feature.

### Rules once `features/` exists

- **Unidirectional imports**: `components/`/`hooks/`/`lib/` (shared) -> `features/*` -> `app/`.
  A feature must never import from another feature or from `app/`; compose multiple features
  together at the `app/` (route/page) level only. This is the single rule that keeps a growing
  frontend from turning into a dependency tangle - enforce it with ESLint's
  `import/no-restricted-paths` once there are enough features for a violation to be likely.
- **No barrel files inside `features/<name>/`.** Import directly
  (`features/schema-browser/hooks/use-overview.js`, not a re-exporting `index.ts`). Barrel files
  defeat Vite's tree-shaking and blur the unidirectional-import boundary above. `@humbdb/ui`'s own
  package barrel is fine - it's a small, deliberately-curated public API, not an internal feature
  folder.
- **`@humbdb/ui` vs. `apps/web/src/components/`**: `@humbdb/ui` is the reusable, presentation-only
  design system (usable by any future app in this monorepo). `apps/web/src/components/` is
  composition specific to this app - it may fetch data indirectly via hooks and know about
  app-level layout, `@humbdb/ui` must not.
- **File naming stays kebab-case** (`use-overview.ts`, `schema-tree.tsx`) per
  [`docs/NAMING.md`](../../docs/NAMING.md) - only the exported symbol is `PascalCase`
  (components) or `camelCase` (hooks/functions). Don't switch to PascalCase filenames even though
  many React style guides suggest it; stay consistent with this repo's naming rule.

## Maintenance

- Don't migrate to `features/` speculatively - wait for the trigger above. Restructuring code that
  doesn't need it yet is exactly the kind of premature abstraction the four core rules warn against.
- Update this file if the target structure changes, and update `docs/CODE_ORGANIZATION.md`'s
  `apps/web` section to stay in sync (that one covers the current-state summary; this one is the
  detailed reference and growth path).
