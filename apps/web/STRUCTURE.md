# Web structure

The web app is moving away from flat directories that mix unrelated responsibilities. The final
folder names must be derived from current ownership, imports, and change patterns; examples in
[`../../docs/CODE_ORGANIZATION.md`](../../docs/CODE_ORGANIZATION.md) are illustrative.

Rules:

- Avoid cycles between peer areas; compose them at an application boundary.
- API wrappers, TanStack Query hooks, local types, and composition stay with their owning concern
  when they change together.
- Reusable presentation belongs in `@qyre/ui`.
- Tests mirror the chosen source organization under `apps/web/tests/`.
- Existing flat folders are migration debt in Plan 0005; do not add new files to them.
