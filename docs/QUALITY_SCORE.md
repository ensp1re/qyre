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

| Package                 | Grade | Verification                                             | Agent legibility             | Test stability                                   | Key gaps                                                                                                                                                                                                                                                 | Last updated |
| ----------------------- | ----- | -------------------------------------------------------- | ---------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `@humb/core`            | B     | `pnpm --filter @humb/core test` (14/14)                  | good, folder-organized       | stable                                           | `validation/` only covers query+rows so far                                                                                                                                                                                                              | 2026-07-01   |
| `@humb/driver-contract` | B     | `pnpm --filter @humb/driver-contract test` (7/7)         | good                         | stable                                           | only one consumer engine so far                                                                                                                                                                                                                          | 2026-07-01   |
| `@humb/postgres`        | B     | `pnpm --filter @humb/postgres test` (24/24)              | good                         | stable, integration + security-regression tested | audit found a real exploitable bug (writable CTE bypassed read-only check) and fixed it with a Postgres `READ ONLY` transaction backstop, not just the string check - see F006's audit. Heuristic string check remains defense-in-depth, not exhaustive. | 2026-07-01   |
| `@humb/server`          | B     | `pnpm --filter @humb/server test` (8/8)                  | good                         | stable                                           | F007 not yet audited against full spec                                                                                                                                                                                                                   | 2026-07-01   |
| `humb` (cli)            | B     | `pnpm --filter humb test` (7/7)                          | good                         | stable                                           | web-dist path is monorepo-relative (tech debt)                                                                                                                                                                                                           | 2026-07-01   |
| `@humb/ui`              | B     | builds/typechecks; no dedicated tests yet                | good, one component per file | none yet                                         | zero component-level test coverage (only exercised via e2e smoke/full journeys); 6 components now (status-badge, panel, schema-tree, table-detail, rows-table, query-runner)                                                                             | 2026-07-01   |
| `@humb/web`             | B     | smoke + full E2E (`pnpm test:e2e`, `pnpm test:e2e:full`) | good, api/hooks split        | stable                                           | F001-F006 all have UI now (connection, nav tree, table metadata, rows, query runner); no component-level tests, only E2E                                                                                                                                 | 2026-07-01   |

## Architectural layers

| Layer      | Grade | Boundary enforcement                              | Agent legibility | Key gaps                                      | Last updated |
| ---------- | ----- | ------------------------------------------------- | ---------------- | --------------------------------------------- | ------------ |
| Core types | B     | docs + folder convention (`CODE_ORGANIZATION.md`) | good             | none major                                    | 2026-07-01   |
| Drivers    | B     | docs + `packages/drivers/` grouping               | good             | only one engine to validate the split against | 2026-07-01   |
| Server     | B     | docs + `STRUCTURE.md` growth path                 | good             | F007 unaudited                                | 2026-07-01   |
| CLI        | B     | docs only                                         | good             | web-dist path packaging (tech debt)           | 2026-07-01   |
| UI         | B     | docs + folder convention + `STRUCTURE.md`         | good             | no component tests                            | 2026-07-01   |

## Benchmark snapshots

| Date       | Variant                                   | Completion rate | Retries | Defects before review | Notes                                                                                                                                                                                                                                                          |
| ---------- | ----------------------------------------- | --------------- | ------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-06-30 | skeleton                                  | n/a             | n/a     | n/a                   | structure + checks only, no product code                                                                                                                                                                                                                       |
| 2026-07-01 | F001/F003 audit + architecture reorg      | n/a             | n/a     | 4                     | audits of "passing" package tests found real gaps each time (`HUMB_PORT` ignored, no static serving, indexes/rowCount unimplemented, `pg` array-type bug); architecture reorganized into types/components/drivers folders                                      |
| 2026-07-01 | F002/F004/F005 (connect-and-inspect done) | n/a             | n/a     | 1                     | E2E infra itself was broken (Playwright's `webServer` had no backend at all - `vite preview` alone), so the golden journey could never have passed regardless of frontend completeness; fixed with a real server (`e2e/server.ts`), then finished the UI       |
| 2026-07-01 | F006 audit (query runner)                 | n/a             | n/a     | 2                     | one **critical, exploitable** defect: writable CTEs bypassed the read-only check and executed real deletes, confirmed against a live table before fixing; fixed with a Postgres `READ ONLY` transaction as the authoritative backstop, not just a better regex |

## Simplification log

| Date | Component removed | Outcome | Decision |
| ---- | ----------------- | ------- | -------- |
| -    | -                 | -       | -        |
