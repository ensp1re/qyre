# Contributing to Qyre

This is the human-facing setup guide. If you're an AI coding agent working in this repo, start with
[`AGENTS.md`](AGENTS.md) instead - it routes into the full working contract (architecture, naming,
feature tracking, definition of done) that this file only summarizes.

## Prerequisites

- Node.js >= 20.11.0
- [pnpm](https://pnpm.io/) (version pinned in `package.json`'s `packageManager` field)
- [Docker](https://www.docker.com/) - only needed if you're testing against real Postgres/MySQL/
  MongoDB databases, not for SQLite-only or UI-only work

## Setup

```bash
pnpm install
pnpm check   # format, lint, typecheck, unit tests, build, project-state checks
```

`pnpm check` runs without any database configured (SQLite and unit tests need nothing external);
the integration/E2E paths below need real databases.

## Running the local test stack

Copy `.env.example` to `.env` and start Postgres/MySQL/MongoDB with the committed
`docker-compose.yml` (matches `.github/workflows/ci.yml`'s service containers exactly, so this
reproduces what CI runs against):

```bash
cp .env.example .env
docker compose up -d
```

Then export the vars from `.env` into your shell (or use a tool like `direnv`) and run:

```bash
pnpm test              # unit + integration tests (Postgres/MySQL/MongoDB tests need the env vars)
pnpm test:e2e           # smoke E2E, no database required
pnpm test:e2e:full      # full E2E journey, needs the Postgres/MySQL env vars
```

Integration tests fail loudly (not skip silently) if their database's env var is unset - see
`docs/RELIABILITY.md`.

## Running the app itself

`qyre <target>` (or `pnpm dev` for the packages in watch mode) takes a database connection
string or a SQLite file path as its argument - it doesn't need any of the `QYRE_TEST_*` env vars
above, those are only for this repo's own test suite.

## Code style and architecture

- [`ARCHITECTURE.md`](ARCHITECTURE.md) - system map, layers, package boundaries.
- [`FRONTEND.md`](FRONTEND.md) - UI constraints and design rules.
- [`docs/NAMING.md`](docs/NAMING.md) - naming rules for packages, files, features.
- [`docs/CODE_ORGANIZATION.md`](docs/CODE_ORGANIZATION.md) - where things live inside a package.

Formatting and linting are enforced by `pnpm check` (Prettier + ESLint) and a pre-commit hook
(Lefthook) - `pnpm check` before opening a PR is the fastest way to catch anything CI would.

## Submitting a change

- Work on a branch, not directly on `main`.
- Keep PRs focused - one feature or fix per PR is easier to review than a bundle of unrelated
  changes.
- Make sure `pnpm check` passes locally; CI runs the same checks plus the full E2E suite
  (`pnpm check:ci`).
- Describe what changed and why in the PR description - the "why" matters more than the "what",
  since the diff already shows the what.

## Reporting issues

Open a GitHub issue. For security-sensitive reports, see [`docs/SECURITY.md`](docs/SECURITY.md).

## License

By contributing, you agree your contributions are licensed under the project's [MIT license](LICENSE).
