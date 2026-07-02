# Plan 0003: Dashboard UI Redesign

Status: Active
Owner: unassigned
Linked features: DF-01 through DF-09 (`docs/FEATURES.json`)

## Objective

Port the VS Code-style Postgres/SQL IDE design from `github.com/ensp1re/UserDashboard` (private,
Figma Make export) into `apps/web`/`packages/ui`, replacing the current bare-bones inline-style UI,
without changing any of the backend data contracts F001-F008 already ship (`connect-and-inspect-*`
specs stay authoritative for data; `docs/product-specs/dashboard-ui.md` governs presentation).

## Scope

In scope: DF-01 (design system foundation) through DF-09 (see `docs/FEATURES.json` for each entry's
exact behavior). Tracked as a separate `DF-##` series from `F###` per `docs/NAMING.md` - same rules,
same state machine, just visually distinct since it's frontend/design-driven rather than
backend/product-driven.

Out of scope: anything write/mutation-shaped (`docs/product-specs/dashboard-ui.md`'s "Out of
scope"), multi-connection UI, settings panel content.

## Verification path

- Per-slice: whatever `verification` each `DF-##` entry states, plus a re-run of
  `pnpm test:e2e:full`/`pnpm test:e2e` after every slice that touches `apps/web` - the redesign must
  never silently break the connect-and-inspect journey's existing assertions.
- Visual: `pnpm dlx` the Preview tooling (or manual `pnpm --filter @humb/web dev`) to confirm each
  slice renders correctly in both light and dark mode before marking it `passing` - `pnpm check`
  alone does not catch a visually broken UI.

## Risks and blockers

- Two of the five tabs (Files, Console) need genuinely new backend capability, not just
  restyling - see `docs/product-specs/dashboard-ui.md`'s "Backend gaps" section. The Files tab in
  particular needs a real security-scoping decision (what's readable, from where) before any
  endpoint is written - do not implement "read whatever path the client sends."
- `apps/web`'s current components use zero Tailwind classes (all inline `style={{}}`) despite
  Tailwind being scaffolded since the start - DF-01 wires real tokens into the (previously unused)
  config without touching component code, so there's no regression risk yet. DF-02+ actually
  migrates components to Tailwind classes, which does carry regression risk each time - re-verify
  e2e after each.
- Source design is Tailwind v4 (`@theme inline`, CSS-first config); Humb's `apps/web` is Tailwind
  v3. DF-01 translated tokens to v3's `theme.extend` + CSS custom properties rather than upgrading
  Tailwind - revisit only if v3 becomes a real blocker, not preemptively.

## Progress log

- 2026-07-02: DF-01 (design system foundation).
  - Cloned and read `github.com/ensp1re/UserDashboard` (gh CLI, private repo) - a complete
    VS Code-style Postgres/SQL IDE mockup (title bar, searchable sidebar tree, SQL
    Editor/Tables/Schema/Files/Console tabs, status bar), not a generic dashboard - it's Humb's
    actual target UI.
  - Extracted the full token set (light + dark colors, Geist + JetBrains Mono typography, tight
    `0.25rem`-based radius scale, semantic `--c-*` accent colors for data-type icons/badges) into
    `docs/references/design-system.md`.
  - Added `.claude/skills/humb-design-system/SKILL.md` - triggers on UI work in `apps/web`/
    `packages/ui`, points to the reference doc, states the read-only-only and
    reuse-don't-speculate rules so future sessions don't re-derive or drift from the tokens.
  - Added `docs/product-specs/dashboard-ui.md` - the engine-agnostic UI contract, the tab-by-tab
    shape, and the backend gaps this design surfaces (engine+version in `/api/health`, FK metadata
    for the Schema tab, a scoped Files-browsing endpoint, a Console/activity-log endpoint) so each
    becomes its own scoped `DF-##` slice rather than a rushed side-effect of a UI change.
  - Wired the real tokens into `apps/web`'s Tailwind config (`darkMode: "class"`, colors/radius/
    fonts mapped to CSS custom properties in `src/index.css`, both `:root` and `.dark`) - Tailwind
    was scaffolded from the start but genuinely unused (zero component uses a Tailwind class), so
    this carries no regression risk to F001-F008's passing UI. Verified live: `pnpm --filter
@humb/web build`/`typecheck` clean, no PostCSS warnings, `pnpm test:e2e` (@smoke) still passes,
    and a screenshot via the Preview tool confirms the app still renders correctly.
  - Added `cn()` (clsx + tailwind-merge) to `packages/ui/src/cn.ts`, matching `format-cell.ts`'s
    existing flat-utility-file precedent - the one piece of infra every future Tailwind/shadcn
    component in `packages/ui` will need, added now rather than re-added piecemeal per component.
  - Set up the `DF-##` ID series: `scripts/check-features.mjs`'s `ID_PATTERN` now accepts both
    `F\d{3}` and `DF-\d{2,}`; documented in `docs/NAMING.md` and `docs/FEATURES.md`.
  - Added DF-02 through DF-09 as `not_started` backlog, enumerating the actual view-by-view port
    (shell layout, SQL Editor, Tables, Schema, Files+backend, Console+backend, engine-version/FK
    backend additions, theme toggle) - too broad for one slice, split per
    `docs/PLANS.md`'s rule, same pattern as F008/F011.
- 2026-07-02: DF-02 (shell layout).
  - Rebuilt `apps/web`'s shell in `packages/ui`: `TitleBar`, `Sidebar` (wraps the restyled
    `SchemaTree` with search + highlight + force-open-on-match + collapse-to-rail), `TabBar`,
    `StatusBar` - all pure Tailwind against DF-01's tokens, no inline styles, per the acceptance
    criteria in `docs/product-specs/dashboard-ui.md`.
  - Split the old single-page layout's content across the new tabs instead of restyling it yet:
    SQL Editor = existing `QueryRunner`, Tables = existing `RowsTable`, Schema = existing
    single-table `TableDetail`. Decided this over building DF-05's full all-tables grid early,
    since that's explicitly its own slice - reusing the existing single-table view keeps Schema
    functioning (not a placeholder) without doing DF-05's work under DF-02's name. Files/Console
    are placeholder empty states, as the behavior spec explicitly allows only for those two tabs.
  - Set `class="dark"` on `apps/web/index.html`'s `<html>` since dark is the documented
    default theme - the title bar's theme toggle button itself stays inert (chrome-only, same
    precedent as the settings gear) until DF-09 wires persistence.
  - Removed `Panel` and `StatusBadge` (`packages/ui`) - both became fully unused once the old
    single-page layout and its "Database connection" panel were replaced by the new shell; per
    the four-rules contract (remove dead code your own change orphans), not left as debt. The
    status dot kept `StatusBadge`'s `data-testid="status-badge"`/`data-status` contract, moved
    onto `TitleBar`, so existing e2e assertions needed no testid changes - only the
    table-selection flow in `e2e/connect-and-inspect.spec.ts` was updated (select table -> now
    switches to the Tables tab; a separate click on the Schema tab reveals `table-detail`) since
    the tabbed layout genuinely changed when each is visible, not just cosmetically.
  - Added `lucide-react` to `@humb/ui` for the shell's icons, per the icon library named in
    `docs/references/design-system.md`.
  - Live verification against a real Postgres fixture (docker `postgres:16-alpine` + the built
    CLI) via the Preview tool caught a real bug not caught by any automated check: the search
    highlight's `bg-[var(--c-blue)]/25` silently failed to generate a working Tailwind utility
    (JIT can't apply an opacity modifier to a raw `var()` reference), silently falling back to
    `<mark>`'s browser-default yellow - fixed with a `color-mix()` arbitrary value instead,
    re-verified the tinted-blue highlight renders with correct inherited text color. Confirmed
    search/highlight, table selection, tab switching, and sidebar collapse/expand in both light
    and dark mode.
  - `pnpm check` (format/lint/typecheck/test/build across all 10 packages) and
    `pnpm test:e2e`/`pnpm test:e2e:full` all pass; commit `2b3179c`.
- 2026-07-02: DF-02 correction + DF-04 + DF-09 (commit `0238265`).
  - The user reviewed the DF-02 result against `github.com/ensp1re/UserDashboard` directly and
    flagged three real problems: the shell didn't actually match the source's component patterns
    (only its color tokens), dark mode was "bad for the eyes" with no way to leave it, and there
    was no mobile support. Re-cloned the source (`gh repo clone`, private) and read the real
    `App.tsx` in full this time - DF-01 had only skimmed it for token extraction, which is why the
    tree/table/tab-bar patterns had drifted despite the colors being correct.
  - Rewired every shell component against the actual source patterns: `SchemaTree` now builds a
    hierarchical connection -> schema -> table tree (was flat schema -> table) with the source's
    exact `TreeNode` depth-indent/chevron/hover/highlight behavior; `RowsTable` gained a real
    spreadsheet grid (type/PK sub-header row via a new shared `TypeIcon` helper in `packages/ui`,
    prefix-matched case-insensitively against both Postgres's `information_schema` strings and
    SQLite's `PRAGMA` strings; sortable columns; row-number + checkbox columns; cell borders);
    `TableDetail` restyled to the source's per-column row pattern; `TabBar` switched to a VS
    Code-style attached-tab look; `StatusBar` moved to `bg-sidebar` with colored status text and
    `·` separators; `TitleBar` got a real prefix/database-name breadcrumb split and `h-9` sizing
    (was `h-10`, drifted from the source without a reason).
  - This is DF-04's exact scope (client-side search/sort over the fetched page) - implemented it
    now rather than deferring further, since the Tables tab was the user's specific complaint;
    marked DF-04 `passing`. Added two genuinely-functional read-only actions the row checkboxes
    make meaningful - CSV export of the current page, "copy selected as CSV" for the selection -
    both explicitly endorsed by `docs/product-specs/dashboard-ui.md`'s out-of-scope carve-out
    rather than wiring them to a real mutation.
  - Root cause of "too dark, bad for the eyes": the theme toggle was wired as an inert chrome-only
    placeholder deferred to DF-09, so there was no way to leave dark mode at all - since that's the
    actual mechanism behind the complaint, implemented DF-09 now instead of deferring it again
    (`apps/web/src/hooks/use-theme.ts` toggles `.dark` and persists to `localStorage`; a pre-paint
    inline script in `index.html` reads it before React mounts so there's no flash of the wrong
    theme). Marked DF-09 `passing`.
  - Added mobile responsiveness, which the source has none of: `Sidebar`'s `open` state was lifted
    to `App` so it drives both desktop's collapse-to-rail and, below the `md` breakpoint, an
    off-canvas overlay drawer with a backdrop (opened via a new hamburger button in `TitleBar`,
    `md:hidden`); `TabBar` scrolls horizontally instead of wrapping; `TitleBar`/`StatusBar` hide
    secondary text (breadcrumb prefix, encoding, engine name) at narrow widths via `sm:`/`md:`
    classes rather than JS breakpoint checks.
  - Also gave `QueryRunner` a light restyle (bordered container, `Play`-icon run button,
    `Cmd/Ctrl+Enter` to run) so it doesn't look visibly unstyled next to the rest of the shell -
    the line-numbered gutter itself stays DF-03's scope, not attempted here.
  - Verified live via Preview across desktop/tablet/mobile viewports and both themes against a
    real Postgres fixture: hierarchical tree search/highlight, table selection auto-switching to
    the Tables tab, sort/filter/CSV export, Schema tab, theme toggle persistence (confirmed no
    FOUC via `document.documentElement.classList`/`localStorage` after a hard reload), and the
    mobile drawer opening/backdrop-dismissing/auto-closing on table selection.
  - `pnpm check` and `pnpm test:e2e`/`pnpm test:e2e:full` all pass; commit `0238265`.
- 2026-07-02: DF-03 (SQL Editor line-numbered gutter, commit `39bfc95`).
  - The DF-02 correction pass gave `QueryRunner` a light restyle (bordered container, run button,
    `Cmd/Ctrl+Enter`) but explicitly deferred the source design's line-numbered gutter to this
    slice - the only piece of `SqlEditor` (`github.com/ensp1re/UserDashboard`) not yet ported.
  - Added a scrollable line-number column to `packages/ui/src/components/query-runner.tsx`,
    synced to the textarea's `scrollTop` via a real `onScroll` handler. The source mock's gutter
    has no scroll sync at all - its demo query is short enough to never need it - so this had no
    reference behavior to copy; built it because a real editor has to handle queries that scroll.
  - Verified live via Preview against a real SQLite fixture (`sqlite3` CLI, `humb_demo_users`
    table): line numbers render, increment, and stay aligned with content through a 60-line query
    while scrolling, in both light and dark mode; a real query still runs and results still render
    below the editor.
  - `pnpm --filter @humb/web build`/`typecheck` and `pnpm --filter @humb/ui build`/`typecheck`
    clean. Started a real `postgres:16-alpine` container and re-ran `pnpm --filter @humb/postgres
test` (11/11) and `pnpm test:e2e:full` (1/1) - no regression from the DF-02 baseline. `pnpm
check` (format/lint/typecheck/test/build across all packages) passes; commit `39bfc95`.
- 2026-07-02: DF-05 (Schema tab full-database grid, commit `3a51660`).
  - Replaced the Schema tab's old behavior (required a sidebar selection, rendered a single
    `TableDetail`) with a new `SchemaGrid` (`packages/ui`) showing every table in the database at
    once. Reused `TableDetail`'s exact column-row pattern (PK badge, `TypeIcon`, indexes, row
    count) unchanged for each card instead of inventing a new one - `TableDetail`'s own docstring
    had anticipated this since the DF-02 correction pass.
  - Added `useAllTables` (`apps/web`) to fan the existing single-table
    `/api/tables/:schema/:table` endpoint out across every `schema.table` pair via `useQueries` -
    no new backend endpoint needed, matching `docs/product-specs/dashboard-ui.md`'s "Backend gaps"
    section, which never listed DF-05. Shares its query key with `useTable` so a table already
    viewed in the Tables tab is served from cache, not refetched.
  - FK badges stay out of scope, deferred to DF-08 per the behavior entry (Postgres/SQLite don't
    expose FK metadata yet - PK-only badges ship first).
  - Strengthening `e2e/connect-and-inspect.spec.ts` to assert the grid renders _before_ any table
    is selected (proving the behavior genuinely changed, not just a superficial pass) surfaced a
    real test bug: the grid's own table-name text made the sidebar's prior `getByText(table)`
    assertion ambiguous (Playwright strict-mode violation, 3 matches). Fixed by scoping that
    assertion to a role locator instead of loosening the new one.
  - `pnpm --filter @humb/web build`/`typecheck` and `pnpm --filter @humb/ui build`/`typecheck`
    clean. Re-ran `pnpm test:e2e:full` against a real `postgres:16-alpine` container - passes.
    `pnpm check` passes. Manually verified live via Preview against a real 3-table Postgres
    fixture (`humb_demo_users`/`orders`/`products`): all three cards render with correct PK
    badges/type icons/index footers/row counts, wraps responsively at tablet width, correct in
    both light and dark mode.

## Open decisions

- Files tab security scoping (which directory, which extensions, opt-in flag vs. default-on) - not
  decided; flagged in `docs/product-specs/dashboard-ui.md`, to be resolved when DF-06 is picked up.
- Whether FK metadata (`DF-08`) is added to `@humb/core`'s `ColumnMetadata` directly or as a new
  field alongside `IndexMetadata` - decide when DF-08 is scoped, following F003's precedent for how
  `IndexMetadata` itself was added.
- Order of remaining DF-06..DF-08 pickup - not fixed; pick per session same as the F-series.
  (DF-03/DF-04/DF-05/DF-09 all shipped ahead of the originally-declared order - DF-04/DF-09 folded
  into the DF-02 correction pass since user feedback pointed straight at Tables/dark-mode; DF-03
  and DF-05 picked up next as the smallest remaining backend-free slices - not a sign the declared
  split doesn't hold.)
