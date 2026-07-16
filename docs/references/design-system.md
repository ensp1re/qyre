# Design System

Source: Figma Make export at `github.com/ensp1re/UserDashboard` (private), generated from
`figma.com/design/5ZS5L8NXHrmZxnIR3bhTYY/User-dashboard`. Captured 2026-07-02.

The source design is a VS Code-style Postgres/SQL IDE - title bar, collapsible searchable sidebar
tree, a tab bar (SQL Editor / Tables / Schema / Files / Console), and a status bar. It is Qyre's
target UI, not a generic dashboard: every panel maps onto a real Qyre concept (connection tree ->
`DatabaseOverview`, Tables tab -> `RowsTable`, Schema tab -> `TableMetadata` across all tables, SQL
Editor -> the read-only query runner). See `docs/product-specs/dashboard-ui.md` for the product
contract and `docs/exec-plans/active/0003-dashboard-ui.md` for the DF-## work breakdown.

Stack in the source: React + Vite, Tailwind v4 (CSS-first `@theme inline`), shadcn/ui components on
Radix primitives, `lucide-react` icons, `class-variance-authority` for variants. Qyre's `apps/web`
already has Tailwind v3 scaffolded (unused until this design landed) - tokens below are translated
to v3 config + CSS custom properties, not copy-pasted v4 syntax.

## Typography

- **Sans**: Geist (weights 300/400/500/600) - UI chrome, labels, buttons.
- **Mono**: JetBrains Mono (weights 300/400/500/600, italic 400) - this is a **monospace-heavy**
  developer tool. Table data, SQL, file trees, the sidebar tree, and the status bar are almost all
  `font-mono`. Default to mono for anything showing raw data or code; sans only for UI chrome labels.
- Base font size: `13px` (not the browser default `16px` - this is a dense, IDE-like UI).
- Font weights used: 400 (normal), 500 (medium, the default for headings/labels/buttons - see
  `--font-weight-medium` below).
- Load via Google Fonts: `Geist:wght@300;400;500;600` and
  `JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;1,400`.

## Color tokens

Semantic tokens, not raw hex, in component code - `bg-background`, `text-muted-foreground`, etc.
Both themes below must exist; **dark is the primary/default theme** for this developer tool.

| Token                        | Light                 | Dark                      | Use                                             |
| ---------------------------- | --------------------- | ------------------------- | ----------------------------------------------- |
| `background`                 | `#f3f5f7`             | `#222632`                 | page/editor background                          |
| `foreground`                 | `#242a33`             | `#e4e8ef`                 | default text                                    |
| `card`                       | `#fafbfc`             | `#272b37`                 | panel and chrome surfaces                       |
| `popover`                    | `#ffffff`             | `#353a48`                 | elevated menus and popovers                     |
| `primary`                    | `#3e6c96`             | `#8db8df`                 | primary actions, links, active states           |
| `primary-foreground`         | `#ffffff`             | `#18202a`                 | text on `primary`                               |
| `secondary`                  | `#e9edf2`             | `#2c313d`                 | secondary and input surfaces                    |
| `muted` / `muted-foreground` | `#e9edf2` / `#4d5c6e` | `#2c313d` / `#b2bac7`     | de-emphasized text/surfaces                     |
| `quiet-foreground`           | `#586678`             | `#9ca7b8`                 | secondary metadata and placeholders             |
| `accent`                     | `#e2e8f0`             | `#323a49`                 | hover and selected-row surfaces                 |
| `destructive`                | `#a93b46`             | `#df858c`                 | delete/error actions                            |
| `border`                     | `rgba(27,39,53,0.10)` | `rgba(255,255,255,0.09)`  | hairlines                                       |
| `border-subtle`              | `rgba(27,39,53,0.05)` | `rgba(255,255,255,0.045)` | dense grid and repeated-row separators          |
| `sidebar`                    | `#eceff3`             | `#292d37`                 | sidebar background (distinct from `background`) |
| `sidebar-accent`             | `#dde3ea`             | `#323a49`                 | sidebar hover and selected tree rows            |
| `sidebar-border`             | `rgba(27,39,53,0.08)` | `rgba(255,255,255,0.075)` | sidebar partition                               |

The dark palette is a midtone navy ramp, not a near-black or graphite-gray stack. The editor remains
the deepest large surface, while chrome and the sidebar lift enough to establish hierarchy before
an interaction occurs. Inputs, active rows, and popovers step progressively brighter without
becoming gray cards. This follows the visible strategy in Codex: the workspace stays dark, but large
surfaces retain enough luminance and separation that the interface does not collapse into one black
plane. The sidebar is intentionally lighter than the editor canvas, and the `#222632` base has
nearly twice the relative luminance of the previous `#181a20`.

Research references:

- [Cursor product screenshot](https://cursor.com/changelog/0-48-x): a continuous blue-black
  workspace with subtle input/popover lift and sparse borders.
- [Cursor theme documentation](https://cursor.com/docs): Cursor inherits VS Code's theming model
  rather than imposing a highly segmented custom surface ramp.
- [Codex product interface](https://openai.com/codex/): large continuous canvases, sparse
  separators, and hierarchy carried primarily by content rather than card color.

CSS stores every solid color as an `R G B` triplet so Tailwind opacity modifiers keep working;
fixed-alpha hairlines remain complete `rgba()` values by design.

`quiet-foreground` replaces opacity-modified text colors. Its light value retains at least 4.76:1
contrast and its dark value at least 4.53:1 across every solid surface above, including accent and
sidebar-accent. `muted-foreground` is the slightly more prominent secondary level. Keep hierarchy
through these semantic levels, type size, weight, italics, or placement; do not reduce a foreground
token's opacity below WCAG AA contrast.

**Semantic accent colors** (`--c-*`) - used for data-type icons, status dots, badges, syntax
highlighting - not part of shadcn's default token set, specific to this design:

| Token        | Light     | Dark      | Use                                                                     |
| ------------ | --------- | --------- | ----------------------------------------------------------------------- |
| `--c-green`  | `#1f6f43` | `#72be8a` | connected/success, boolean `true`, numeric literals in SQL highlighting |
| `--c-amber`  | `#8e5b1d` | `#d8ae68` | numeric/id columns, PK badges, warnings                                 |
| `--c-purple` | `#7354a3` | `#ad9acf` | admin/role badges, SQL keyword highlighting                             |
| `--c-blue`   | `#2f6794` | `#7fa5cb` | string/varchar columns, FK badges, links                                |
| `--c-red`    | `#a93b46` | `#df858c` | errors and destructive status text                                      |

Chart colors (`--chart-1..5`) mirror `--c-blue/green/amber/purple/red` in that order - use them if a
chart/graph is ever added rather than inventing new hues.

## Radius & spacing

- Base radius: `0.25rem` (4px) - notably small/tight, not shadcn's default `0.625rem`. Derived
  scale: `sm = radius - 4px` (effectively 0), `md = radius - 2px` (2px), `lg = radius` (4px),
  `xl = radius + 4px` (8px).
- Density is tight throughout: `px-3 py-1.5` / `px-2 py-1` on most interactive rows, `text-[11px]`
  or `text-[10px]` (below Tailwind's default `text-xs`) for secondary/metadata text. This is
  deliberate - an IDE, not a marketing page. Don't default to shadcn's roomier out-of-the-box sizing.

## Motion and surface polish

- Buttons, links, inputs, tabs, tree rows, menu items, options, and comboboxes transition color,
  background, border, shadow, and opacity over `150ms` with the standard ease-in-out curve. Avoid
  `transition-all`: layout and transform changes should only animate when a component explicitly
  owns that behavior.
- Focus-visible state is a one-pixel `ring` outline with a one-pixel offset. Mouse interaction does
  not show it; keyboard focus always does.
- Inputs use the primary token for the caret and softly strengthen their border on hover. Text
  selection uses a low-opacity primary background rather than the browser's saturated default.
- Body text uses antialiased/grayscale font smoothing and optimized legibility.
- Scrollbars are eight pixels wide, transparent-track, and use a padded pill thumb derived from
  `muted-foreground`; hover raises thumb opacity without introducing a new color.
- `prefers-reduced-motion: reduce` collapses these global transition durations.

## Component patterns observed in the source

- **shadcn/ui on Radix primitives** (`@radix-ui/react-*` + `class-variance-authority` + `clsx` +
  `tailwind-merge`'s `cn()` helper) is the base component layer - not custom one-off components.
  Bring in primitives (Button, Tabs, ScrollArea, Tooltip, DropdownMenu, etc.) as they're actually
  needed by a `DF-##` slice, not speculatively - see `docs/product-specs/dashboard-ui.md`.
- **Icons**: `lucide-react`, sized 10-13px in most contexts (small!), colored via the semantic
  `--c-*` tokens above rather than fixed classes, so they theme correctly.
- **Type icons** for columns: `Hash` (amber) for numeric, `Type` (blue) for text,
  `ToggleLeft` (green) for boolean, `Calendar` (purple) for date/timestamp - a small `TypeIcon`
  helper keyed off the column's `dataType` string. Reuse this exact color mapping wherever a
  column's data type is shown (table headers, schema view, query results).
  `ColumnMetadata.dataType` from `@qyre/core` is engine-reported (`information_schema`/`PRAGMA`
  text), not a single Qyre-normalized enum, so the type-icon helper does its own prefix matching
  per engine's naming (`int*`/`numeric*` etc. for Postgres, `INTEGER`/`REAL` etc. for SQLite) -
  document any per-engine special-casing right next to that helper, don't scatter it.
- **Status/connection dot**: a filled `Circle` (green when connected) rather than a text badge in
  chrome-level UI (title bar, status bar); `StatusBadge` (`@qyre/ui`) remains the right component
  for the more prominent "Database connection" panel state.
- Search-and-highlight in the sidebar tree: matched substrings wrapped in `<mark>` with a tinted
  `--c-blue` background - matching nodes force their ancestor path open.

## Shared control contract

Qyre's compact Button, IconButton, Field, Select/Combobox, and editor-action primitives live in
`packages/ui`; feature components compose them instead of restating padding, radii, disabled
opacity, focus rings, loading treatment, or icon sizing. Buttons support primary, secondary,
outline, ghost, and destructive intent at the dense 11px control size. Icon-only controls require
an accessible label and retain a practical pointer target without visually inflating the IDE chrome.

Select/Combobox is themed application UI, never the browser's default `<select>`. Its trigger uses
labelled combobox semantics and its portalled popup uses listbox/option semantics, viewport
collision handling, scrolling, disabled options, typeahead, Arrow keys, Home/End, Enter, Escape,
and focus restoration. A native select remains acceptable only in non-interactive generated
documents, never in the web application.

Mutation editors use these same controls. Validation is associated with its field through
`aria-describedby`/`aria-invalid`; destructive and loading states use semantic variants rather than
one-off colors. Full-value JSON/array/EJSON editors provide a monospace editing surface, explicit
Format and Apply actions, error location, and visible original/draft values.

## Mutation guardrail

Qyre now supports role-aware writes. Mutation controls render only when connected-user grants,
table permissions, and the hard `--read-only` override all allow the action. The design system owns
their visual and interaction consistency; it never weakens those capability gates or turns a
disabled write into an optimistic client-side assumption.
