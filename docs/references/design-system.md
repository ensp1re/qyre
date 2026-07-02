# Design System

Source: Figma Make export at `github.com/ensp1re/UserDashboard` (private), generated from
`figma.com/design/5ZS5L8NXHrmZxnIR3bhTYY/User-dashboard`. Captured 2026-07-02.

The source design is a VS Code-style Postgres/SQL IDE - title bar, collapsible searchable sidebar
tree, a tab bar (SQL Editor / Tables / Schema / Files / Console), and a status bar. It is Humb's
target UI, not a generic dashboard: every panel maps onto a real Humb concept (connection tree ->
`DatabaseOverview`, Tables tab -> `RowsTable`, Schema tab -> `TableMetadata` across all tables, SQL
Editor -> the read-only query runner). See `docs/product-specs/dashboard-ui.md` for the product
contract and `docs/exec-plans/active/0003-dashboard-ui.md` for the DF-## work breakdown.

Stack in the source: React + Vite, Tailwind v4 (CSS-first `@theme inline`), shadcn/ui components on
Radix primitives, `lucide-react` icons, `class-variance-authority` for variants. Humb's `apps/web`
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
Both themes below must exist; **dark is the primary/default theme** for this product (it's a
developer tool, per the earlier suggestions in `.local/suggestions.md`).

| Token                        | Light                 | Dark                     | Use                                             |
| ---------------------------- | --------------------- | ------------------------ | ----------------------------------------------- |
| `background`                 | `#f5f6f8`             | `#0a0d12`                | page background                                 |
| `foreground`                 | `#1a1d23`             | `#cdd6e4`                | default text                                    |
| `card`                       | `#ffffff`             | `#10151c`                | panel/card surfaces                             |
| `popover`                    | `#ffffff`             | `#161d27`                | popovers/menus                                  |
| `primary`                    | `#2563eb`             | `#4a9eff`                | primary actions, links, active states           |
| `primary-foreground`         | `#ffffff`             | `#0a0d12`                | text on `primary`                               |
| `secondary`                  | `#eef0f3`             | `#161d27`                | secondary surfaces                              |
| `muted` / `muted-foreground` | `#eef0f3` / `#64748b` | `#161d27` / `#5a6880`    | de-emphasized text/surfaces                     |
| `accent`                     | `#e8eaed`             | `#1a2535`                | hover states                                    |
| `destructive`                | `#dc2626`             | `#e05c6a`                | delete/error actions                            |
| `border`                     | `rgba(0,0,0,0.08)`    | `rgba(255,255,255,0.06)` | hairlines                                       |
| `sidebar`                    | `#eff1f4`             | `#0d1219`                | sidebar background (distinct from `background`) |
| `sidebar-accent`             | `#e4e6ea`             | `#161d27`                | sidebar hover                                   |

**Semantic accent colors** (`--c-*`) - used for data-type icons, status dots, badges, syntax
highlighting - not part of shadcn's default token set, specific to this design:

| Token        | Light     | Dark      | Use                                                                     |
| ------------ | --------- | --------- | ----------------------------------------------------------------------- |
| `--c-green`  | `#16a34a` | `#4fc46a` | connected/success, boolean `true`, numeric literals in SQL highlighting |
| `--c-amber`  | `#b45309` | `#e09a40` | numeric/id columns, PK badges, warnings                                 |
| `--c-purple` | `#7c3aed` | `#c47eff` | admin/role badges, SQL keyword highlighting                             |
| `--c-blue`   | `#2563eb` | `#4a9eff` | string/varchar columns, FK badges, links (same as `primary`)            |
| `--c-red`    | `#dc2626` | `#e05c6a` | errors, destructive (same as `destructive`)                             |

Chart colors (`--chart-1..5`) mirror `--c-blue/green/amber/purple/red` in that order - use them if a
chart/graph is ever added rather than inventing new hues.

## Radius & spacing

- Base radius: `0.25rem` (4px) - notably small/tight, not shadcn's default `0.625rem`. Derived
  scale: `sm = radius - 4px` (effectively 0), `md = radius - 2px` (2px), `lg = radius` (4px),
  `xl = radius + 4px` (8px).
- Density is tight throughout: `px-3 py-1.5` / `px-2 py-1` on most interactive rows, `text-[11px]`
  or `text-[10px]` (below Tailwind's default `text-xs`) for secondary/metadata text. This is
  deliberate - an IDE, not a marketing page. Don't default to shadcn's roomier out-of-the-box sizing.

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
  `ColumnMetadata.dataType` from `@humbdb/core` is engine-reported (`information_schema`/`PRAGMA`
  text), not a single Humb-normalized enum, so the type-icon helper does its own prefix matching
  per engine's naming (`int*`/`numeric*` etc. for Postgres, `INTEGER`/`REAL` etc. for SQLite) -
  document any per-engine special-casing right next to that helper, don't scatter it.
- **Status/connection dot**: a filled `Circle` (green when connected) rather than a text badge in
  chrome-level UI (title bar, status bar); `StatusBadge` (`@humbdb/ui`) remains the right component
  for the more prominent "Database connection" panel state.
- Search-and-highlight in the sidebar tree: matched substrings wrapped in `<mark>` with a tinted
  `--c-blue` background - matching nodes force their ancestor path open.

## Explicitly out of scope for this design system

- Any control implying a write/mutation (the source mock's "Add row" button, row-selection
  checkboxes as a bulk-edit affordance) - Humb is read-only (`docs/PRODUCT_SENSE.md`,
  `docs/SECURITY.md`). Port the surrounding UI, drop or repurpose write-shaped controls; never wire
  them to a real mutating action.
