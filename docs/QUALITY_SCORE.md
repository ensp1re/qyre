# Quality score

This file records current judgment only. Test counts and feature history belong in executable
checks, the live queue, specs, and Git—not a manually copied table.

Scale: `A` verified/stable, `B` working with bounded debt, `C` material risk, `D` broken.

| Area                   | Grade | Current evidence                               | Main gap                                                   |
| ---------------------- | ----- | ---------------------------------------------- | ---------------------------------------------------------- |
| Core contracts         | A     | Shared types/validation and package tests      | Five tests still live in `src/` instead of `tests/`        |
| Driver contract/parity | A     | Four engines plus conformance suite            | Conformance tests still live in `src/`                     |
| Drivers                | B     | Integration tests for all engines              | SQLite still depends on a native addon (tech-debt row)     |
| Server                 | B     | Route/integration tests and live DB CI         | Keep new routes/services in their domain folders           |
| Web app                | A     | Enforced layers, 22 unit tests, Playwright E2E | Keep app composition below its current size boundary       |
| UI                     | B     | Render/unit tests and accessibility E2E        | Keep new components in the existing responsibility folders |
| Agent harness          | A     | `pnpm check:state`, tracked skills, PR gate    | Monitor context and verification cost                      |

## Current structural pressure

- Driver `index.ts` files and the server `src/index.ts` are small public barrels; UI components are
  grouped into responsibility folders; web is layered into `app/`, `features/`, and `shared/`.
- The remaining placement gap is tests under `src/` in `packages/cli` (3), `packages/core` (5), and
  `packages/testing-conformance` (3); see the [tech-debt tracker](exec-plans/tech-debt-tracker.md).

## Harness metrics to retain

Track only measurements that can drive a decision:

- startup context bytes (`pnpm context` output versus direct document reads);
- repeated file reads/tool retries;
- verification retries;
- missed-rule or wrong-file-placement review findings;
- source and test files over their size budgets.

Do not add narrative benchmark history here. Record durable findings in the relevant plan or check.
