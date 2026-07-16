# FRONTEND.md

Stable frontend expectations so agents do not invent UI patterns unpredictably. See
[`apps/web/STRUCTURE.md`](apps/web/STRUCTURE.md) for the detailed folder structure and its growth
path (feature-based organization once the app outgrows its current flat `api/`/`hooks/` shape).

## Stack

- React + Vite + TypeScript.
- TanStack Router for routing, TanStack Query for server-state/data fetching.
- Tailwind CSS for styling, with a small shadcn-style reusable component layer in `packages/ui`.
- All data comes from Qyre's local HTTP API. The UI never accesses databases directly.

## UI principles

- Optimize for clarity before novelty. This is a developer tool; legibility wins.
- Compose the application as a database IDE: flush panes, docked tabs, compact contextual command
  bars, and hairline partitions. Do not wrap workspace panes in page gutters, rounded cards, or a
  marketing-style global header/footer.
- Keep interaction flows discoverable and restartable.
- Prefer a small number of reusable components in `packages/ui` over one-off variants.
- Accessibility checks are part of normal verification, not polish work.

## Workspace shell contract

- The database explorer and workspace are the two primary regions. Connection identity/status sits
  in the explorer footer; global actions sit at the end of the workspace tab strip.
- Workspace tabs are 36px high and dock directly to their pane. Context/view bars and command bars
  are 32px high. Tree rows and compact commands are 24-28px high.
- Use a 4px spacing rhythm inside related command groups and an 8px rhythm or hairline separator
  between groups. Chrome labels use Geist; raw values, code, identifiers, and data use JetBrains
  Mono.
- Use Lucide outline icons consistently: roughly 12px in trees/type metadata, 13px for pane
  commands, and 14px for workspace actions. Icon-only controls require accessible names.
- `CommandToolbar` owns desktop command-bar semantics and Left/Right/Home/End navigation. Put
  frequent and contextual actions on the bar; put low-frequency actions in a labelled overflow.
- Trees and tabs use roving focus plus conventional Arrow/Home/End behavior. Keep a skip link to the
  main workspace and visible token-driven focus states.
- SQL results, plans, and errors remain docked to the editor behind output tabs; do not replace the
  workspace with result pages or modal output. Settings uses a category rail plus a horizontally
  centered preference column with a small top inset and flat rows, never a centered stack of cards.
- Non-empty SQL result sets expose compact CSV/JSON download actions directly above the result grid;
  empty and affected-row-only responses do not reserve an empty toolbar.

## Driver-aware UI

- Start from shared `@qyre/core` metadata/capabilities, not ad hoc engine-name checks in view code.
  Driver-specific differences belong in shared classifiers or capability maps.
- Postgres, MySQL, SQLite, and MongoDB should share interaction grammar—selection, edit, filter,
  validation, commit, and error recovery—while preserving their real type semantics.
- Table search has two explicit scopes: typing previews against the loaded page; Enter commits a
  whole-table search. Show transient progress in the field, reset pagination, and use exact server
  matching totals whenever a filter or whole-table search is active.
- Long primitive values stay visually flat in grids. Double-click or Enter/F2 opens the shared
  read-only value inspector in both Tables and SQL query results.
- Type-aware controls must degrade safely: unknown/driver-specific types use a neutral icon and a
  reversible text/full-value editor rather than an invented coercion.
- Mutation controls appear only when grants, table capabilities, and the hard `--read-only`
  override allow them. Disabled or absent actions must never imply that a write will succeed.

## Required user-facing states

Every data-driven view must explicitly handle:

- empty
- loading
- success
- error (with a recoverable retry path)

## Guardrails

- Reusable, presentation-only components live in `packages/ui`, one component per file grouped into
  cohesive families under `src/<family>/` (shadcn-style; see
  [`docs/CODE_ORGANIZATION.md`](docs/CODE_ORGANIZATION.md)). App-specific composition lives in
  `apps/web` (`api/` fetchers, `hooks/`, then composition components).
- `packages/ui` must not fetch data or import server/driver packages. It may import `@qyre/core` for
  shared domain types a component's props genuinely represent (e.g. `ConnectionStatus`).
- Document the design system / component conventions in [`docs/references/`](docs/references/).
- Keep copy, keyboard behavior, and visual hierarchy consistent across flows.
- When a UI bug is fixed, add or update the matching validation step (unit or E2E).

## Verification expectations

- Capture evidence for critical user journeys (see [`docs/RELIABILITY.md`](docs/RELIABILITY.md)).
- The full connect-and-inspect journey is validated with Playwright.
- If visual regressions become common, standardize screenshot or DOM checks.
