# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-11.
- Branch: `feature/F096-read-only-session-mode`, pushed. PR #106 has both CI jobs green.
- Queue: F092/F093/F094/F095/F096 are `passing`; F097-F121 and F125-F128 remain `not_started`.
  `nextIds.F` is 129.

## Completed

- All read-only MVP work through F089 is merged and passing; see product specs and Git/PR history.
- Exec plan 0006 (`docs/exec-plans/active/0006-role-aware-database-ide.md`) queued the full
  read-only-to-write-capable-IDE plan as F090-F128 (see plan's own progress log for full history:
  F122 session auth, F090 permissions spec, F091 capability plumbing, F123 batched introspection,
  F124 table/view `kind`, F092 Postgres permissions, F129 unplanned driver-modularization refactor,
  F093 MySQL permissions, F094 SQLite writability, F095 MongoDB permissions - all merged to `main`,
  PRs #94-#105).
- F096 (`--read-only` session mode) pushed and CI green: the CLI gains a `--read-only` flag;
  `ServerContext.readOnly` persists across `POST /api/connect`'s adapter swap by construction (that
  route never touches it); `GET /api/overview`'s capabilities are overridden to every `supports*`
  `false` / `readOnlyReason: "qyre-flag"` after the adapter's own introspection resolves - a hard,
  Qyre-level ceiling that always wins over whatever grants the database reports. New
  `packages/server/src/plugins/read-only-guard.ts` is the single central choke point every future
  mutating route must register under via `config: { mutating: true }` on a shared `preHandler` - a
  no-op today since no write route exists yet. Documented in `docs/SECURITY.md`. PR #106.

## In progress

- Nothing active.

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.
- Vitest resolves workspace packages (`@qyre/core`, `@qyre/driver-contract`, each adapter) through
  their built `dist/`, not source - after changing a package's exported surface, rebuild it
  (`pnpm --filter <pkg> build`) before running a _different_ package's tests against the change, or
  they'll silently exercise the stale build ("X is not a function" is the tell). `tsc --noEmit`
  doesn't have this problem (it honors the root `tsconfig.base.json`'s `paths` straight to `src`).
- Browser preview tooling (both the Browser-pane `preview_*` tools and the Claude-in-Chrome
  extension) was unreachable in this session's environment - UI changes were verified via
  component-level render tests and the live `@full` E2E suite instead of a screenshot. Worth
  retrying at the start of a session doing UI work rather than assuming it's unavailable.
- `.local/preview-server-mysql.mjs` still points at a stale pre-rename port/db
  (`localhost:3307`/`humb_test`, wrong env var names).
- MongoDB's shared docker-compose/CI container has no authorization enabled at all - every
  connection is anonymous and full-access. Testing a genuinely restricted MongoDB user live would
  require enabling auth globally and migrating every existing Mongo test/fixture to credentials
  (see F095's evidence in FEATURES.json / `permissions.ts`'s top comment) - deliberately not done.

## Next steps

- Merge PR #106. F097 (permission-aware UI shell - status-bar read-only badge, the F091
  capabilities hook's gating helpers for later write surfaces, and a Playwright regression guard
  asserting a read-only session renders zero write affordances) is next per the exec plan's
  "Feature order and dependencies" section - the last slice before any write feature (F099+) can
  start.
