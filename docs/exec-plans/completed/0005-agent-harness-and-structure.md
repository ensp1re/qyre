# Plan 0005: Agent Harness and Scalable Structure

Status: Completed.
Owner: current session.
Linked feature: F075.

## Objective

Reduce agent context cost and missed instructions while replacing obsolete flat-folder guidance
with cohesion-based organization for production code, mirrored `tests/` trees, and an enforced
local-to-PR delivery gate.

## Scope

- Add compact `pnpm context` output and a harness integrity check.
- Turn `FEATURES.json` into a live work queue: passing entries receive `completedAt` and are removed
  after 24 hours by `pnpm features:prune`; `nextIds` prevents ID reuse.
- Track the Codex skills under `.agents/`, add an efficient-engineering skill, and tighten the
  existing lean-output and design-system skills.
- Remove the unused `.cursor/` harness.
- Replace stale flat-folder guidance with responsibility-based decisions derived from actual
  ownership and dependencies; folder examples are illustrative, while tests mirror the selected
  organization under each package's `tests/` directory.
- Add `pnpm verify:pr`: locate/start the local Docker test stack, supply standard database URLs, run
  checks plus smoke/full E2E, and make the same gate mandatory in pre-push without `--no-verify`.
- Compress the startup and handoff documents and validate their size/link budgets.

The later behavior-preserving movement is intentionally separate work. F075 defines the target and
guardrails without mixing a repository-wide import rewrite into the harness change:

- F076: cohesive web responsibilities plus mirrored `apps/web/tests/`.
- F077: cohesive UI component families plus mirrored `packages/ui/tests/`.
- F078: Fastify-aligned server responsibilities plus mirrored `packages/server/tests/`.
- F079: driver concern modules plus each driver's mirrored unit/integration tests.
- F080: root browser journeys and support code under `tests/e2e/`.

## Verification path

- `pnpm features:prune`
- `pnpm context`
- `pnpm check:harness`
- `pnpm verify:pr`
- skill-creator `quick_validate.py` for every tracked skill
- `pnpm check:state`
- `pnpm format:check && pnpm lint && pnpm typecheck`

No product runtime behavior changed, but the new delivery contract requires the live database and
Playwright gates for this slice and all later PRs.

## Risks and blockers

- Time-based pruning must not make CI fail merely because time elapsed; pruning is an explicit
  closeout command, while validation checks shape and active-state invariants only.
- Deleting passing queue entries must not permit ID reuse; `nextIds` is retained independently.
- Blanket type extraction would create more files and navigation. Only domain-shared and
  cross-boundary types move; single-file implementation types remain colocated.
- Dedicated test directories can obscure ownership if flat. Their tree must mirror the chosen
  source organization and separate test levels only when the distinction exists.

## Research decisions

- Fastify's official plugin and encapsulation model supports one resource-oriented route plugin per
  module, registered by the application builder.
- Vitest officially supports both colocated and dedicated test directories; Qyre chooses dedicated,
  mirrored trees for predictable production/test separation.
- TypeScript's explicit `import type`/`export type` syntax is retained and mechanically enforced.
- React/Vite prescribe no universal application folder hierarchy, so Qyre derives boundaries from
  actual cohesion rather than a copied taxonomy.

## Progress log

- 2026-07-08: User approved the harness work, clarified domain folders rather than a `features/`
  folder, requested managed test folders, and requested official external research. Research
  completed; F075 and this plan activated.
- 2026-07-08: Implemented the compact context command, explicit 24-hour pruning, harness checks,
  tracked skill metadata, new efficient-engineering skill, improvements to the existing skills,
  concise state docs, and domain/mirrored-test rules. Pruned 75 expired passing records; retained
  eight entries completed within 24 hours plus F075 and F076-F080. `pnpm check:state`, format, lint,
  and typecheck pass; all three skills pass `quick_validate.py`. Awaiting pushed commit/PR evidence
  before F075 can move to passing.
- 2026-07-08: User corrected overly prescriptive folder examples and required a complete delivery
  loop. Reworked organization rules around cohesion, made examples non-normative, added a
  Docker-aware full local PR gate, removed the release script's `--no-verify`, and extended CI to
  run full E2E. Publishing is blocked until `gh auth login -h github.com` restores authentication.
- 2026-07-08: `pnpm verify:pr` initially stopped on the known SQLite `unsupported file format`
  failure. Inspection proved the ignored generated fixture contained corrupt replacement bytes;
  strengthened `ensureSqliteFile` with `quick_check` plus generated-file-only recreation and added a
  regression test. The complete gate then passed: 34 package tasks, 3 smoke E2E, and 10 full E2E
  tests with 2 intentional engine-not-applicable skips.
- 2026-07-08: Closed the MongoDB E2E parity gap. Added a fourth Playwright project and CI service;
  connect-and-inspect now proves collection browsing, nested document inspection, and disabled SQL
  Editor behavior. Final local gate: 34 package tasks, 4 smoke E2E, 11 full E2E passed, 5 explicit
  engine-inapplicable skips.
- 2026-07-08: Published draft PR #76. Fixed duplicate CI service keys and stabilized autocomplete
  selection under Linux. GitHub Actions run 28956172263 passed both jobs; F075 moved to `passing`.

## Open decisions

None.
