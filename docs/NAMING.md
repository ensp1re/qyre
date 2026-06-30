# NAMING.md

Naming rules so agent-generated code stays consistent and the repository reads like an
intentional open-source project. These rules are enforced by review and, where possible, by lint.

## Packages

- Public packages are published under the `@humb/` scope: `@humb/core`, `@humb/server`,
  `@humb/db-adapter`, `@humb/db-postgres`, `@humb/ui`.
- The CLI package is published as the bare name `humb` (this is the user-facing binary).
- Internal-only packages set `"private": true` and are excluded from publishing:
  `@humb/web`, `@humb/config`, `@humb/testing`.
- Workspace folder names use short kebab-case nouns: `cli`, `server`, `core`, `db-adapter`,
  `db-postgres`, `ui`, `config`, `testing`.

## Database adapters

- Adapter packages are named `db-<engine>`: `db-postgres` now; future `db-sqlite`, `db-mysql`, etc.
- The engine identifier is lowercase and matches the package suffix.

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

## Public API stability

- A package's public API is whatever it exports from `src/index.ts`.
- Public API names must be documented in the package README or a product spec before being treated
  as stable. Breaking changes require a changeset.
