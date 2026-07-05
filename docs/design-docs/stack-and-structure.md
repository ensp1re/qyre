# Design Decision: Stack and Structure

Status: Accepted (2026-06-30)

## Context

Qyre must be a local-first DB management UI launched via `npx qyre <target>`, starting with Postgres
and expanding to many engines. It must be legible to AI agents and friendly to open-source PRs.

## Decision

- Monorepo with pnpm workspaces + Turborepo + Changesets.
- Local server: Fastify (typed, fast, good plugin boundaries, simple static serving).
- Frontend: React + Vite + TanStack Router/Query + Tailwind + a shadcn-style `@qyre/ui` kit.
- Postgres driver via `pg` in `packages/drivers/postgres` (`@qyre/postgres`), behind a generic
  `DatabaseAdapter` contract in `packages/drivers/contract` (`@qyre/driver-contract`).
- New engines are additive `packages/drivers/<engine>` packages, named `@qyre/<engine>` (no `db-`
  prefix - the `drivers/` folder already says what they are).
- Within packages, code is organized by concern in folders (types, validation, components), not left
  flat - see `docs/CODE_ORGANIZATION.md`.
- Strict directional layering enforced by docs now and checks over time.

## Rationale

- Driver packages keep engine-specific code isolated so adding databases is additive, not invasive.
- Grouping drivers under one `drivers/` parent scales better once several engines exist, and dropping
  the `db-` prefix removes redundant naming once that grouping does the job.
- A short `AGENTS.md` plus structured `docs/` keeps context legible and avoids one giant manual.
- A machine-readable feature list plus required verification prevents premature "done".

## Consequences

- More packages up front, but clearer boundaries and easier parallel agent work.
- Cross-package types resolve via path mapping for typecheck and via built `dist` at runtime.
- 2026-07-01: renamed `packages/db-adapter` -> `packages/drivers/contract` (`@qyre/driver-contract`)
  and `packages/db-postgres` -> `packages/drivers/postgres` (`@qyre/postgres`), and required a
  `packages/drivers/*` entry in `pnpm-workspace.yaml` (its `packages/*` glob is one level only).

## Alternatives considered

- Single-package app (rejected: would entangle engine-specific code and hurt extensibility).
- Next.js full-stack (rejected: heavier than a CLI-launched local server needs).
