# FRONTEND.md

Stable frontend expectations so agents do not invent UI patterns unpredictably.

## Stack

- React + Vite + TypeScript.
- TanStack Router for routing, TanStack Query for server-state/data fetching.
- Tailwind CSS for styling, with a small shadcn-style reusable component layer in `packages/ui`.
- All data comes from Humb's local HTTP API. The UI never accesses databases directly.

## UI principles

- Optimize for clarity before novelty. This is a developer tool; legibility wins.
- Keep interaction flows discoverable and restartable.
- Prefer a small number of reusable components in `packages/ui` over one-off variants.
- Accessibility checks are part of normal verification, not polish work.

## Required user-facing states

Every data-driven view must explicitly handle:

- empty
- loading
- success
- error (with a recoverable retry path)

## Guardrails

- Reusable, presentation-only components live in `packages/ui`. App-specific composition lives in
  `apps/web`.
- `packages/ui` must not fetch data or import server/adapter packages.
- Document the design system / component conventions in [`docs/references/`](docs/references/).
- Keep copy, keyboard behavior, and visual hierarchy consistent across flows.
- When a UI bug is fixed, add or update the matching validation step (unit or E2E).

## Verification expectations

- Capture evidence for critical user journeys (see [`docs/RELIABILITY.md`](docs/RELIABILITY.md)).
- The golden journey is validated with Playwright.
- If visual regressions become common, standardize screenshot or DOM checks.
