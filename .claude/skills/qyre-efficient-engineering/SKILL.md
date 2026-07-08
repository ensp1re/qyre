---
name: qyre-efficient-engineering
description: Use for every Qyre code change, refactor, file creation, or test addition. Minimizes context and tool output, chooses the correct domain and layer before creating files, keeps types and tests owned predictably, and verifies the narrowest relevant surface before repository-wide checks.
---

# Qyre Efficient Engineering

## Workflow

1. Run `pnpm context [feature-id]`. Do not read all of `FEATURES.json`, completed plans, or broad
   documentation at startup.
2. Locate the target with `rg --files`, then `rg -n` for the symbol. Read only the owning module,
   direct dependencies, tests, and routed documents needed for the change.
3. Before creating or moving a file, name its domain, layer, and consumers. Read
   [`docs/CODE_ORGANIZATION.md`](../../../docs/CODE_ORGANIZATION.md) when placement changes.
4. Make the smallest coherent change. Do not mix structural migration with behavior unless the
   behavior requires it.
5. Run the narrow package or test command while iterating, then the feature verification and
   required repository gate once the implementation stabilizes.

## Placement contract

- Group production code by cohesive responsibility. Domain, resource, capability, or technical
  layer can all be correct; derive the boundary from ownership and dependencies rather than a
  predefined folder list.
- Keep package roots for public entrypoints and genuinely cross-domain infrastructure.
- Put tests under `<package>/tests/`, mirroring the chosen `src/` organization. Add test-level
  subdivisions only when the distinction is meaningful.
- Keep a type used by one file beside its implementation. Put types shared within one domain in
  `<domain>/types.ts`; put cross-runtime API/domain contracts in `@qyre/core`; use `import type`.
- Do not create catch-all `utils.ts`, `helpers.ts`, or repository-wide `types.ts` files. Name files
  after the concern they own.
- Split a domain folder when it exceeds 10-12 production files or contains independent
  sub-concerns. Production files should normally remain below 300 lines and tests below 500 lines.

## Context and output budget

- Prefer commands that summarize state over loading source-of-truth data verbatim.
- Cap exploratory output and expand only around a concrete match or failure.
- Never reread unchanged files or rerun a passing check without an intervening change.
- Report successful verification as one line; include only actionable failing output.

## Delivery

- Run `pnpm verify:pr` before committing. Use the local Docker stack when it is available.
- Push normally and let the pre-push hook repeat the authoritative gate. Never use `--no-verify`.
- Open a draft PR, verify CI, then record its URL and pushed commit before marking work passing.
