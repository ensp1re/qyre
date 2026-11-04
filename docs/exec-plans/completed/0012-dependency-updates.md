# Stable dependency updates

## Objective

Update all workspace dependencies to their latest stable releases while preserving database,
permission, and UI behavior on supported runtimes, then publish Qyre 0.4.6. Feature: F172.

## Scope

- Restore Playwright and its accessibility dependency, including browser binaries.
- Update pnpm, runtime dependencies, build tools, and test tools.
- Migrate React, Tailwind, TypeScript, Zod, and test configuration where required.
- Require supported Node 22+ releases and align CI, package metadata, and setup documentation.
- Publish all ten public packages as 0.4.6; leave database server versions unchanged.

## Verification

Establish the baseline, then run focused checks for migration failures and `pnpm verify:pr`.
Verify Postgres, MySQL, SQLite, and MongoDB, browser journeys, and standard CLI startup.
Check registry metadata for remaining outdated direct dependencies and review the complete diff.

## Risks and blockers

- Major releases can change validation, styling, type inference, and test behavior.
- SQLite's native binding must match the Node version used for verification.
- The user approved commit, push, PR/merge, and patch publication on 2026-11-04.
- The requested patch includes the already approved Node 20 removal and React 19 peer requirement;
  disclose these compatibility changes in the PR and release notes.

## Progress

- `git pull --ff-only origin main`: already current at `637a094`.
- Restored the removed browser-test configuration with the user's authorization; installed
  latest stable Playwright 1.64.1 and axe Playwright 4.14.0.
- Initial baseline on Node 26 failed because SQLite's native binding was built for Node 22.
- Baseline typecheck/build passed (22 tasks); tests passed for core, driver contract, CLI, SQLite,
  testing helpers, UI, and web (15 tasks including prerequisite builds) on Node 22.23.4. External
  database baseline was unavailable while Docker images downloaded.
- Upgraded 63 registry dependencies across 15 manifests and pinned pnpm 12.16.1.
- SQLite 13 bundled binaries passed an in-memory query on Node 22.23.4 and Node 26.12.1.
- Migrated Tailwind utilities and global style layers, React element props, explicit TypeScript
  source/type roots, and new ESLint checks. TypeScript 7 runs alongside Microsoft's TypeScript 6
  compatibility package for tools that require the compiler API.
- `pnpm verify:pr` passed on Node 22.23.4: 34 package tasks; 11 smoke tests with 4 expected skips;
  32 full browser tests with 55 expected engine/role skips. All four engines verified.
- Forced package tests and prerequisite builds passed on Node 26.12.1: 22 tasks, no cached results.
  The previous Node 26 browser-storage test failure is resolved by the new test stack.
- Standard CLI startup on Node 26.12.1 passed with a disposable SQLite database: authenticated
  health, bundled CSS/JS assets, and clean shutdown. Inspected the rendered dark workspace.
- `pnpm install --frozen-lockfile` and `pnpm peers check` passed.
  `pnpm outdated -r --format json` returned `{}`.
- Implementation was verified locally. The user requested a fresh verification and patch release;
  all ten packages are now versioned 0.4.6. Fresh `pnpm verify:pr` passed on Node 26.12.1
  (34 package tasks, 11 smoke tests, 32 full browser tests; expected skips unchanged).
- All ten archives packed successfully and installed with normal `npm install` in a clean temp
  project. Installed CLI reports 0.4.6; installed drivers passed connection, health, overview,
  and bundled UI checks against all four engines.

## Open decisions

The user approved all stable major releases and dropping Node 20 support. No other scope decisions
are pending.

## Release evidence

- [PR #194](https://github.com/ensp1re/qyre/pull/194) merged at
  `9ae41ac32e9b1650dfc5f4a102e30a919ced9b60`. Both required CI jobs passed in
  [PR CI](https://github.com/ensp1re/qyre/actions/runs/41898676147) and
  [main CI](https://github.com/ensp1re/qyre/actions/runs/41899185193).
- All ten public packages are published as 0.4.6. Each npm `latest` tag resolves to 0.4.6 and each
  tarball is reachable. [GitHub release](https://github.com/ensp1re/qyre/releases/tag/v0.4.6) is live.
- The release workflow failed npm trusted-publisher authentication (OIDC exchange returned 404).
  Local browser-authenticated publication succeeded; package registration remains tracked debt.
- After registry propagation, `npm install qyre@0.4.6` with a fresh cache passed. The installed CLI
  reports 0.4.6; installed drivers passed startup, authenticated health, overview, bundled UI assets,
  and shutdown against Postgres, MySQL, MongoDB, and SQLite.
- README now links the release and documents Node and React upgrade requirements. Its full local
  `pnpm verify:pr` gate passed. Existing bundle-size and Postgres query deprecation warnings remain.
