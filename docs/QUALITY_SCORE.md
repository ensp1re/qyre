# QUALITY_SCORE.md

Tracks whether the repository is getting stronger or weaker over time. Update as part of normal
work, not as a separate cleanup day.

## Grading scale

- `A`: verified, legible, stable, boundaries enforced
- `B`: working with minor gaps
- `C`: partially working, notable confusion or instability
- `D`: broken, unsafe, or structurally unclear
- `-`: not started

## Packages

| Package                 | Grade | Verification                                             | Agent legibility             | Test stability             | Key gaps                                                                                         | Last updated |
| ----------------------- | ----- | -------------------------------------------------------- | ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------ | ------------ |
| `@humb/core`            | B     | `pnpm --filter @humb/core test` (14/14)                  | good, folder-organized       | stable                     | `validation/` only covers query+rows so far                                                      | 2026-07-01   |
| `@humb/driver-contract` | B     | `pnpm --filter @humb/driver-contract test` (7/7)         | good                         | stable                     | only one consumer engine so far                                                                  | 2026-07-01   |
| `@humb/postgres`        | B     | `pnpm --filter @humb/postgres test` (16/16)              | good                         | stable, integration-tested | two real bugs found via audit (indexes/rowCount were unimplemented, `pg` array-type parsing bug) | 2026-07-01   |
| `@humb/server`          | B     | `pnpm --filter @humb/server test` (7/7)                  | good                         | stable                     | F006/F007 not yet audited against full spec                                                      | 2026-07-01   |
| `humb` (cli)            | B     | `pnpm --filter humb test` (7/7)                          | good                         | stable                     | web-dist path is monorepo-relative (tech debt)                                                   | 2026-07-01   |
| `@humb/ui`              | B     | builds/typechecks; no dedicated tests yet                | good, one component per file | none yet                   | zero component-level test coverage (only exercised via e2e smoke)                                | 2026-07-01   |
| `@humb/web`             | B     | smoke + full E2E (`pnpm test:e2e`, `pnpm test:e2e:full`) | good, api/hooks split        | stable                     | F005 (paginated rows) not built yet; nav tree + table metadata done                              | 2026-07-01   |

## Architectural layers

| Layer      | Grade | Boundary enforcement                              | Agent legibility | Key gaps                                      | Last updated |
| ---------- | ----- | ------------------------------------------------- | ---------------- | --------------------------------------------- | ------------ |
| Core types | B     | docs + folder convention (`CODE_ORGANIZATION.md`) | good             | none major                                    | 2026-07-01   |
| Drivers    | B     | docs + `packages/drivers/` grouping               | good             | only one engine to validate the split against | 2026-07-01   |
| Server     | B     | docs only                                         | good             | F006/F007 unaudited                           | 2026-07-01   |
| CLI        | B     | docs only                                         | good             | web-dist path packaging (tech debt)           | 2026-07-01   |
| UI         | B     | docs + folder convention                          | good             | no component tests                            | 2026-07-01   |

## Benchmark snapshots

| Date       | Variant                              | Completion rate | Retries | Defects before review | Notes                                                                                                                                                                                                                   |
| ---------- | ------------------------------------ | --------------- | ------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-30 | skeleton                             | n/a             | n/a     | n/a                   | structure + checks only, no product code                                                                                                                                                                                |
| 2026-07-01 | F001/F003 audit + architecture reorg | n/a             | n/a     | 4                     | audits of "passing" package tests found real gaps each time (HUMB_PORT ignored, no static serving, indexes/rowCount unimplemented, `pg` array-type bug); architecture reorganized into types/components/drivers folders |

## Simplification log

| Date | Component removed | Outcome | Decision |
| ---- | ----------------- | ------- | -------- |
| -    | -                 | -       | -        |
