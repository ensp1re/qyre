# Quality score

This file records current judgment only. Test counts and feature history belong in executable
checks, the live queue, specs, and Git—not a manually copied table.

Scale: `A` verified/stable, `B` working with bounded debt, `C` material risk, `D` broken.

| Area                   | Grade | Current evidence                              | Main gap                                                    |
| ---------------------- | ----- | --------------------------------------------- | ----------------------------------------------------------- |
| Core contracts         | A     | Shared types/validation and package tests     | Validation coverage grows with new boundaries               |
| Driver contract/parity | A     | Four engines plus conformance suite           | Keep all adapter changes in conformance where applicable    |
| Drivers                | B     | Integration tests for all engines             | Large engine `index.ts` files need concern-based splits     |
| Server                 | B     | Route/integration tests and live DB CI        | `src/index.ts` and its test are oversized and mix resources |
| Web app                | B     | Playwright smoke/full journeys                | Flat folders obscure cohesive ownership                     |
| UI                     | B     | Render/unit tests and accessibility E2E       | 35-component flat directory needs responsibility grouping   |
| Agent harness          | A     | Compact context, tracked skills, full PR gate | Awaiting F075 PR evidence                                   |

## Current structural pressure

- Web and UI code are moving from crowded flat directories into cohesive areas selected from their
  actual ownership and dependencies; example names are not mandated.
- Server code is moving toward Fastify plugin/resource ownership; the exact folder split follows
  the current handlers.
- Package tests are moving to mirrored `tests/` trees; browser journeys to `tests/e2e/`.
- Driver entrypoints are moving to concern-based modules without weakening cross-engine parity.

Plan 0005 owns the contract. Each behavior-preserving migration gets its own verified slice before
structural checks make that area mandatory.

## Harness metrics to retain

Track only measurements that can drive a decision:

- startup context bytes (`pnpm context` output versus direct document reads);
- repeated file reads/tool retries;
- verification retries;
- missed-rule or wrong-file-placement review findings;
- source and test files over their size budgets.

Do not add narrative benchmark history here. Record durable findings in the relevant plan or check.
