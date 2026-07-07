# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

**Keep this file short.** It orients a fresh agent in minutes, not archives history - a new session
doesn't need a play-by-play of what shipped weeks ago, only what's still load-bearing right now.
`docs/FEATURES.json`'s `evidence` field is already the durable, detailed record of what shipped and
why (plus the PR itself); this file doesn't need to duplicate that. Whenever the "Completed" section
gets long (a screenful or more), compress older entries down to one line each - id, one-clause
summary, PR link - in the same pass, not as a separate cleanup task later. Keep full detail only for
work that's still in flight (unmerged PRs, open questions) or genuinely still relevant (environmental
gotchas in "Known issues / blockers").

## Current state

- Date: 2026-07-07
- Latest commit on `main`: see `git log --oneline -1 origin/main` (as of this update: `bb784f9`,
  release-branch/PR workflow in `scripts/publish.mjs`). `qyre`/`@qyre/qyre` have been released as
  v0.1.0 and v0.2.0 on npm.
- Build status: builds (`pnpm build`)
- Test status: unit + integration tests pass (`pnpm test`, with `QYRE_TEST_DATABASE_URL`/
  `QYRE_TEST_MYSQL_URL`/`QYRE_TEST_MONGO_URL` set, e.g. via `docker compose up -d`); smoke +
  full E2E pass (`pnpm test:e2e`, `pnpm test:e2e:full`)
- Verification status: `pnpm check:ci` passes with a live Postgres+MySQL+Mongo stack available

## Completed

- Repository skeleton, product contract, verification tooling (PR #5, #8).
- **F001-F011, DF-01-DF-09 `passing`**: connect-and-inspect journey, SQLite (2nd engine), dashboard
  UI redesign, README rewrite, npm-publish path fix. PRs #3-#35.
- **F012-F019 `passing`**: SQL editor UX (history, CodeMirror, autocomplete), structured jsonb
  cells, unified error handling, MySQL (3rd engine), MongoDB (4th engine), cross-engine type
  fidelity.
- **F020-F033 `passing`**: two-pass project review fixes - Postgres quoted-identifier coercion,
  read-only `;`-in-string false-positive, rows-route 400s, Files-tab symlink escape,
  connection-string redaction, DNS-rebinding Host check, Mongo pagination stability, Schema-tab
  batched fetch, pool-error logging, health/schema polling, `ErrorBoundary`, schema-tree keyboard
  a11y, per-engine statement timeouts (PRs #47-#52).
- **F034-F062 `passing`** (4 batches draining the two-pass review's remaining 29 tech-debt rows):
  batch 1 UX/a11y ([PR #54](https://github.com/ensp1re/qyre/pull/54)), batch 2 reliability/server
  hardening ([PR #55](https://github.com/ensp1re/qyre/pull/55)), batch 3 performance/architecture
  ([PR #56](https://github.com/ensp1re/qyre/pull/56)), batch 4 testing/docs/devx/product
  ([PR #57](https://github.com/ensp1re/qyre/pull/57) - new `@qyre/testing-conformance` package,
  `@qyre/ui` component tests, E2E `axe` scans, `docker-compose.yml`, `CONTRIBUTING.md`,
  `docs/CONNECTING.md`, clickable FK columns, Files-tab "Run in editor"). See `docs/FEATURES.json`
  for evidence per feature.
- [PR #58](https://github.com/ensp1re/qyre/pull/58) (merged, docs-only): product-spec pass on the
  3 remaining tech-debt rows that didn't need `--demo` mode's kind of scoping -
  `docs/product-specs/adapter-capabilities.md` (F063), `database-switching.md` (F064),
  `server-side-sort-export.md` (F065/F066).
- **F063 `passing`** ([PR #59](https://github.com/ensp1re/qyre/pull/59)/[#60](https://github.com/ensp1re/qyre/pull/60)):
  `DatabaseOverview.capabilities.supportsSql` replaces `apps/web`'s `engine === "mongodb"` checks
  for disabling the SQL Editor tab/Files-tab "Run in editor".
- **F064 `passing`** ([PR #61](https://github.com/ensp1re/qyre/pull/61)): `POST /api/connect`
  swaps in a new adapter/target (only after a ping confirms it's live) without restarting the
  process; the title bar's Settings button opens a `ConnectDrawer` (current target, connect form,
  recent targets). Live-caught bug fixed in the same commit: an unreachable-host failure throws
  Node's `AggregateError` with an empty top-level `.message` - a new `describeError()` helper
  fixes this for both the new endpoint and the pre-existing `/api/health` ping-failure path, which
  had the same latent bug. Verified live by switching a running Preview instance between a real
  Postgres and a real MySQL container and back.
- **F065/F066 `passing`**: `GET .../rows` gains `sortColumn`/`sortDirection` (validated against the
  table's real columns server-side - the actual injection surface, since a column name can't be
  parameter-bound the way `page`/`pageSize` already are); each adapter's `getRows` translates it to
  `ORDER BY`/`.sort()`. `RowsTable` is now a controlled component for sort (no longer reorders rows
  itself). A new streamed `GET .../export.csv` replaces the old page-only CSV export, fetching in
  bounded `MAX_PAGE_SIZE` batches rather than materializing the whole table in memory. Verified
  live against a real 10,000-row Postgres table: sort persisted correctly across pagination, and
  the export produced a full 10,001-line CSV (header + every row) via a real browser download.
- **Project rebranded to Qyre** ([PR #65](https://github.com/ensp1re/qyre/pull/65), merged): Swapped
  package scope from `@humbdb/*` to `@qyre/*`, primary command to `qyre`, env prefix to `QYRE_`,
  renamed package directory `packages/humb` to `packages/qyre`. `qyre`/`@qyre/qyre` published to npm
  as v0.1.0 ([PR #63](https://github.com/ensp1re/qyre/pull/63)) and v0.2.0; `scripts/publish.mjs`
  gained a release-branch + PR workflow (commit `bb784f9`) instead of publishing straight from a
  local checkout.
- **F067 `passing`** ([PR #66](https://github.com/ensp1re/qyre/pull/66)): a user bug/feature triage
  session produced `SUGGESTIONS.md` (10 reports) and `docs/FEATURES.json` entries F067-F074. F067
  itself: the CLI's per-request Fastify logger defaults to warnings/errors only instead of spamming
  a JSON line per request (`--verbose` restores the old behavior), and the bare "Qyre is running at
  \<url\>" line became a short banner (version, redacted target, URL, issue/contributing links).
  Also added a cross-engine-parity rule to `AGENTS.md`'s working contract: any adapter/driver change
  must be checked against all 4 engines, not just the one in front of the agent.

## In progress

- Nothing in flight. F067 (PR #66) is open awaiting merge; F068-F074 (see `SUGGESTIONS.md` for the
  full analysis behind each) are `not_started` and unclaimed.

## Known issues / blockers

- An animated demo (GIF/asciicast) for the README remains a legitimate follow-up - F009 shipped with
  static screenshots instead.
- **Test databases**: the canonical way to satisfy `pnpm check`/the pre-push hook is
  `docker compose up -d` plus the three `QYRE_TEST_*` env vars from `.env.example` (standard
  ports 5432/3306/27017, matching CI) - see `AGENTS.md`'s "Standard commands" and
  `CONTRIBUTING.md`. Containers do not persist across a Docker Desktop restart; just re-run
  `docker compose up -d`.
- **On this machine, `docker` may look missing when it isn't**: `/usr/local/bin/docker` (and
  `docker-compose`) are dangling symlinks into `/Volumes/Docker/...` from an old install, so
  `docker` exits 127 even while Docker Desktop is running. Do not conclude Docker is unavailable -
  use `export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"` and retry. Permanent
  fix (needs the user): `sudo ln -sf /Applications/Docker.app/Contents/Resources/bin/docker /usr/local/bin/docker`,
  or Docker Desktop Settings → Advanced → reinstall CLI tools.
- Older ad-hoc fixture containers (`qyre-rename-pg` on 5433, `qyre-mysql` on 3307) from previous
  manual-Preview sessions are superseded by the compose stack; if a Preview run against a
  long-lived local Postgres shows 11 dev-seed tables where a spec expects one `table-detail` card,
  that is environmental noise, not a regression (`pnpm exec tsx .local/seed-dev-data.ts <url>`
  seeds the dev dataset; `setupFixture`/`setupMysqlFixture` from `@qyre/testing` create the e2e
  fixture tables).

## Next steps

**F068-F074 are queued and `not_started`** (see `SUGGESTIONS.md` for the full reported-bug/fix-plan
detail behind each): F068 (MongoDB per-field type/nullability inference), F069 (long-string cell
truncation), F070 (date/timestamp cell detail popover), F071 (resizable sidebar/SQL-editor panels),
F072 (server-side row filtering + PK/FK click-to-filter across all 4 engines - needs a product-spec
pass first), F073 (guided no-URL CLI startup / connect-later flow), F074 (interactive schema
graph/ERD - needs a product-spec pass first). Suggested order is in `SUGGESTIONS.md`'s
"Suggested implementation order" table; smallest/most-contained first.

Separately, `--demo` mode (a zero-setup trial with a bundled sample DB) is still on
`docs/exec-plans/tech-debt-tracker.md` with no spec written yet. The residual MongoDB-fake-fields
half of F063's old tech-debt row is now superseded by F068 above.

A fresh session asking "what's next" should pick up F068 (smallest, contained to
`packages/drivers/mongodb`) unless the user directs otherwise.
