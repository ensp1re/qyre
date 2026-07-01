# SESSION_HANDOFF.md

The structured handoff between sessions. Update this before ending any session. A fresh agent should
be able to resume from this file plus `docs/FEATURES.json` in a few minutes.

Validated by `scripts/check-handoff.mjs` (all sections must be present).

## Current state

- Date: 2026-07-01
- Latest commit: `ac8a92b` (docs: formalize lightweight plan-and-approve workflow)
- Build status: builds (`pnpm build`)
- Test status: unit tests pass (`pnpm test`); smoke E2E passes (`pnpm test:e2e`)
- Verification status: `pnpm check` passes on a clean install

## Completed

- Repository skeleton: monorepo layout, tooling, and agent docs.
- Product contract finalized (`docs/product-specs/connect-and-inspect-postgres.md`).
- **F001 (`passing`)**: the original scaffold commit (`a0ae2f7`) already checked in most of the
  working backend/CLI code — this went unnoticed until this session because `docs/FEATURES.json`
  was never updated to match. Auditing it against the full spec (not just its unit tests) surfaced
  two real gaps, both now fixed:
  - `HUMB_PORT` was silently ignored (only `--port` worked). Fixed via `resolvePort()` in
    `packages/cli/src/index.ts`.
  - The server had no route for `/`, so a real `npx humb <url>` opened the browser to a 404 — there
    was no static serving of the built `apps/web`. Fixed via `webRoot` support (`@fastify/static`)
    in `packages/server/src/index.ts`, wired up by the CLI's `defaultWebRoot()`.
  - Re-verified manually end to end with a real Postgres container (not just unit tests): the built
    UI now loads at `/`, `HUMB_PORT` is respected, and `/api/health` reports `connected`.
- Verification scripts and git hooks wired (`pnpm check`, Lefthook, CI).
- First E2E golden journey defined (smoke + golden-journey specs).

## In progress

- **F002 (`active`)**: browser UI shows database connection status. Correction to an earlier note
  in this file: `apps/web/src/App.tsx` was **not** a bare scaffold — it already fetches
  `/api/health` and renders a real `StatusBadge`/connection summary from `@humb/ui`. Combined with
  this session's static-serving fix, the connection-status behavior is now genuinely verified
  working end to end. It stays `active` (not `passing`) only because its verification command
  (`pnpm test:e2e:golden`) is shared with F004/F005 in one Playwright spec and won't go green until
  the nav tree and table view exist too — see `e2e/golden-journey.spec.ts`. The real remaining gap
  is F004/F005: no navigation tree or table view UI exists yet.

## Known issues / blockers

- F003 (Postgres introspection), F006 (read-only query runner), and F007 (health endpoint) also
  have backend code already committed in `a0ae2f7` with passing package-level tests
  (`pnpm --filter @humb/db-postgres test`, `pnpm --filter @humb/server test`), same as F001 was.
  Their `FEATURES.json` entries still say `not_started` pending an explicit decision to mark them
  `passing` (not done yet — flag this to the user before flipping their state, and audit each
  against its full spec/acceptance criteria first, the way F001 needed auditing before it was truly
  done).
- `packages/cli`'s path to `apps/web/dist` is monorepo-relative and won't resolve once `humb` is
  published to npm; tracked in `docs/exec-plans/tech-debt-tracker.md`.

## Next steps

1. Implement F004 (navigation tree) and F005 (paginated table rows) in `apps/web` — these are the
   actually-missing pieces blocking `e2e/golden-journey.spec.ts`.
2. Once F004/F005 land and the golden journey is green, mark F002/F004/F005 `passing` together.
3. Revisit F003/F006/F007's `not_started` state per the note above.
