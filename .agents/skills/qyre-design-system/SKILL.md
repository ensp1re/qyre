---
name: qyre-design-system
description: Use whenever writing or changing UI code in apps/web or packages/ui - choosing colors, fonts, spacing, icons, or component patterns. Points to the actual token source so the design stays consistent as the project scales, instead of each session re-deriving or guessing values.
---

# Qyre Design System

Full detail lives in [`docs/references/design-system.md`](../../../docs/references/design-system.md)
(colors for both themes, typography, density, shell geometry, and component patterns) and
[`FRONTEND.md`](../../../FRONTEND.md) (frontend architecture and implementation guardrails). Read
the reference before writing UI code; this file is only fast recall.

## Fast recall

- Fonts: **Geist** (sans, UI chrome) + **JetBrains Mono** (data/code/tree/status bar - used far more
  than sans in this product). Base size `13px`.
- Colors are semantic tokens (`bg-background`, `text-muted-foreground`, `var(--c-blue)`, ...), never
  raw hex in component code. Both light and dark themes exist; **dark is the default/primary theme**.
- Radius is small and tight (`0.25rem` base) - this is a dense IDE, not a marketing page. Don't reach
  for shadcn's roomier default sizing.
- The shell is flush and border-partitioned: sidebar beside workspace, tabs docked to content,
  contextual command bars above panes. No page gutters, floating panel cards, global website
  header, or global status footer around the workspace.
- Chrome geometry: 36px workspace tabs, 32px contextual bars, 24px tree rows, 24-28px desktop
  commands. Use 4px within command groups and 8px between groups.
- Icons are Lucide outline icons: 12px for tree/type context, 13px for pane commands, and 14px for
  global actions, normally at `strokeWidth={1.8}`.
- Type-column icons have a fixed color mapping (numeric=amber `Hash`, text=blue `Type`,
  boolean=green `ToggleLeft`, date=purple `Calendar`) - reuse it everywhere a column's data type is
  shown, don't invent a second mapping.

## Rules

- The actual token source of truth is `docs/references/design-system.md`, not this file and not
  memory of a past session - re-read it if a value is needed and isn't in the fast-recall section
  above, rather than guessing or reusing whatever a previous unrelated component happened to use.
- New shadcn/Radix primitives (Button, Tabs, ScrollArea, Tooltip, DropdownMenu, ...) belong in
  the shared `packages/ui` package, grouped by their real responsibility as that package is
  reorganized. Add one only when a real consumer needs it, not speculatively (see
  `CODE_ORGANIZATION.md` and `AGENTS.md`'s simplicity-first rule).
- Group presentation components under responsibility-based folders when the current flat directory
  becomes hard to navigate. Folder names must follow actual ownership, not examples from the
  organization guide; tests mirror the chosen structure under `packages/ui/tests/`.
- Use `CommandToolbar`/`CommandGroup`/`CommandSeparator` for dense pane actions. Keep frequent and
  contextual actions visible; move low-frequency transfer/utility actions into a labelled overflow
  menu. A selection replaces normal row actions with selection context instead of adding a second
  toolbar.
- In data grids, search typing is page-local and Enter commits whole-table scope; show progress in
  the search control while fetching and exact matching totals in the footer. Long plain text stays visually flat
  and opens the shared read-only inspector on double-click or Enter/F2.
- Sidebar trees use compact rows, precise indentation, subtle branch-connected guide lines, a strong selected-row
  surface plus a 2px primary inset, roving keyboard focus, and Arrow/Home/End navigation. Connection
  identity and status belong in the sidebar footer, not a duplicated page header/footer.
- SQL output stays docked below the editor and uses keyboard-roving Results/Plan/Messages tabs;
  non-empty result sets expose compact CSV/JSON downloads and empty results expose no action bar.
  Settings uses a persistent category rail and a horizontally centered column of flat preference
  rows with a small top inset, not centered website cards.
- Qyre supports role-aware writes. Render mutation controls only when connected-user grants,
  adapter capabilities, table permissions, and the hard `--read-only` override permit them. Visual
  consistency must never weaken those gates.
- Preserve semantic parity across Postgres, MySQL, SQLite, and MongoDB while allowing each driver's
  real types and capabilities to choose the editor/filter affordance. Unknown types get a safe text
  representation and neutral icon; never guess a destructive conversion.
- If a design decision isn't covered by the reference doc (a new component type, a color not in the
  token table), treat it as a spec gap the same way `PRODUCT_SENSE.md` says to - ask or note the
  assumption, don't silently invent a token.
