# NAMING.md

Naming rules so agent-generated code stays consistent and the repository reads like an
intentional open-source project. These rules are enforced by review and, where possible, by lint.

## Packages

- Public packages are published under the `@humb/` scope: `@humb/core`, `@humb/server`,
  `@humb/driver-contract`, `@humb/postgres`, `@humb/ui`.
- The CLI package is published as the bare name `humb` (this is the user-facing binary).
- Internal-only packages set `"private": true` and are excluded from publishing:
  `@humb/web`, `@humb/config`, `@humb/testing`.
- Workspace folder names use short kebab-case nouns: `cli`, `server`, `core`, `ui`, `config`,
  `testing`. Database driver packages live under `drivers/` (see below) rather than at the top level.

## Database drivers

- Driver packages live under `packages/drivers/<engine>` and are named `@humb/<engine>` - just the
  engine name, no `db-` prefix. The `drivers/` folder already conveys what they are. `postgres` now;
  future `sqlite`, `mysql`, etc.
- The shared engine-agnostic contract lives at `packages/drivers/contract`, package name
  `@humb/driver-contract`.
- The engine identifier (`DatabaseEngine` in `@humb/core`, `AdapterFactory.engine`) is lowercase and
  matches the package name.
- See [`docs/CODE_ORGANIZATION.md`](CODE_ORGANIZATION.md) for what may vs. may not be shared in
  `driver-contract` across engines.

## Commands

- Product CLI behavior is invoked as `humb <target>`.
- Repository maintenance is invoked as `pnpm <script>` (e.g. `pnpm check`).

## Features

- Feature IDs are stable and machine-readable: `F001`, `F002`, ... defined in
  [`FEATURES.json`](FEATURES.json). IDs are never reused or renumbered.

## Files and routes

- Files and route segments use descriptive kebab-case (`table-view.tsx`, `/api/tables`).
- Test files use `*.test.ts` (unit/integration) and `*.spec.ts` (Playwright E2E).

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
