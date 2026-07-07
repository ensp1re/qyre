# SUGGESTIONS.md — User-reported bugs & improvement plan

Collected 2026-07-07 from live usage of `npx qyre`. Each item: what was reported, what the code
actually does today (verified against the repo), and a concrete fix plan. Ordered by theme, with
a suggested implementation order at the bottom. These are candidates for the next FEATURES.json
slices (F067+); the two large ones (filters, schema graph) should get a product-spec pass first,
per repo convention.

---

## A. Rows table — filtering (the big one)

### A1. Clicking a PK/FK value doesn't filter — and there is no server-side filtering at all

**Reported:** Clicking a PK doesn't filter by that value; filters must reach the server (real
`WHERE`), not just the frontend.

**Current state (verified):**

- `GET /api/.../rows` supports only pagination + sort (F065) — no filter parameters exist
  anywhere in `packages/server/src/index.ts` or the adapters' `getRows`.
- The search box in `packages/ui/src/components/rows-table.tsx` is client-side only — it narrows
  the _fetched page_ (comment at line ~108 confirms), so it's useless beyond page 1.
- Clicking an FK value calls `onNavigateToForeignKey`, which in `apps/web/src/App.tsx:196` just
  switches to the referenced table — it does **not** filter to the referenced row. PK values have
  no click affordance at all.

**Plan:**

1. **Server:** extend the rows route with filter params, mirroring exactly how F065 did sort
   (that pattern is already proven): `filterColumn` validated against the table's real columns
   (the injection surface), `filterOp` from a fixed whitelist (`eq`, `neq`, `lt`, `lte`, `gt`,
   `gte`, `contains`, `isNull`, `isNotNull`), `filterValue` always parameter-bound. Support
   multiple filters (AND) via repeated params or a JSON-encoded array.
2. **Adapters:** each `getRows` translates filters — SQL engines to a parameterized `WHERE`
   clause, MongoDB to a `.find({...})` document (`eq` → `{col: val}`, `contains` → `$regex`
   with escaped input, etc.). Add conformance tests in `@qyre/testing-conformance` so all 4
   engines are covered by the same suite (see item E1).
3. **UI — click-to-filter:** clicking an FK value navigates to the referenced table **with a
   filter pre-applied** (`referencedColumn = value`) instead of just switching tables. Clicking
   a PK value applies a filter on the current table. This must work identically for Mongo `_id`
   (see D2).
4. **UI — filter bar:** a structured filter row on `RowsTable` (column dropdown + op dropdown +
   value input, "+ add filter" for more). Structured (not raw SQL) so it works uniformly across
   all engines including MongoDB — this answers "for mongodb I can't use SQL". Active filters
   render as removable chips. Power users who want raw SQL already have the SQL Editor tab
   (gated on `capabilities.supportsSql`); don't duplicate a raw-`WHERE` input in the table view.
5. The existing client-side search box stays but gets relabeled ("filter this page") or is
   folded into the new filter bar to avoid two confusing search affordances.

**Files:** `packages/server/src/index.ts`, `packages/core` (filter types), all 4
`packages/drivers/*/src/index.ts`, `packages/testing-conformance`,
`packages/ui/src/components/rows-table.tsx`, `apps/web/src/App.tsx`,
`apps/web/src/hooks/use-rows.ts`, `apps/web/src/components/tables-tab.tsx`.

**Verify:** conformance test per engine per op; E2E: click FK in Postgres → referenced table
opens filtered to that row; same flow on MongoDB via `_id`.

---

## B. Rows table — cell rendering

### B1. Date/timestamp cells: show timezone/UTC detail on click

**Reported:** For timestamp/date columns, show converted values (UTC, local zone, etc.) —
click (preferred over hover) opens an attached overlay with full detail.

**Current state:** `packages/ui/src/format-cell.ts` / `cell-value.tsx` have no date-specific
handling at all (no `Date`/`toISOString` logic) — temporal values render as plain strings,
however the driver serialized them.

**Plan:**

1. Detect temporal columns from `column.dataType` (per-engine list: `timestamp`,
   `timestamptz`, `date`, `datetime`, `time`, Mongo `date`) — metadata is already in
   `rowPage`/table metadata, so no server change needed.
2. Render the cell as today (raw value, truncated) plus a click affordance. On click, open a
   small anchored popover (portal, high z-index — the "z-999 component attached to that row"
   ask) showing: raw value as stored, ISO 8601 UTC, the user's local timezone conversion
   (named zone + offset), relative time ("3 days ago"), and unix epoch (s + ms). Copy button
   per row. `Intl.DateTimeFormat` covers all of it — no new dependency.
3. Reuse the popover pattern for B2 below (one `CellDetailPopover`, two content types).

**Files:** `packages/ui/src/components/cell-value.tsx`, new
`packages/ui/src/components/cell-detail-popover.tsx`, `format-cell.ts` + tests.

**Verify:** component tests with fixed timestamps across zones (`TZ=` in test env); E2E click
on a timestamp cell in the seeded dataset shows UTC + local rows.

### B2. Long raw strings take too much space

**Reported:** Come up with better UI/UX for long strings.

**Current state:** JSON and binary values already get compact previews + the
`cell-value-drawer.tsx` for full content, but plain long strings have no cap — they stretch
the row.

**Plan:** cap string cells to one line with `max-width` + ellipsis past a threshold (~120
chars). Truncated cells get the same click affordance as JSON chips, opening the existing
`CellValueDrawer` with the full value, char count, and copy button. This reuses the shipped
drawer rather than inventing a new surface.

**Files:** `packages/ui/src/components/cell-value.tsx`, `rows-table.tsx` (cell width), tests.

---

## C. Layout & schema visualization

### C1. Resizable panels: sidebar, SQL editor / results split

**Reported:** Add resize to the sidebar, the SQL editor, and the editor's response area.

**Current state:** no resize logic anywhere (`sidebar.tsx`, `query-runner.tsx` have fixed
layout).

**Plan:** a small shared `ResizeHandle` (pointer-events drag, keyboard-accessible per the
repo's a11y bar — arrow keys resize, `aria-valuenow`) applied to: (1) sidebar width,
(2) editor/results vertical split in `query-runner.tsx`. Persist sizes in `localStorage`
(same pattern as `use-theme.ts`). No dependency needed; if one is preferred,
`react-resizable-panels` is the standard choice.

**Files:** new `packages/ui/src/components/resize-handle.tsx`, `sidebar.tsx`,
`query-runner.tsx`, `apps/web/src/App.tsx` layout.

### C2. Interactive schema graph (ERD): pan, zoom, moveable nodes, FK connection lines

**Reported:** current Schema tab "looks terrible"; wants a GraphQL-style navigable schema
canvas with zoom in/out and relation lines.

**Current state:** `schema-grid.tsx`/`table-detail.tsx` render static cards; no graph, no FK
edges.

**Plan:** this is the largest item — needs a product-spec pass (`docs/product-specs/`) before
implementation, like F063–F066 got. Spec should decide:

- Library: recommend `@xyflow/react` (React Flow) — pan/zoom/drag/edges out of the box, MIT;
  hand-rolled SVG is the alternative if the dependency is unwanted.
- Nodes = tables (name + columns + PK/FK badges), edges = FK relationships (already in
  metadata for SQL engines; Mongo has no FK edges — graph still works as unconnected nodes).
- Auto-layout on first render (dagre/elkjs), then user-draggable; positions persisted in
  `localStorage` per database.
- Keep the existing card grid as a fallback view or replace it outright (spec decision).
- This was already identified as a high-share-value feature in `.local/suggestions.md`
  (Part B, Bet 3 — ERD screenshots are "the sharing currency").

---

## D. MongoDB parity

### D1. Schema cards show `any` / `null` for every Mongo field, including `_id`

**Reported:** PK on MongoDB schema cards always shows `any` and `null`.

**Current state (verified):** `packages/drivers/mongodb/src/index.ts:211` marks `_id` as
`isPrimaryKey`, but every field gets `dataType: "any"` and `nullable: true` — the UI
faithfully renders that fake data (`table-detail.tsx:75-76`). This is the known tech-debt row
("MongoDB fakes fields") from 2026-07-04 — this bug report is its "next trigger" firing early.

**Plan:**

1. `_id` minimum fix: report `dataType: "objectId"`, `nullable: false`.
2. Better: the driver already samples documents to discover field names — extend the same
   sample to infer BSON types per field (`string`, `number`, `objectId`, `date`, `array`,
   `object`, mixed → `mixed`) and nullability (field absent/null in any sampled doc). Sampling
   is already accepted as approximate for field discovery; type inference is the same bargain.
3. Update the tech-debt tracker row accordingly.

**Files:** `packages/drivers/mongodb/src/index.ts` + tests, tech-debt-tracker.md.

### D2. Mongo `_id` doesn't get the PK/id click affordances Postgres gets

**Reported:** on MongoDB you can't click/filter an id like on Postgres; every engine must have
the same UI features.

**Plan:** falls out of A1 items 3–4 (click-to-filter is driven by `isPrimaryKey`, which Mongo
already sets on `_id`) — but must be explicitly tested on Mongo, not assumed. The `_id` value
is an ObjectId serialized to string; the filter path must round-trip it (server converts back
to `ObjectId` for the `.find()` — a Mongo-adapter concern, add to conformance tests).

---

## E. Process rule (requested)

### E1. "When fixing a bug in one provider, check all others"

**Reported:** add a rule that any per-engine fix is checked against the other engines.

**Plan:** two halves:

1. **Docs:** add the rule to `AGENTS.md`'s working contract: any adapter-level bug fix must
   state, in the PR, what was checked in the other 3 adapters (fixed / not affected / follow-up
   filed).
2. **Enforcement:** prefer conformance tests over discipline — `@qyre/testing-conformance`
   (built in F0xx batch 4) exists exactly for this; every cross-engine behavior from this list
   (filters, `_id` click-through, type reporting) lands as a conformance case, not per-driver
   tests.

---

## F. CLI / onboarding

### F1. `npx qyre` spams pino JSON request logs

**Reported:** every request prints
`{"level":30,...,"msg":"request completed"}` noise.

**Current state (verified):** `packages/cli/src/index.ts:164` passes `logger: true` to
`startServer`, turning on Fastify's default pino logger at info level → per-request JSON lines.
The server default is already `false`; the CLI opts in.

**Plan:** CLI passes a pino config with `level: "warn"` by default (errors still surface —
"it's ok to show some errors"), and adds `--verbose` to restore full request logging for
debugging. One-line change plus flag plumbing.

**Files:** `packages/cli/src/index.ts`, `packages/server/src/index.ts` (accept a level, not
just boolean), CLI tests.

### F2. Startup banner: replace debug spam with project/contribution info

**Reported:** show GitHub info (where to file issues, how to contribute) instead of API debug
noise at launch.

**Current state:** startup prints one line (`Qyre is running at <url>`), then the request-log
spam (F1) drowns it.

**Plan:** with F1 done, print a short banner: version, engine + redacted target (the
`redactConnectionString` helper already exists), URL, and two lines —
`Bugs: https://github.com/ensp1re/qyre/issues` / `Contribute: <repo>#contributing`. Keep it
to ~6 lines; no ASCII art. Errors keep printing as they do now.

**Files:** `packages/cli/src/index.ts` + tests.

### F3. `npx qyre` with no URL: guided experience + "login later" with user/password

**Reported:** handle the no-URL case with a beautiful guide covering every outcome; allow
connecting later with user + password.

**Current state:** `parseConnectionTarget(undefined)` throws, so bare `npx qyre` dies with an
error. Meanwhile F064 already shipped everything needed for "connect later": the server can
start and swap adapters at runtime (`POST /api/connect`), and the web UI has a `ConnectDrawer`
with a connect form + recent targets.

**Plan:**

1. Bare `npx qyre` (no target) starts the server **unconnected** and opens the browser
   straight into the `ConnectDrawer` — this _is_ the "login later" flow, reusing F064 instead
   of building a terminal wizard. Requires the server to tolerate a null adapter until first
   connect (health endpoint reports "not connected"; UI already has an error/empty state
   pattern to build on).
2. Extend the `ConnectDrawer` form with individual fields (host, port, user, password,
   database, engine) as an alternative to pasting a URL — it composes the connection string
   client-side and hits the same `POST /api/connect`.
3. CLI `--help` and error paths get a real guide: per-engine example strings (already
   half-present in the option description at `cli/src/index.ts:52`), and distinct, actionable
   messages for the known failure outcomes — unparseable target, unreachable host (the F064
   `describeError` work), auth failure, port in use. Audit each path and give it a one-line
   "what to do next".

**Files:** `packages/cli/src/index.ts`, `packages/server/src/index.ts` (nullable adapter at
boot), `packages/ui/src/components/connect-drawer.tsx`, `apps/web` boot state, tests + E2E.

---

## Suggested implementation order

| Order | Items                                                                                   | Why first                                                                                     |
| ----- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1     | F1 + F2 (log spam, banner)                                                              | Smallest, highest daily-annoyance relief; pure CLI.                                           |
| 2     | D1 (Mongo types/PK in schema)                                                           | Small driver fix, kills a visible "looks broken" bug.                                         |
| 3     | B2 (long strings) then B1 (date popover)                                                | Contained UI slices, shared popover work.                                                     |
| 4     | C1 (resizable panels)                                                                   | Contained UI slice, no server changes.                                                        |
| 5     | **A1 + D2 + E1** (server-side filters, PK/FK click-to-filter, all engines, conformance) | The biggest functional gap; needs a short product spec first (filter grammar, URL/API shape). |
| 6     | F3 (no-URL guided start, connect form fields)                                           | Builds on F064; medium size.                                                                  |
| 7     | C2 (schema graph)                                                                       | Largest; needs its own product-spec pass + a dependency decision.                             |

Items 5 and 7 should each get a `docs/product-specs/` doc before implementation, matching how
F063–F066 were run.
