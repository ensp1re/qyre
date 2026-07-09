# Session handoff

Current-only handoff. Shipped history belongs in specs, Git/PRs, and short-lived `FEATURES.json`
entries. Validated by `scripts/check-handoff.mjs` and the harness size budget.

## Current state

- Date: 2026-07-09.
- Branch: `main`, tip `d2e2edc` (merge of F078/PR #79). No code changes since; only `FEATURES.json`
  triage below.
- 12 features `passing` (F067-F078), **8 new `not_started` (F081-F088), 0 `active`**. F081-F088
  were triaged from manual QA notes taken against a live Preview session (seeded with the 28-table
  `type_showcase`-inclusive demo dataset across all 4 engines) - see "Completed" for the source.

## Completed

- All product and structure work through F078 is merged and passing. See product specs,
  `docs/CODE_ORGANIZATION.md`, and Git/PR history.
- The full gate exposed and repaired a corrupt generated SQLite fixture; invalid generated fixtures
  are now recreated after `quick_check`, with a regression test.
- MongoDB now has Playwright browse coverage, including nested documents and disabled SQL Editor;
  SQL-only journeys skip it explicitly.
- Seeded a 28-table B2B logistics/e-commerce dataset (52k rows/table) plus a `type_showcase`
  table/collection exercising each engine's native type system, across Postgres/MySQL/SQLite/
  MongoDB (ephemeral scratchpad scripts, not part of the repo; `.local/demo.sqlite` gitignored).
- Triaged 26 manual QA notes taken against that dataset into 8 independently shippable
  `FEATURES.json` entries (F081-F088, not yet started): date/time type fidelity (F081), type-aware
  filters (F082), bulk row selection/export (F083), schema graph correctness (F084), connection-
  switch UI staleness (F085), cell preview/messaging polish (F086), Settings UI rebuild (F087),
  and a guided CLI login flow (F088). Kept as 8 slices rather than fewer/bigger ones since each
  spans a distinct package/surface and needs its own verification.

## In progress

- Nothing in flight. F081-F088 are `not_started` and unclaimed - see "Next steps".

## Known issues / blockers

- Full `pnpm check` requires Docker; root test/check commands load the gitignored `.env` URLs.
- If `docker` resolves to a dangling `/usr/local/bin/docker`, prepend
  `/Applications/Docker.app/Contents/Resources/bin` to `PATH`.
- UI Preview must rebuild `@qyre/ui` before `@qyre/web` because the web package consumes UI `dist/`.

## Next steps

- Pick from F081-F088 (see `docs/FEATURES.json`), branch off `main` as `feature/<ID>-<slug>`, and
  follow the usual `pnpm verify:pr` -> push -> draft PR -> merge -> mark-passing loop. F081 (date/
  time type fidelity) is a reasonable first pick: it names concrete repro cases against the
  `type_showcase` table already seeded in every engine.
