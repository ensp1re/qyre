# Web structure

The web app uses three directional layers adapted to Qyre's single-screen IDE shell:

```text
src/
  app/                       entry composition, providers, workspace state, global styles
  features/<capability>/
    api/                     HTTP endpoint wrappers
    model/                   query hooks, state, and domain logic
    ui/                      web-only composition components
  shared/
    api/                     HTTP transport
    lib/                     focused infrastructure such as query policy and storage
tests/                       mirrors src/ ownership exactly
```

Dependency direction is `shared -> features -> app`: shared imports neither feature nor app code;
features may import shared code but never another feature or app code; app composes all layers.
`pnpm check:web-structure` enforces these rules and the mirrored test tree.

State is separated by ownership:

- TanStack Query owns server state.
- Component-local UI state stays in `useState`; coordinated shell transitions use the app reducer.
- Persisted preferences/history use the typed, versioned adapter in `shared/lib/storage/`.
- Raw credential-bearing connection targets are session-only and never written to browser storage.
- Redux/Zustand are not installed until state must be consumed across independent branches and the
  app reducer/context becomes a measured limitation.

There is no `pages/` or router layer because Qyre currently has one shell with internal tabs. Add
one only when URL-addressable screens exist. Reusable presentation belongs in `@qyre/ui`, and
browser/server contracts belong in `@qyre/core`.

This is Qyre's adaptation of
[Bulletproof React's directional feature architecture](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)
and [Feature-Sliced Design's layer rules](https://feature-sliced.design/docs/reference/layers), not
a copy of either template.
