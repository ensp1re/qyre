# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-11-04.
- Branch: `feature/F172-dependency-updates`, based on current `main` at `637a094`.
- Queue: F172 active (verified dependency upgrades); F170 queued (existing release follow-up).
- Active plan: `docs/exec-plans/active/0012-dependency-updates.md`.

## Completed

- F172 implementation: latest stable dependencies and pnpm, restored Playwright, Node 22+ runtime
  requirement, and React/Tailwind/TypeScript migrations.
- `pnpm verify:pr` passed on Node 22.23.4 across all four engines: 34 package tasks, 11 smoke tests,
  and 32 full browser tests. Engine/role-specific skips are unchanged.
- Forced package tests passed on Node 26.12.1, as did CLI startup, SQLite health, bundled assets,
  and shutdown. Frozen install and peer checks passed; no direct dependencies are outdated.

## In progress

- F172: the user authorized publication of 0.4.6; run fresh verification, PR CI, merge, and publish.
- F170 remains queued: confirm all ten published package versions and the GitHub release.

## Known issues / blockers

- npm Trusted Publishing still needs manual registration for `ensp1re/qyre`, workflow `release.yml`,
  for each public package before the release workflow can publish.
- Use Node 22.22.2+, 24.15+, or 26+. CI runs Node 22. Type checks use TypeScript 7; lint/declaration
  tools use Microsoft's TypeScript 6 compatibility API through the `typescript` alias.
- Playwright 1.64.1 and Chromium are installed; launch from the default browser cache was verified.
- Web consumes UI/server/driver `dist/`; rebuild dependencies after changes. CLI also bundles web
  assets at build time. SQLite 13 needs no per-Node-major rebuild on supported platforms.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` on macOS.
- Previously deferred UI scope remains: column resize/reorder/frozen columns, toolbar regrouping,
  drag-to-select multi-cell copy/paste, and JSON syntax highlighting.

## Next steps

- Finish F172 verification and publish 0.4.6; verify registry versions and the GitHub release.
- Resume F170 release follow-up, then the pending UI/UX audit.
