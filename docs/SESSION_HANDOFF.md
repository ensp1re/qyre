# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-11-04.
- Queue: F172 passing; F170 queued (historical 0.4.5 release follow-up). No active plan.
- Qyre 0.4.6 is published on npm and GitHub; README includes upgrade requirements.

## Completed

- F172 merged in PR #194. Local verification on Node 22 and 26 and both required CI jobs passed.
- All ten npm latest tags are 0.4.6. Fresh registry installation and startup, health, overview, UI
  assets, and shutdown passed across Postgres, MySQL, MongoDB, and SQLite.
- Durable evidence: `docs/exec-plans/completed/0012-dependency-updates.md`.

## In progress

- No active implementation. F170 remains queued for the historical 0.4.5 release record.

## Known issues / blockers

- npm Trusted Publishing needs registration for `ensp1re/qyre`, workflow `release.yml`, for each
  public package. The 0.4.6 workflow failed authentication; local authenticated publication worked.
- Use Node 22.22.2+, 24.15+ within Node 24, or 26+. CI runs Node 22. Type checks use TypeScript 7;
  lint/declaration tools use Microsoft's TypeScript 6 compatibility API via the `typescript` alias.
- Playwright 1.64.1 and Chromium work from the default browser cache.
- Web consumes UI/server/driver `dist/`; rebuild dependencies after changes. CLI bundles web assets
  at build time. SQLite 13 needs no per-Node-major rebuild on supported platforms.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` on macOS.
- Previously deferred UI scope remains: column resize/reorder/frozen columns, toolbar regrouping,
  drag-to-select multi-cell copy/paste, and JSON syntax highlighting.

## Next steps

- Register npm trusted publishers before the next automated release.
- Resume F170 release-record follow-up, then the pending UI/UX audit.
