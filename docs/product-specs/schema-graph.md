# Product Contract: Interactive Schema Graph (ERD)

The Schema tab (`apps/web/src/components/schema-tab.tsx` -> `@qyre/ui`'s `SchemaGrid`) today
renders every table as a static `TableDetail` card in a `repeat(auto-fill, minmax(260px, 1fr))`
grid. It's a readable inventory but not a _map_: there's no way to see how tables relate, foreign
keys are shown only as per-column `FK` badges with no visible connection to their target table, and
you can't pan/zoom/rearrange it into the shape of your mental model. Reported directly ("current
Schema tab looks terrible; wants a GraphQL-style navigable schema canvas with zoom and relation
lines"), and independently flagged as high-share-value - an ERD screenshot is the artifact people
paste into docs and Slack.

## One-sentence promise

The Schema tab can render the whole database as an interactive entity-relationship diagram -
tables as draggable nodes, foreign keys as lines connecting them - that you can pan, zoom, and
rearrange, with your layout remembered per database.

## Rendering approach

- Built on **`@xyflow/react` (React Flow, MIT)** for the canvas (pan, zoom, node drag, edge
  rendering, fit-to-view, a minimap and zoom controls) and **`@dagrejs/dagre`** for the initial
  automatic layout. Chosen over a hand-rolled SVG canvas because pan/zoom/drag/edge-routing and
  layered graph layout are exactly what these libraries do well and are tedious and bug-prone to
  reimplement; this is a real feature need, not speculative flexibility. Both are added as
  `apps/web` dependencies (the graph is an `apps/web` view over data it already fetches via
  `useAllTables`; no `packages/ui` primitive is generalized until a second consumer needs one).
- The React Flow stylesheet is imported once where the graph mounts. All node/edge visuals use the
  existing design-system tokens (`bg-card`, `border-border`, `--c-amber`/`--c-blue` for PK/FK,
  `TypeIcon`'s per-type colors) so the diagram reads as part of Qyre, not a bolted-on widget, and
  themes correctly in both light and dark.

## Behavior

### Nodes = tables

- One node per table, reusing the existing `TableDetail` visual vocabulary: the table name header
  (with `~N rows`) and its column rows (type icon, name, `PK`/`FK` badge, data type). A very tall
  table (many columns) caps its visible column list at a reasonable height and scrolls within the
  node, so one wide table can't dominate the canvas.
- Nodes are draggable. Dragging a node updates only its own position; edges re-route automatically.

### Edges = foreign keys

- One edge per foreign-key relationship, derived from each column's existing
  `ColumnMetadata.references` (`{ schema?, table, column }`) - already present in `TableMetadata`
  for all SQL engines, so **no server change is needed**. The edge runs from the referencing
  column's node to the referenced table's node.
- Edges are directional (referencing -> referenced), rendered as smooth/step lines in the muted
  `--c-blue` FK color, and anchor at the row of the specific FK column where practical (falling
  back to the node edge if per-row anchoring isn't available). Hovering or selecting a node
  emphasizes its connected edges and de-emphasizes the rest, so a single table's relationships are
  legible even in a busy diagram.
- A `references` target that doesn't resolve to a known node (e.g. a cross-schema reference to a
  table not in the current fetch) is skipped rather than drawn as a dangling edge.

### Auto-layout and position persistence

- On first render for a database, dagre computes a layered top-to-bottom layout and the view
  fits-to-bounds so the whole graph is visible.
- After that, node positions are **persisted in `localStorage`, keyed per database** (a stable key
  derived from the connection target, same spirit as `usePanelSize`'s per-key persistence), so
  reopening the tab - or the app - restores the arrangement you left. A **"Reset layout"** control
  clears the saved positions and re-runs auto-layout + fit-view.
- Newly-appearing tables (a table present in the data but absent from saved positions, e.g. after
  switching to a database with more tables) get an auto-laid-out position rather than stacking at
  the origin.

### Graph vs grid view

- The Schema tab gains a small **Graph / Grid toggle** in its toolbar. Graph is the default once
  this ships; the existing `SchemaGrid` card view stays available as the alternate (it's still the
  better view for reading one table's columns in detail, and a guaranteed-simple fallback). The
  chosen view is remembered (localStorage) like the theme is.

### MongoDB and other edge-less cases

- MongoDB has no enforced foreign keys (`references` is always undefined there), so its graph
  renders as **unconnected nodes** - still useful as a pannable, draggable, rememberable canvas of
  collections, just without edges. This falls out of the same code path (no edges derived) and
  needs no engine-specific branch beyond what the data already implies. A SQL database that
  genuinely has no foreign keys renders the same way.

### Accessibility and empty/loading/error states

- Loading, error, and empty-database states reuse the Schema tab's existing `Spinner`/`ErrorState`/
  "No tables found" treatments - the toggle and canvas only render once data is present.
- React Flow's pane is keyboard-focusable and its nodes are reachable; the Graph/Grid toggle and
  Reset-layout control are standard buttons in the tab order. The card grid remains a fully
  keyboard-accessible equivalent view for anyone who prefers it, so no information is _only_
  available by manipulating the canvas.

## Out of scope (for now)

- Editing the schema from the graph (adding/removing tables, columns, or relationships) - Qyre is
  read-only; the graph is a viewer.
- Inferring "soft" foreign keys for MongoDB by field-name convention (e.g. `user_id` -> `users`) -
  the first pass only draws edges the engine actually reports. A later slice could add heuristic
  edges behind a clearly-labeled toggle.
- Exporting the diagram as an image/SVG from within the app - valuable ("ERD screenshots are the
  sharing currency") but a separate slice; a browser screenshot works in the meantime.
- Filtering/searching the graph to a subset of tables, or collapsing column lists to just keys -
  reasonable follow-ups once the base canvas ships.
- Cross-schema layout niceties (grouping nodes by schema) - all tables share one canvas for now.

## Acceptance criteria

- The Schema tab renders every table as a node and every resolvable foreign key as a connecting
  edge, verified against a Postgres database with real FK relationships.
- The canvas pans, zooms, and lets a node be dragged to a new position; edges re-route to follow.
- Dragging nodes and reopening the tab (or reloading the app) restores the saved layout for that
  database; "Reset layout" returns to auto-layout.
- Switching to a MongoDB connection renders its collections as unconnected nodes without error.
- The Graph/Grid toggle switches between the ERD and the existing card grid, and the choice
  persists.
- Loading/error/empty states match the rest of the Schema tab, and the card grid remains available
  as a keyboard-accessible equivalent.
