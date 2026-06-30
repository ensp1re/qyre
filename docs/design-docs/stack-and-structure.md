# Design Decision: Stack and Structure

Status: Accepted (2026-06-30)

## Context

Humb must be a local-first DB management UI launched via `npx humb <target>`, starting with Postgres
and expanding to many engines. It must be legible to AI agents and friendly to open-source PRs.

## Decision

- Monorepo with pnpm workspaces + Turborepo + Changesets.
- Local server: Fastify (typed, fast, good plugin boundaries, simple static serving).
- Frontend: React + Vite + TanStack Router/Query + Tailwind + a shadcn-style `@humb/ui` kit.
- Postgres adapter via `pg` in `packages/db-postgres`, behind a generic `DatabaseAdapter` contract
  in `packages/db-adapter`.
- New engines are additive `db-<engine>` packages.
- Strict directional layering enforced by docs now and checks over time.

## Rationale

- Adapter packages keep engine-specific code isolated so adding databases is additive, not invasive.
- A short `AGENTS.md` plus structured `docs/` keeps context legible and avoids one giant manual.
- A machine-readable feature list plus required verification prevents premature "done".

## Consequences

- More packages up front, but clearer boundaries and easier parallel agent work.
- Cross-package types resolve via path mapping for typecheck and via built `dist` at runtime.

## Alternatives considered

- Single-package app (rejected: would entangle engine-specific code and hurt extensibility).
- Next.js full-stack (rejected for MVP: heavier than a CLI-launched local server needs).
