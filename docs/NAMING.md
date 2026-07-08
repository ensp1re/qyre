# NAMING.md

Naming rules so agent-generated code stays consistent and the repository reads like an
intentional open-source project. These rules are enforced by review and, where possible, by lint.

## Packages

- Public packages are published under the `@qyre/` scope: `@qyre/core`, `@qyre/server`,
  `@qyre/driver-contract`, `@qyre/postgres`, `@qyre/ui`, `@qyre/qyre` (the CLI
  implementation).
- `packages/qyre` publishes a second package under the bare name `qyre` - a thin alias with no
  logic of its own beyond a `bin.js` that imports `@qyre/qyre/bin`, published purely so
  `npx qyre` and `npm install -g qyre` work (npx resolves an unscoped command name straight to an
  unscoped package name; it has no way to know `@qyre/qyre`'s bin is also called `qyre`). Both
  packages must stay in lockstep (see `scripts/publish.mjs`'s `PUBLISH_ORDER`); the bare package
  publishes last since it depends on `@qyre/qyre`.
- Internal-only packages set `"private": true` and are excluded from publishing:
  `@qyre/web`, `@qyre/config`, `@qyre/testing`.
- Workspace folder names use short kebab-case nouns: `cli`, `server`, `core`, `ui`, `config`,
  `testing`. Database driver packages live under `drivers/` (see below) rather than at the top level.

## Database drivers

- Driver packages live under `packages/drivers/<engine>` and are named `@qyre/<engine>` - just the
  engine name, no `db-` prefix. The `drivers/` folder already conveys what they are. `postgres` now;
  future `sqlite`, `mysql`, etc.
- The shared engine-agnostic contract lives at `packages/drivers/contract`, package name
  `@qyre/driver-contract`.
- The engine identifier (`DatabaseEngine` in `@qyre/core`, `AdapterFactory.engine`) is lowercase and
  matches the package name.
- See [`docs/CODE_ORGANIZATION.md`](CODE_ORGANIZATION.md) for what may vs. may not be shared in
  `driver-contract` across engines.

## Commands

- Product CLI behavior is invoked as `qyre <target>`.
- Repository maintenance is invoked as `pnpm <script>` (e.g. `pnpm check`).

## Features

- Feature IDs are stable and machine-readable: `F001`, `F002`, ... . [`FEATURES.json`](FEATURES.json)
  is a 24-hour live queue, so old passing entries disappear; its `nextIds` counters prevent reuse.
- Frontend/design-driven work (porting the dashboard UI redesign - see
  `docs/product-specs/dashboard-ui.md`) uses a separate `DF-01`, `DF-02`, ... series so it's
  visually distinct from backend/product feature work at a glance, while following the exact same
  state machine and rules as `F###` entries (see `docs/FEATURES.md`).

## Files and routes

- Files and route segments use descriptive kebab-case (`table-view.tsx`, `/api/tables`).
- Responsibility folders use descriptive kebab-case nouns. Their names follow actual ownership;
  examples in organization docs are not a required taxonomy.
- Tests mirror source domains under `<package>/tests/`. Test files use `*.test.ts` for Vitest and
  `*.spec.ts` for Playwright E2E.

## TypeScript symbols

- Types, interfaces, classes, and React components: `PascalCase`.
- Functions, variables, and instances: `camelCase`.
- Constants that are true compile-time constants: `UPPER_SNAKE_CASE`.
- Avoid abbreviations unless they are domain-standard (e.g. `db`, `sql`, `url`).

## Branches and pull requests

- Never push a completed feature slice directly to `main`. Do the work on a branch named
  `feature/<ID>-<short-kebab-slug>` (e.g. `feature/F001-cli-start-server`) and open a PR.
- PR titles start with the feature ID, e.g. `F001: CLI accepts target and starts server`.
- A feature only moves to `passing` in `docs/FEATURES.json` once its branch's PR is opened
  (merge is a separate, human/CI-gated step); record the PR URL as `evidence`.

## Public API stability

- A package's public API is whatever it exports from `src/index.ts`.
- Public API names must be documented in the package README or a product spec before being treated
  as stable. Breaking changes require a changeset.
