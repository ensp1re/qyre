# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-09-26.
- Branch: `claude/ecstatic-hypatia-w6v1yw`, PR #186 open with plan 0010 (code audit fixes) done
  and CI green. v0.4.4 is the latest published release.
- Queue: F160-F169 passing (plan 0010). No active or queued work.
- No active exec plan. Plan 0008 (AI assistant) was retired unstarted; plan 0011 (F157 security
  audit) is completed. A fresh UI audit is still pending.

## Completed

- Plan 0010 (F160-F169), see `docs/exec-plans/completed/0010-bug-audit-fixes.md`.

## In progress

- None.

## Known issues / blockers

- **npm Trusted Publishing needs one manual registration** before `release.yml` can publish: add
  org/repo `ensp1re/qyre`, workflow `release.yml` as the Trusted Publisher for each package on
  npmjs.com. Until then the publish step fails closed rather than falling back to a token.
- SQLite still depends on the native `better-sqlite3` `^12` addon (prebuilds for Node 20-26; v13
  not adopted because it drops Node 20). Runtime independence is in the tech-debt tracker.
- UI Preview and E2E must rebuild `@qyre/ui` before `@qyre/web` because web consumes UI `dist/`;
  the e2e preview servers also load `@qyre/server`/driver `dist/`, so rebuild those packages too
  after server/driver changes. The CLI (`@qyre/qyre`) additionally bundles a copy of
  `apps/web/dist` into its own `dist/web` at build time.
- Docker may require `/Applications/Docker.app/Contents/Resources/bin/docker` explicitly on macOS.
- Deferred by explicit scoping decision, not oversight: full column resize/reorder/frozen columns,
  a complete toolbar regroup into 4 sections with an overflow menu, full drag-to-select multi-cell
  copy/paste, and JSON syntax highlighting. Revisit only if explicitly requested.

## Next steps

- Merge PR #186 and publish a release (it fixes a `--read-only` bypass).
- Run a fresh UI/UX browser audit and turn its findings into a new exec plan.
