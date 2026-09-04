# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-09-04.
- Branch: `main`. v0.4.3 published; F155/F156/F157 merged and unreleased.
- Queue: F149/F154 passing; F150-F153 queued `not_started` for plan 0008, the approved opt-in AI
  assistant tab (`docs/exec-plans/active/0008-ai-database-assistant.md`). Plan 0007 is retired;
  plan 0009 (security audit) is completed. A fresh UI audit is still pending separately.

## Completed

- PR #171 (`7d84752`), unrecorded at the time: open-source readiness - corrected stale README
  facts, a public root `SECURITY.md` alongside the internal `docs/SECURITY.md`, `CODE_OF_CONDUCT.md`,
  issue/PR templates, and regenerated screenshots.
- F154 (plan 0009, this release): security audit fixes - `SELECT ... INTO OUTFILE/DUMPFILE` now
  classifies as a write, `capResultRows` strips comments before keyword detection (the two composed
  into a `--read-only` bypass writing files on a MySQL server, confirmed live), the global error
  handler redacts both `request.url` (which carries the live session token on export downloads) and
  the error message, the write path no longer wraps writable CTEs into a syntax error, MySQL retries
  uncapped on ER_DUP_FIELDNAME so ordinary joins with repeated column names work, and both CSV
  serializers quote a bare `\r` and prefix formulas hidden behind leading whitespace.

## In progress

- None.

## Known issues / blockers

### Outstanding after F157

F157 closed every item in `docs/PLAN.md` except one, and each heading there carries its outcome.

- **Native SQLite runtime independence (P1, partially fixed).** The `better-sqlite3` `^11 -> ^13`
  bump plus `optionalDependencies` and a lazy import mean a failed native build no longer aborts
  `npm i qyre` or blocks the other three engines, and Node 26 now installs a prebuild in ~7s. The
  plan's actual requirement - independence from the user's Node ABI, via WASM or a bundled runtime -
  is unstarted, needs the direction decided first, and carries its own install matrix and
  conformance burden.
- **npm Trusted Publishing needs one manual registration** before `release.yml` can publish: add
  org/repo `ensp1re/qyre`, workflow `release.yml` as the Trusted Publisher for each package on
  npmjs.com. Until then the publish step fails closed rather than falling back to a token.

- Repository verification must use Node 22 (Homebrew `node@22` at `/opt/homebrew/opt/node@22/bin`);
  newer Node cannot load the current `better-sqlite3` native binding.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`;
  the e2e preview servers also load `@qyre/server`/driver `dist/`, so rebuild those packages too
  after server/driver changes. The CLI (`@qyre/qyre`) additionally bundles a copy of
  `apps/web/dist` into its own `dist/web` at build time (F010).
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.
- Deferred by explicit scoping decision, not oversight: full column resize/reorder/frozen columns,
  a complete toolbar regroup into 4 sections with an overflow menu, full drag-to-select multi-cell
  copy/paste, and JSON syntax highlighting. Revisit only if explicitly requested.

## Next steps

- Activate F150 (plan 0008 slice 1): assistant tab gating, Settings AI category with exclusive
  provider config, and the SECURITY.md/README opt-in carve-out. Note plan 0008 predates PR #171
  splitting security docs into the public root `SECURITY.md` and the internal `docs/SECURITY.md`;
  its carve-out now spans both files.
- Work the deferred F154 audit items above, publish provenance first.
- Separately, run a fresh UI/UX browser audit and turn its findings into a new exec plan.
