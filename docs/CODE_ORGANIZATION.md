# Code organization

Qyre groups code by cohesive responsibility. Domain, resource, capability, and technical layer are
all valid boundaries when they match the code's ownership and dependencies. Examples in this file
illustrate a decision; they do not prescribe folder names.

Existing flat areas predate this contract and are migration debt in Plan 0005. Do not add more flat
files while they are being moved. Structural moves remain behavior-preserving slices.

## Universal placement rules

- Name a file's responsibility, layer, and consumers before creating it.
- Choose folder boundaries from actual cohesion: code that changes together should be easy to find
  together; unrelated behavior should not accumulate in one flat directory.
- Keep roots for entrypoints and genuinely shared infrastructure.
- File count and line count are warning signals, not quotas. Split when navigation, review, or
  independent reasons to change show that a module owns too much.
- Avoid `utils.ts`, `helpers.ts`, and global `types.ts`. Use a concern name such as
  `row-filter.ts`, `query-retry.ts`, or `connection-target.ts`.
- Package `index.ts` files expose the public API only. Internal code imports concrete modules.

## Types and validation

- A type used by one file stays beside its implementation, including component props.
- Types used by multiple files in one cohesive area belong in that area's `types.ts`.
- HTTP and product contracts shared between browser and server belong in a suitably named module
  under `packages/core/src/types/`.
- Runtime boundary schemas belong under `packages/core/src/validation/` with the same ownership.
- Driver-only types stay inside the owning driver.
- Use `import type` and `export type` for type-only edges. ESLint enforces this.
- Never duplicate an existing shared shape merely to avoid an import.

Extracting every local interface into its own file is prohibited: it increases navigation and file
count without creating ownership. Extract only when a second consumer exists or the type is a
public contract.

## Tests

Every package uses a dedicated `tests/` tree mirroring `src/`:

```text
packages/ui/
  src/table/rows-table.tsx
  tests/table/rows-table.render.test.tsx

packages/server/
  src/routes/rows.ts
  tests/routes/rows.test.ts

packages/drivers/postgres/
  src/introspection.ts
  tests/introspection.test.ts
  tests/integration/adapter.test.ts
```

- Mirror the chosen source organization so implementation and tests remain easy to pair.
- Add `unit/`, `integration/`, or `render/` only when an area has multiple real test levels.
- Put shared fixtures and setup in `tests/support/`, never mixed with assertions.
- Root browser journeys live in `tests/e2e/journeys/`; fixtures and server launchers live in
  `tests/e2e/support/`.
- Use `*.test.ts(x)` for Vitest and `*.spec.ts` for Playwright.
- A test filename names the behavior owner, not a ticket ID.

Vitest discovers tests in dedicated folders. Package configs must point setup files at `tests/`
when each package is migrated.

## Web application

The web app uses an enforced three-layer architecture:

```text
app/                           composition, providers, workspace state, global styles
features/<capability>/api/     endpoint wrappers
features/<capability>/model/   query hooks, state, and domain logic
features/<capability>/ui/      web-only composition
shared/api/                    HTTP transport
shared/lib/<concern>/          dependency-free infrastructure
```

Dependency direction is `shared -> features -> app`. Features never import another feature; app
composes them. Tests mirror the complete path under `apps/web/tests/`. Reusable presentation belongs
in `@qyre/ui`; cross-runtime contracts belong in `@qyre/core`. Add routing/pages only when the
product gains URL-addressable screens.

## UI package

Group presentation components when the existing flat directory becomes hard to navigate. Possible
boundaries include product responsibility, layout, feedback, or primitives, but use only boundaries
the components actually exhibit. UI code may depend on `core` types but must not fetch data or
import server/driver packages.

## Server

`packages/server/src/` uses:

```text
app.ts                 builds Fastify and registers plugins/routes
index.ts               public exports only
routes/<resource>.ts   one resource-oriented Fastify plugin
services/<concern>.ts  reusable application behavior without HTTP concerns
plugins/<concern>.ts   Fastify decorators and cross-cutting infrastructure
shared/                genuinely cross-domain errors or small infrastructure
```

Fastify plugins provide route encapsulation. Handlers validate the HTTP boundary, call services or
adapters, and format responses; they do not accumulate unrelated helper logic.

Reference: [Fastify Plugins](https://fastify.dev/docs/latest/Reference/Plugins/) and
[Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/).

## Drivers

Split each driver by the engine's actual concerns. Adapter lifecycle, introspection, querying,
filtering, conversion, and errors are examples, not a required file list. Do not force identical
modules across engines. Promote behavior to `drivers/contract` only after at least two engines prove
it is identical.

## Mechanical enforcement

After each area is migrated, enforce objective invariants such as barrel-only entrypoints, mirrored
test ownership, and import boundaries. Do not encode arbitrary example folder names as checks.

Vitest explicitly supports dedicated test directories and recursive discovery:
[Writing Tests](https://vitest.dev/guide/learn/writing-tests). Type-only edges follow the
[TypeScript modules reference](https://www.typescriptlang.org/docs/handbook/modules/reference).
