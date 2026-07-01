# AGENTS.md

Humb is optimized for long-running coding-agent work. Keep this file short. It is a router into the
system-of-record docs, not an instruction dump.

## What Humb is

A CLI-launched, local-first database management UI. `npx humb <database-url>` detects what kind of
database it's pointed at, starts a local server, and opens a browser so a developer can inspect and
manage it — one command, no manual driver selection, no heavy IDE install. Read-only for now.
Postgres is the first fully supported engine; see
[`docs/product-specs/connect-and-inspect-postgres.md`](docs/product-specs/connect-and-inspect-postgres.md).
Every other engine is added the same way (new `db-<engine>` adapter package, see `ARCHITECTURE.md`),
never by hard-coding Postgres assumptions into the server, CLI, or UI.

## Startup workflow

Before changing code:

1. Confirm the repo root with `pwd`.
2. Read [`ARCHITECTURE.md`](ARCHITECTURE.md) for the system map, layers, and dependency rules.
3. Read [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) to see where the last session stopped.
4. Read [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) to see which areas are weakest.
5. Read [`docs/FEATURES.json`](docs/FEATURES.json) and pick the one `active` feature, or promote a
   `not_started` one.
6. Read the relevant spec in [`docs/product-specs/`](docs/product-specs/).
7. Run the standard verification path below to confirm a clean baseline before adding scope.
8. If the baseline is failing, repair it before adding new work.

## Standard commands

- Install: `pnpm install`
- Full verification: `pnpm check` (format, lint, typecheck, test, build, project-state checks)
- CI-equivalent (adds E2E): `pnpm check:ci`
- Dev: `pnpm dev`
- Feature/handoff state checks: `pnpm check:state`

## Routing map

- [`ARCHITECTURE.md`](ARCHITECTURE.md): domains, layers, package boundaries, dependency rules
- [`FRONTEND.md`](FRONTEND.md): UI constraints and design rules
- [`docs/NAMING.md`](docs/NAMING.md): naming rules for packages, files, commands, features, adapters
- [`docs/PLANS.md`](docs/PLANS.md): execution-plan lifecycle
- [`docs/FEATURES.json`](docs/FEATURES.json): machine-readable feature state (single source of truth for scope)
- [`docs/PRODUCT_SENSE.md`](docs/PRODUCT_SENSE.md): durable product judgment
- [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md): domain and package health
- [`docs/RELIABILITY.md`](docs/RELIABILITY.md): bootstrap, verification, golden journeys, health signals
- [`docs/SECURITY.md`](docs/SECURITY.md): database safety, secrets, destructive-action rules
- [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md): current state and next action
- [`docs/design-docs/index.md`](docs/design-docs/index.md): design decisions and core beliefs
- [`CLAUDE.md`](CLAUDE.md): Claude Code auto-loaded pointer into this file plus the four core rules
- [`.claude/skills/humb-lean-output/SKILL.md`](.claude/skills/humb-lean-output/SKILL.md): response/reporting style

## Working contract

- Work from one feature slice at a time (see `docs/FEATURES.json`).
- Do not mark work done from code inspection alone; runnable evidence is required.
- A feature only becomes `passing` when its verification command actually passes.
- If you change behavior, update the matching spec, plan, or reliability doc in the same session.
- If you hit repeated review feedback, promote it into a lint rule or check instead of re-explaining.
- Never push a completed feature directly to `main`. Work on a `feature/<ID>-<slug>` branch and
  open a PR (see [`docs/NAMING.md`](docs/NAMING.md)); record the PR URL as evidence.
- Keep generated artifacts in [`docs/generated/`](docs/generated/) and references in [`docs/references/`](docs/references/).
- Respect [`docs/NAMING.md`](docs/NAMING.md) and the layer rules in `ARCHITECTURE.md`.

## Definition of done

A change is done only when all of these are true:

- target behavior is implemented;
- required verification actually ran (`pnpm check`, plus E2E for cross-component changes);
- evidence is linked from the feature entry or the active plan (command output, commit SHA, E2E artifact);
- affected docs remain current;
- the repository builds and restarts cleanly from the standard startup path.

## End of session

1. Update the active execution plan and `docs/FEATURES.json` states.
2. Update [`docs/QUALITY_SCORE.md`](docs/QUALITY_SCORE.md) if any area meaningfully changed.
3. Record deferred work in [`docs/exec-plans/tech-debt-tracker.md`](docs/exec-plans/tech-debt-tracker.md).
4. Move finished plans to [`docs/exec-plans/completed/`](docs/exec-plans/completed/).
5. Update [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md) and leave a clean, restartable state.
