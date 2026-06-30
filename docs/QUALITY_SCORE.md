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

| Package             | Grade | Verification | Agent legibility | Test stability | Key gaps                 | Last updated |
| ------------------- | ----- | ------------ | ---------------- | -------------- | ------------------------ | ------------ |
| `@humb/core`        | -     | none yet     | -                | -              | only placeholder types   | 2026-06-30   |
| `@humb/db-adapter`  | -     | none yet     | -                | -              | contract not implemented | 2026-06-30   |
| `@humb/db-postgres` | -     | none yet     | -                | -              | not implemented          | 2026-06-30   |
| `@humb/server`      | -     | none yet     | -                | -              | not implemented          | 2026-06-30   |
| `humb` (cli)        | -     | none yet     | -                | -              | not implemented          | 2026-06-30   |
| `@humb/ui`          | -     | none yet     | -                | -              | not implemented          | 2026-06-30   |
| `@humb/web`         | -     | smoke only   | -                | -              | not implemented          | 2026-06-30   |

## Architectural layers

| Layer      | Grade | Boundary enforcement | Agent legibility | Key gaps        | Last updated |
| ---------- | ----- | -------------------- | ---------------- | --------------- | ------------ |
| Core types | -     | docs only            | -                | placeholder     | 2026-06-30   |
| Adapters   | -     | docs only            | -                | not implemented | 2026-06-30   |
| Server     | -     | docs only            | -                | not implemented | 2026-06-30   |
| CLI        | -     | docs only            | -                | not implemented | 2026-06-30   |
| UI         | -     | docs only            | -                | not implemented | 2026-06-30   |

## Benchmark snapshots

| Date       | Variant  | Completion rate | Retries | Defects before review | Notes                                    |
| ---------- | -------- | --------------- | ------- | --------------------- | ---------------------------------------- |
| 2026-06-30 | skeleton | n/a             | n/a     | n/a                   | structure + checks only, no product code |

## Simplification log

| Date | Component removed | Outcome | Decision |
| ---- | ----------------- | ------- | -------- |
| -    | -                 | -       | -        |
