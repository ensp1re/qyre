# AGENTS.md

Qyre is a CLI-launched, local-first, role-aware database management UI. It supports Postgres,
MySQL, SQLite, and MongoDB behind one adapter contract, with writes gated by connected-user grants
and a hard `--read-only` override. This file is the mandatory contract and
router; load deeper documents only when the task requires them.

## Start with compact context

Before changing code:

1. Confirm the root with `pwd`.
2. Run `pnpm context`. It summarizes the branch, worktree, live feature queue, handoff, and active
   verification without loading historical state.
3. Work the one `active` entry, or add/promote one live queue entry. Use `pnpm features <id>` only
   when its full record is needed.
4. Read the linked product spec before implementing specced behavior.
5. Read [`docs/CODE_ORGANIZATION.md`](docs/CODE_ORGANIZATION.md) before creating or moving files;
   read [`ARCHITECTURE.md`](ARCHITECTURE.md) when package or layer boundaries are involved.

Before adding scope, establish a green baseline. Prefer `pnpm check:quiet`; it has the same package
coverage as `pnpm check` with failure-only Turbo output. Both require the live databases described
in [`CONTRIBUTING.md`](CONTRIBUTING.md):

```bash
cp .env.example .env  # once; fill the standard URLs shown in that file
docker compose up -d --wait
```

Root test/check commands load `.env` without overriding already-exported CI or shell values.

## Working contract

- Before starting a non-trivial change, state a short plan and get explicit user approval.
- Work one feature slice at a time. Do not bundle unrelated behavior or cleanup.
- Make surgical changes. Remove only code made obsolete by the current change.
- Do not mark work done from inspection; run the feature verification and record evidence.
- A feature becomes `passing` only after verification passes and its PR/pushed commit is recorded.
- Update the matching spec, plan, or reliability document when behavior changes.
- Turn repeated review feedback into an executable check instead of more prose.
- Use a `feature/<ID>-<slug>` branch and never push completed work directly to `main`.

### Cross-engine parity

Any adapter or driver behavior must be checked across Postgres, MySQL, SQLite, and MongoDB. Prefer a
shared `@qyre/testing-conformance` case. Explicitly state verified and not-applicable engines.

### Structure and types

- Organize source by cohesive responsibility. Domain, resource, capability, and technical-layer
  folders are options, not a prescribed taxonomy; choose boundaries from the code's actual
  ownership and dependencies. Split a flat directory when unrelated concerns or navigation cost
  make it hard to work in, not because an example folder name exists in this file.
- Tests live under each package's `tests/` tree and mirror the chosen source organization. Root E2E
  tests live under `tests/e2e/`.
- Keep single-file types colocated. Put domain-shared types in `<domain>/types.ts` and cross-runtime
  contracts in `@qyre/core`. Use `import type`; never create a global catch-all `types.ts`.
- Package `index.ts` files are public barrels only. Do not define behavior in them.

### Comment style

- Keep comments sparse and near the code. Do not narrate syntax, history, feature IDs, or obvious implementation.
- Inside functions, comment only non-obvious invariants, compatibility or security boundaries, and required workarounds.
- Above methods or APIs, use a short comment only when the signature does not explain the contract. Preserve directives, license/generated markers, and genuine external-constraint comments.

## Commands

- Compact context: `pnpm context [feature-id]`
- Live queue: `pnpm features` / `pnpm features <id>`
- Remove passing entries older than 24 hours: `pnpm features:prune`
- Full verification: `pnpm check`
- Same package coverage, quieter output: `pnpm check:quiet`
- Full local PR gate (starts/checks Docker databases, checks, smoke + full E2E): `pnpm verify:pr`
- CI-equivalent checks plus smoke and full E2E: `pnpm check:ci`
- State and harness: `pnpm check:state`
- Development: `pnpm dev`

## Response contract

- Lead with the result. Use exact, normal sentences.
- Omit praise, request restatement, plan repetition, obvious transitions, command narration, and
  duplicate summaries.
- During tool work, send one short update only at the start, a material finding, a blocker, or a
  changed direction. Do not narrate every read or command.
- Final responses contain only outcome, verification, risk/blocker, and next action. State each
  fact once.
- Brevity never removes security warnings, destructive-action detail, errors, or verification.

## Routed documents

- [`docs/CODE_ORGANIZATION.md`](docs/CODE_ORGANIZATION.md): domain folders, tests, types, size rules
- [`ARCHITECTURE.md`](ARCHITECTURE.md): layers and dependency directions
- [`FRONTEND.md`](FRONTEND.md): UI constraints
- [`docs/NAMING.md`](docs/NAMING.md): files, symbols, branches, feature IDs
- [`docs/FEATURES.md`](docs/FEATURES.md): live queue lifecycle
- [`docs/PLANS.md`](docs/PLANS.md): multi-session execution plans
- [`docs/RELIABILITY.md`](docs/RELIABILITY.md): verification and restart behavior
- [`docs/SECURITY.md`](docs/SECURITY.md): secrets, read-only enforcement, destructive-action rules
- [`docs/SESSION_HANDOFF.md`](docs/SESSION_HANDOFF.md): current-only handoff
- [`.agents/skills/qyre-efficient-engineering/SKILL.md`](.agents/skills/qyre-efficient-engineering/SKILL.md): efficient exploration and placement
- [`.agents/skills/qyre-lean-output/SKILL.md`](.agents/skills/qyre-lean-output/SKILL.md): output discipline

## Done and closeout

A change is done when behavior is implemented, required checks pass, evidence is recorded, affected
docs are current, and the standard startup still works.

### Delivery workflow

1. Run `pnpm verify:pr`. It locates Docker (including Docker Desktop's macOS CLI), runs
   `docker compose up -d --wait`, supplies the standard local test URLs, and runs checks plus smoke
   and full E2E. If Docker is unavailable, repair/start it; do not substitute CI for an available
   local stack.
2. Review the complete diff and update the feature, plan, spec, and handoff as needed.
3. Commit on the feature branch, then push normally. Never use `--no-verify`; the pre-push hook runs
   `pnpm verify:pr` and a failure must be fixed, not bypassed.
4. Open a draft PR with behavior, reasoning, and verification evidence. Wait for both CI jobs and
   fix failures.
5. After CI succeeds, record the PR URL, pushed commit, and `completedAt`, move the feature to
   `passing`, run `pnpm features:prune`, and push that state update normally.

At session end: update the active plan and queue, run `pnpm features:prune`, record deferred work in
the tech-debt tracker, update quality only where it changed, and leave `SESSION_HANDOFF.md` short and
restartable. Passing history belongs in specs and Git/PRs, not startup context.
