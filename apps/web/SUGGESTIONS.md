# UI/UX Review - SUGGESTIONS.md

A professional design audit of the MVP shell (DF-02 state, commit `0238265`), grounded in live
inspection of both themes at desktop/tablet/mobile widths, computed-style measurements, and an
audit of the compiled CSS - not taste alone. Items are ordered by priority; each states the
problem, the evidence, and the fix. Token changes belong in `src/index.css` +
`tailwind.config.js` and must stay in sync with `docs/references/design-system.md`.

---

## P0 - The color system is silently broken (root cause of "unclean")

The single biggest reason the UI reads as unclean/incorrect is not the palette itself - it's that
**most of the intended tonal hierarchy never renders**. Fix this first; re-judge the palette after.

### 1. Alpha modifiers on theme colors compile to nothing - ✅ Done

Every Tailwind class that applies an opacity modifier to one of our custom tokens
(`text-foreground/70`, `text-muted-foreground/40`, `bg-primary/10`, `bg-accent/40`,
`border-border/50`, ...) generates **no CSS at all**. Tailwind v3 cannot apply `/NN` to colors
defined as plain `var(--x)` strings - it needs an `<alpha-value>` placeholder. Audit of the
production bundle: the only compiled alpha-modified class in the entire app is `bg-black/50`
(default palette). Measured consequences, dark theme:

- Selected tree row (`bg-primary/10`): computed `rgba(0,0,0,0)` - **selection is invisible**.
- Table row hover (`hover:bg-accent/40`) and inactive tab hover (`hover:bg-accent/50`): dead -
  **no hover feedback** on data rows or tabs.
- Tree text (`text-foreground/70`), chevrons (`text-muted-foreground/60`), row numbers
  (`text-muted-foreground/30`), cell text (`text-foreground/80`), `null` styling, breadcrumb
  prefix, status-bar text: all render at whatever color they inherit - the designed
  four-step text hierarchy collapses to one or two accidental levels.

**Fix (one change restores everything):** define the tokens as raw RGB triplets and register them
with `<alpha-value>`:

```css
/* index.css */
--primary: 74 158 255; /* was #4a9eff */
```

```js
/* tailwind.config.js */ primary: "rgb(var(--primary) / <alpha-value>)";
```

Do this for every color token (both themes). Keep `rgba()` border tokens as dedicated variables
(see item 2). The `--c-*` accent set can stay hex if it is never used with modifiers - but
converting it too removes the `color-mix()` workarounds in `schema-tree.tsx`.

**Done:** `index.css`/`tailwind.config.js` now define every color token as an `R G B` triplet
registered via `rgb(var(--x) / <alpha-value>)`. Verified in the compiled bundle - `bg-primary/10`,
`text-foreground/70`, `hover:bg-accent/40`, etc. all generate real `rgb(var(--x) / .N)` rules now;
confirmed live that the selected tree row and table row hover are visible. The two bare
`var(--muted-foreground)` inline-style usages (status dot colors) were updated to
`rgb(var(--muted-foreground))` since they're no longer complete color values on their own.

### 2. Dark-mode borders render as light gray-200 - ✅ Done

Because `border-border/50` is dead (item 1), table row separators fall through to Tailwind
preflight's hardcoded default `#e5e7eb` - measured on `<tr>`: `rgb(229,231,235)` at full
strength. On a `#0a0d12` background that is a glaring light line; it's most of why the Tables tab
looks harsh in dark mode. (In light mode it accidentally passes as a plausible border, which is
why light feels cleaner.) After fixing item 1, sweep every `border-*` width class and confirm it
has a live color source; consider setting preflight's default border color to `var(--border)`
via a `@layer base` rule so nothing can fall through to gray-200 again.

**Done:** added a dedicated `--border-subtle` token (a fixed, softer hairline alpha per theme,
not a re-modifiable one - `border`/`sidebar-border` intentionally stayed as fixed-alpha `rgba()`
strings rather than joining the triplet system, since a bare `border-border` with no modifier
would otherwise default to fully opaque). Replaced every `border-border/40`/`border-border/50`
callsite with `border-border-subtle`. Verified live: `<tr>` border now computes to
`rgba(255,255,255,0.03)` in dark mode, not `rgb(229,231,235)`.

### 3. Dark `--muted-foreground` fails WCAG AA - ✅ Done

Measured: `#5a6880` on background `#0a0d12` ≈ **3.4:1** (AA for normal text requires 4.5:1) - and
it's used for real content: type labels, timestamps, placeholders, status bar, empty states.
Raise dark `--muted-foreground` to ~`#7f8ea6` (≈5.9:1 on background, ≈5.7:1 on card). Light
mode's `#64748b` on `#f5f6f8` ≈ 4.35:1 - just under the line; darken to ~`#5b6b80` (≈4.9:1).

**Done:** both themes updated to exactly these values (as RGB triplets: dark `127 142 166`,
light `91 107 128`).

### 4. Rebuild the text ladder with intent (after items 1-3)

Once alpha works, do not reinstate the old six accidental steps (`/25 /30 /40 /50 /60 /70`).
Define exactly three roles and use them consistently:

- **Data** (cell values, tree names, SQL text): full `foreground`. The data is the product in a
  DB tool - never render it muted or at reduced alpha.
- **Secondary** (labels, types, timestamps, counts): `muted-foreground`, AA-compliant per item 3.
- **Tertiary** (line numbers, placeholder glyphs, disabled): `muted-foreground/60` - and nothing
  the user must read may use it.

---

## P1 - Hierarchy, surfaces, empty states

### 5. Tables tab: the type sub-header doesn't align with its columns

The `# integer PK / T text / T text` strip is a separate flex row of fixed `min-w-[120px]` cells
above the real `<table>`; actual columns are content-sized, so the labels drift away from their
columns at any realistic width (clearly visible at 1400px). Move type + PK into the real
`<thead>` as a second line inside each `<th>` (name on top, `icon type PK` beneath). Guaranteed
alignment, and the grid gains a single coherent header.

### 6. Frame the data grid

The grid floats inside the content padding with borders that stop mid-air (no outer frame,
footer band ends abruptly). Either (a) make the Tables tab full-bleed - drop the content-area
`p-3/p-4` for this tab so the grid runs edge-to-edge like a real data grid (recommended; matches
the source design), or (b) wrap grid + footer in one `border border-border rounded-md
overflow-hidden` container. Also right-align numeric columns (`TypeIcon`'s classifier already
knows which are numeric).

### 7. The dark canvas is a void

An empty SQL editor stretches a near-black `#0a0d12` plane across the whole viewport with one
line of text in the corner. Give the first-run editor a real empty state below the textarea:
one-line hint ("Press ⌘↵ to run - read-only") plus 2-3 clickable sample-query chips built from
the connected schema (e.g. `SELECT * FROM humb_demo_users LIMIT 10`). Cheap, and turns the void
into an on-ramp.

### 8. Placeholder tabs deserve real empty states

Files, Console, and both "Select a table from the sidebar" messages are a bare sentence in the
top-left corner. Use one centered empty-state pattern everywhere: muted icon (the tab's own
icon), short title, one-line hint - e.g. Files: "File browsing arrives with DF-06" under a
`FolderOpen`. Consistency here is what makes placeholders read as intentional rather than broken.

### 9. Light theme: surfaces are almost indistinguishable

`--sidebar #eff1f4` vs `--background #f5f6f8` vs `--card #ffffff` with `rgba(0,0,0,0.08)`
hairlines - the shell regions blur together. Pick one lever: raise light `--border` to
`rgba(0,0,0,0.12)` (and `--sidebar-border` to `0.10`), or push `--sidebar` down to ~`#e9ecf0`.
Don't do both, and re-check dark (`rgba(255,255,255,0.06)` is fine once item 2 stops gray-200
from leaking).

### 10. Connection breadcrumb is noise

The title bar spends ~40 characters on `postgres://postgres:***@localhost:55432` and the tree
root repeats it. Show `localhost:55432 › postgres` (host:port › database) with the full redacted
target in a `title` tooltip; for SQLite show the filename with the directory in the tooltip. Same
treatment for the tree's root node.

---

## P2 - Interaction & accessibility polish

### 11. Tree row hover brightening never fires from the row

`hover:text-foreground` sits on the inner `<span>`, so it only triggers when the pointer is over
the glyphs themselves, not the row. Put `group` on the row and `group-hover:text-foreground` on
the span (the source design does exactly this).

### 12. Keyboard focus is invisible

Only the two search inputs have a focus ring. Tabs, tree rows, icon buttons, pagination, and
sortable headers have no `focus-visible` style at all. Add a shared
`focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring` treatment to every
interactive element - a keyboard user currently cannot see where they are.

### 13. Sortable headers aren't accessible controls

`<th onClick>` - not focusable, no `aria-sort`, no keyboard activation. Render a `<button>`
inside the `<th>` and set `aria-sort` on the `<th>`; you get focus, Enter/Space, and screen-reader
sort state for free.

### 14. Touch targets are too small on mobile

Icon buttons are `p-1`/`p-1.5` (~22-26px) and row checkboxes are 12px - the guideline is ~44px.
On `max-md`, enlarge padding on the title-bar/toolbar icon buttons and give checkboxes a padded
hit area (visual size can stay).

### 15. Icon-only buttons need tooltips

Theme, refresh, settings, export-CSV, refresh-rows, collapse/expand have `aria-label`s but no
`title` - sighted users get no hint. Add `title` mirroring each `aria-label`.

### 16. Selection affordance is one weak tint - partially done

Even once `bg-primary/10` compiles (item 1), a 10% tint is barely visible on `#0d1219`. Pair it
with a 2px `primary` left accent bar on the selected tree row (and keep the tint for selected
table rows). Selection should survive a squint test.

**Partially done:** item 1's fix makes the tint actually render (verified live, non-transparent
now) - confirmed visible without a squint in Preview screenshots. The left accent bar itself is
not added yet.

### 17. Radius scale drift

Components mix `rounded-[2px]`, `rounded-[3px]`, and token classes (`rounded-md` = 2px,
`rounded-lg` = 4px). Replace all arbitrary radius values with the token scale from
`design-system.md` - `rounded-md` for small chips/buttons, `rounded-lg` for containers.

### 18. Theme bootstrapping ignores the OS

With no stored choice the app is always dark. Respect `prefers-color-scheme: light` when
`localStorage` has no `humb-theme` (one condition in the `index.html` inline script + the hook's
initial state). Dark remains the default for OS-dark and no-signal users.

### 19. Mobile status bar is nearly empty

Below `sm` everything except "connected" is hidden, leaving a dead strip. Keep engine + schema
visible on phones (they're short); drop `UTF-8` and the query timer instead.

### 20. Tab overflow has no affordance

On narrow screens the tab strip scrolls but nothing indicates more tabs exist (Console clips
off-screen). Add a fade-out gradient on the overflowing edge, or shrink labels to icons-only
below `sm` (all five tabs then fit statically).

### 21. Style the scrollbars

Default OS scrollbars (bright track in dark mode) appear in the tree, grid, and editor. Add thin
overlay scrollbars (`::-webkit-scrollbar` 8px + `scrollbar-width: thin`, thumb
`muted-foreground/30` once alpha works) - an IDE-density UI needs quiet scrollbars.

---

## Verification after implementing

- Re-run the P0 measurements: selected-row background non-transparent, `<tr>` border color equals
  `var(--border)` (not `rgb(229,231,235)`), muted-foreground contrast ≥ 4.5:1 in both themes.
- `pnpm check` + `pnpm test:e2e` / `pnpm test:e2e:full`, plus a Preview pass in both themes at
  desktop/tablet/mobile - same protocol as DF-02's sign-off.

## Removal rule

This file is a working checklist, not documentation - durable design decisions belong in
`docs/references/design-system.md`. **When every item above is either implemented or explicitly
rejected (with a one-line reason in the PR description), delete this file (`git rm
apps/web/SUGGESTIONS.md`) in the same commit that completes the final item.** It must not
outlive the work it describes.
