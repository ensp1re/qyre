---
name: qyre-design-system
description: Use whenever writing or changing UI code in apps/web or packages/ui - choosing colors, fonts, spacing, icons, or component patterns. Points to the actual token source so the design stays consistent as the project scales, instead of each session re-deriving or guessing values.
---

# Qyre Design System

Full detail lives in [`docs/references/design-system.md`](../../../docs/references/design-system.md)
(colors for both themes, typography, radius/spacing, component patterns) and
[`docs/product-specs/dashboard-ui.md`](../../../docs/product-specs/dashboard-ui.md) (product scope,
what's in vs. out for the redesign). Read the reference doc before writing UI code; this file is
just the fast-recall summary plus the rules `FRONTEND.md` doesn't already state.

## Fast recall

- Fonts: **Geist** (sans, UI chrome) + **JetBrains Mono** (data/code/tree/status bar - used far more
  than sans in this product). Base size `13px`.
- Colors are semantic tokens (`bg-background`, `text-muted-foreground`, `var(--c-blue)`, ...), never
  raw hex in component code. Both light and dark themes exist; **dark is the default/primary theme**.
- Radius is small and tight (`0.25rem` base) - this is a dense IDE, not a marketing page. Don't reach
  for shadcn's roomier default sizing.
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
- Any control that implies a write/mutation (bulk edit, "add row", delete) is out of scope - Qyre is
  read-only. Port the surrounding visual pattern, drop or neuter the control; never wire it to a
  real mutating action. See `docs/SECURITY.md` / `docs/PRODUCT_SENSE.md`.
- If a design decision isn't covered by the reference doc (a new component type, a color not in the
  token table), treat it as a spec gap the same way `PRODUCT_SENSE.md` says to - ask or note the
  assumption, don't silently invent a token.
