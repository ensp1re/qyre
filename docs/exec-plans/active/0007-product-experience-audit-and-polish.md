# Plan 0007: Product Experience Audit and Coherent UI Polish

Status: Revised plan approved 2026-07-15; DF-10 audit and DF-11 editing integrity are delivered.
DF-12 shared controls and complete typed editors is passing in draft PR #159. DF-13 is next after
merge.
Owner: current product-design engagement
Linked features: DF-10 audit (passing), DF-11 editing integrity (passing), DF-12 typed editors
(passing)
Evidence captured: 2026-07-15

## Objective

Improve Qyre as a professional, local-first database interface by correcting demonstrated workflow,
accessibility, responsive, and design-system problems without weakening information density,
permission-aware behavior, read-only enforcement, destructive-action safeguards, or cross-engine
parity. The work must proceed as small, independently verifiable slices derived from the audit.

## Scope and guardrails

In scope: the web shell, connection experience, schema browsing, table data grid, row-editing
surfaces, SQL editor feedback, Settings, shared overlays and feedback primitives, keyboard access,
WCAG 2.2 AA behavior, responsive desktop layouts, and token compliance.

Out of scope: server capability semantics, database mutation contracts, engine-specific permission
logic, a new visual identity, lower-density consumer styling, mobile-first workflows, unrelated
refactors, new database features, and any implementation before approval.

The browser audit covered PostgreSQL, MySQL, SQLite, and MongoDB; PostgreSQL writable,
`--read-only`, and restricted-role sessions; disconnected first use; dark and light themes; and
1440x900, 1024x768, 800x700, 640x700, 400x700, and 320x700 viewports. The data fixture contained
240 realistic rows and long text values. The temporary audit table was dropped after capture.

## Executive assessment

Qyre already has a credible professional foundation. Its restrained token palette, compact shell,
engine-aware navigation, explicit access status, destructive confirmations, filter workflow, and
cross-engine permission gating are coherent and should be preserved. Automated Axe coverage passed
the connected shell in both themes, and the full E2E suite passed across all four engines and the
read-only/restricted projects.

The experience weakens at scale and at semantic interaction boundaries. Long values make the table
several viewports wide; every visible cell action becomes a separate tab stop; hidden drawers remain
interactive to assistive technology; incomplete required inserts can be staged; and a large grant
set turns Settings into a 21,000-pixel document. First use also presents contradictory instructions
and exposes raw driver language on failure. These are repeated component and information-architecture
causes, not isolated cosmetic defects.

No security/read-only bypass was found. A follow-up editing review identified one critical data-
fidelity risk: the shared time editor emits only `HH:MM`, so changing a time in an existing value can
silently discard seconds, fractional precision, and timezone information. Ten findings are high
severity because they materially impede frequent workflows, safe editing, or accessible operation.
The proposed direction is refinement, not redesign: keep the density, make editing a stable and
deliberate state, progressively disclose exceptional volume, and give every control and status one
clear semantic and visual contract.

## Journey map

| Journey                            | States exercised                                                                                              | Engines/access modes                              | Result                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| First launch and direct connection | disconnected, drawer open/closed, empty fields, failed credentials                                            | PostgreSQL target                                 | Coherent mechanics; contradictory guidance and raw error recovery need work                                               |
| Database orientation               | tree navigation, schema graph/grid, table selection, long names                                               | all four engines                                  | Engine parity works; graph fit and semantic grouping are weak                                                             |
| Read and explore rows              | loading, populated, dense/long data, sorting, filtering, pagination, responsive widths                        | PostgreSQL/MySQL/SQLite, MongoDB document values  | Core workflow works; long-value sizing and keyboard model are systemic blockers                                           |
| Edit and commit SQL rows           | row selection, inline editing, typed values, add/duplicate row, delete, required fields, cancel/review/commit | writable PostgreSQL plus source-level type matrix | Editing changes geometry and conflicts with selection; type fidelity, add-row, and commit review need a cohesive redesign |
| Edit MongoDB documents             | collection table, nested value drawer, document surface                                                       | MongoDB                                           | Engine-specific model is appropriate and preserved                                                                        |
| Run SQL                            | results, history, error, retry, Explain, destructive confirmation                                             | PostgreSQL/MySQL/SQLite; MongoDB N/A              | Strong destructive guard; feedback semantics and hidden drawer lifecycle need work                                        |
| Inspect files and console          | empty files, event history                                                                                    | all connected modes                               | Functional; empty and live-status semantics are underdeveloped                                                            |
| Understand access and preferences  | large roles/grants list, notices, theme, history settings                                                     | writable PostgreSQL                               | Accurate but unscalable information architecture                                                                          |
| Restricted operation               | forced read-only and restricted database role                                                                 | PostgreSQL                                        | Clear reason and hidden write affordances; inert row selection remains                                                    |
| Responsive operation               | expanded/collapsed sidebar, wrapped toolbar, scrolling tabs/dialogs                                           | representative connected screens                  | Shell reflows without page overflow; the data grid's intrinsic width is uncontrolled                                      |

## Evidence index

The screenshots are stored in the Codex visualization workspace at:
`/Users/oleksandrostapuk/.codex/visualizations/2026/07/15/019f666c-2afd-7153-bab2-245e2f018229/`.

| Evidence                                                                    | What it shows                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------- |
| `audit-01-postgres-shell-1440x900.png`                                      | Baseline connected shell                          |
| `audit-02-schema-graph-1440x900.png`                                        | Default graph fit and long-name handling          |
| `audit-03-schema-grid-1440x900.png`                                         | Schema grid alternative                           |
| `audit-04-table-dense-1440x900.png`                                         | Dense table with long value width expansion       |
| `audit-05-table-1024x768.png` through `audit-10-table-320x700.png`          | Responsive table progression and sidebar collapse |
| `audit-11-filter-dialog.png`                                                | Compact filter interaction                        |
| `audit-12-query-history-open.png`                                           | Query-history drawer                              |
| `audit-13-sql-result-dense.png`                                             | Dense SQL results                                 |
| `audit-14-query-error.png`                                                  | Query error presentation                          |
| `audit-15-query-plan.png`                                                   | Explain result                                    |
| `audit-16-destructive-confirmation.png`                                     | Statement confirmation and initial focus          |
| `audit-17-files-empty.png`                                                  | Files empty state                                 |
| `audit-18-console.png`                                                      | Console event stream                              |
| `audit-19-settings-access-overload.png` through `audit-21-settings-end.png` | Settings with 1,000 grants and buried preferences |
| `audit-22-settings-640x700.png`, `audit-23-settings-light-640x700.png`      | Responsive Settings in both themes                |
| `audit-24-table-light-1440x900.png`                                         | Light-theme table                                 |
| `audit-25-add-row-wide-table.png`                                           | Incomplete insert plus distant required fields    |
| `audit-26-csv-import.png`                                                   | CSV import labels and disabled state              |
| `audit-27-table-structure.png`                                              | Table structure workflow                          |
| `audit-28-typed-destructive-confirmation.png`                               | Exact-name DDL confirmation                       |
| `audit-29-first-use.png`, `audit-30-first-use-fields.png`                   | Disconnected first-use contradiction              |
| `audit-31-connection-error.png`                                             | Raw connection-driver error                       |
| `audit-32-mongodb-document-table.png`, `audit-33-mongodb-cell-drawer.png`   | MongoDB-specific data experience                  |
| `audit-34-read-only-table.png`, `audit-35-restricted-role-table.png`        | Forced and role-restricted sessions               |

## Prioritized findings

Severity describes user impact, reach describes recurrence, and confidence reflects the combination
of live reproduction, DOM inspection, source inspection, and automated evidence. No finding is
classified critical.

| ID  | Category                     | Finding                                                                              | Severity | Reach    | Confidence | Primary evidence                      |
| --- | ---------------------------- | ------------------------------------------------------------------------------------ | -------- | -------- | ---------- | ------------------------------------- |
| A01 | Layout/responsive            | Long scalar values expand the data grid to several viewports                         | High     | Systemic | High       | 04-10, 25                             |
| A02 | Accessibility/interaction    | The grid uses hundreds of tab stops and pointer-only sortable headers                | High     | Systemic | High       | DOM + `rows-table.tsx`                |
| A03 | Accessibility/structural     | Closed off-canvas drawers remain focusable and exposed                               | High     | Repeated | High       | DOM + drawer source                   |
| A04 | Workflow/error prevention    | Required inserts can be staged incomplete with Commit enabled                        | High     | Repeated | High       | 25 + insert source                    |
| A05 | Information architecture     | Large grant sets bury Settings preferences in a 21,000px page                        | High     | Systemic | High       | 19-21 + `access-viewer.tsx`           |
| A06 | First use/workflow           | Disconnected guidance contradicts the available direct-connect flow                  | Medium   | Repeated | High       | 29-30                                 |
| A07 | Error recovery/accessibility | Connection failures expose raw driver language                                       | High     | Repeated | High       | 31 + connect source                   |
| A08 | Interaction                  | Inline cell editing relies on hidden double-click/Enter knowledge                    | Medium   | Repeated | High       | table UI + editable-cell source       |
| A09 | Accessibility/feedback       | Errors, plans, and console events lack a consistent live-status contract             | Medium   | Systemic | High       | 14-15, 18 + source                    |
| A10 | Accessibility/structure      | Schema grid cards lack navigable heading/region semantics                            | Medium   | Repeated | High       | 03 + schema source                    |
| A11 | Accessibility/interaction    | Many adjacent controls are below the 24px target-size minimum                        | Medium   | Systemic | High       | DOM measurements + source             |
| A12 | Layout/visual                | Schema graph default fit underuses the viewport and truncates orientation cues       | Medium   | Repeated | Medium     | 02                                    |
| A13 | Empty state/workflow         | Files and disconnected tree states do not distinguish absence from unavailability    | Medium   | Repeated | High       | 17, 29                                |
| A14 | Design system                | Semantic quiet text, warning color, and scrollbar rules drift from tokens            | Low      | Systemic | High       | token doc + CSS/source                |
| A15 | Local-first/trust            | Web fonts are fetched from Google rather than bundled or local                       | Medium   | Systemic | High       | `index.css` + design-system doc       |
| A16 | Restricted workflow          | Read-only tables retain row-selection controls with no available operation           | Low      | Repeated | High       | 34-35                                 |
| A17 | Data integrity/editing       | Time/timestamp edits can silently discard stored precision or timezone data          | Critical | Systemic | High       | `date-time-input.tsx` + fidelity spec |
| A18 | Interaction/editing          | Row selection and cell editing use conflicting gestures and unstable geometry        | High     | Systemic | High       | 04, 25 + grid source                  |
| A19 | Workflow/type system         | JSON, arrays, binary, and unknown types are excluded; other types use coarse editors | High     | Systemic | High       | editability + validation source       |
| A20 | Workflow/layout              | Add row injects an always-editing full table row instead of a guided row task        | High     | Repeated | High       | 25 + insert source                    |
| A21 | Workflow/feedback            | Pending changes and Commit are a detached bar, not a clear review-and-recovery flow  | High     | Repeated | High       | 25 + commit source/tests              |
| A22 | Design system                | 132 raw buttons and six native selects lack shared control contracts                 | Medium   | Systemic | High       | source inventory                      |
| A23 | Information hierarchy        | The normal `read-write` footer badge adds noise without helping a decision           | Low      | Repeated | High       | 01, 24 + status source                |

## Detailed finding records

### A01 - Unbounded table width

- Journey and reproduction: open a populated table containing a long text value, then resize from
  1440 to 800, 640, 400, and 320 pixels.
- User experience: one `notes` column measured 2,483px and the table 3,593px inside a 1,144px
  container. Required fields and row actions can be thousands of pixels away. The shell itself does
  not overflow, but the permitted two-dimensional data surface becomes impractical.
- Cause: every header and scalar cell is `whitespace-nowrap` in `rows-table.tsx`, with no semantic
  default width, maximum width, truncation, or expansion affordance.
- Direction: introduce tokenized column sizing by value kind, ellipsis plus an accessible full-value
  affordance, preserved horizontal scrolling, and optional resize/fit behavior. Never silently
  discard value access.
- Related surfaces: RowsTable, query results, CSV preview, cell-value drawer, add-row row.
- Risk: high regression risk around editing, copy, virtualization, and dense short values; verify
  all data types and 320-1440px widths.

### A02 - Non-composite grid keyboard model and sorting

- Journey and reproduction: inspect focusables in a 25-row table and attempt sorting without a
  pointer.
- User experience: the sample exposed 319 tabbable elements, including roughly 100 cell actions
  and 25 selection controls. Sortable headers are clickable `<th>` elements without `aria-sort` or
  keyboard activation. Reaching controls after the grid is prohibitively expensive.
- Cause: interactive cells are independent buttons in a native table; headers attach `onClick`
  directly instead of containing a semantic control. No roving-focus/composite-grid convention
  exists.
- Direction: retain native table semantics where possible, add button-based sortable headers with
  `aria-sort`, and implement a documented roving-focus model for cell actions. Tab should enter and
  leave the grid predictably; arrows navigate within it.
- Related surfaces: RowsTable, selection, inline editing, query result tables.
- Risk: high because screen-reader table navigation and existing mouse interaction must remain
  intact; prototype and test keyboard contracts before broad reuse.

### A03 - Hidden drawers remain interactive

- Journey and reproduction: close Connect or Query History, then inspect focusable descendants and
  the accessibility tree.
- User experience: the drawer is translated off-screen but remains mounted with live buttons and
  inputs. A keyboard or assistive-technology user can encounter invisible controls. Open drawers do
  correctly trap focus and restore it, which should be preserved.
- Cause: always-mounted drawer containers toggle only `translate-x-full`; the backdrop alone is
  `aria-hidden`. The containers have neither `inert` nor a closed-state unmount/hidden contract.
- Direction: add one shared overlay lifecycle contract: closed content is inert and hidden from the
  accessibility tree; open content has a label, trap, Escape behavior, and focus restoration.
- Related surfaces: ConnectDrawer, QueryHistoryDrawer, Sidebar, document/cell drawers.
- Risk: medium; CSS transition timing and retained form state need explicit tests.

### A04 - Incomplete inserts are commit-able

- Journey and reproduction: choose Add row on a table with required columns, leave required values
  empty, and observe the staged row and Commit action.
- User experience: the row is staged and Commit remains enabled. Required columns are not marked,
  generated/non-editable fields are unexplained, and later required fields may be far outside the
  viewport because of A01. The server remains an authoritative backstop, but the UI allows an
  avoidable failure late in the workflow.
- Cause: new-row state models draft values but not completeness or field-level validation; the
  commit bar gates on pending-operation count rather than validity.
- Direction: mark required/default/generated states, validate locally without guessing server-only
  constraints, keep invalid drafts editable, and disable commit with a precise summary and first-
  invalid-field navigation.
- Related surfaces: NewRowCell, RowsTable, CommitBar, mutation error mapping.
- Risk: high across engines because nullability, defaults, identity columns, and MongoDB differ;
  shared metadata-driven rules and engine parity tests are mandatory.

### A05 - Settings access overload

- Journey and reproduction: open Settings against a role-rich PostgreSQL instance with the grant
  response truncated at 1,000 entries.
- User experience: 17 roles and 1,000 grants render eagerly; the grant section measured 19,870px
  and the whole screen 21,036px. Appearance and Data/history controls are effectively buried.
- Cause: Settings places Access before preferences, and AccessViewer maps every raw grant with no
  summary, grouping, filtering, collapse, or bounded region.
- Direction: separate Access from preferences at the screen-navigation level; lead with access
  summary and role context; group/filter grants by database/schema/object and progressively reveal
  raw rows. Preserve exact raw facts and the truncation notice.
- Related surfaces: SettingsScreen, AccessViewer, overview grants API.
- Risk: medium; summaries must not misrepresent effective privileges or hide security-relevant
  detail. Raw evidence remains reachable.

### A06 - Contradictory disconnected guidance

- Journey and reproduction: launch without a target.
- User experience: the connection drawer auto-opens and offers direct connection, while the main
  panel says to launch Qyre with a target and the schema tree says `No tables found`, which implies
  an empty database rather than no connection.
- Cause: disconnected, empty database, and no-schema states reuse generic empty copy written for
  the CLI-target workflow.
- Direction: define explicit connection-state language and one primary path: connect in the drawer,
  optionally explain CLI launch as an expert alternative. Only say `No tables found` after a
  successful connection.
- Related surfaces: App empty content, SchemaTree, ConnectDrawer.
- Risk: low; copy/state tests and both CLI-launched/direct-connect paths are enough.

### A07 - Raw connection error recovery

- Journey and reproduction: submit the guided PostgreSQL form without a valid password.
- User experience: `SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` is shown.
  It is visible through an alert, but does not identify the corrective field in user language.
- Cause: ConnectDrawer renders `connectError.message` from the driver directly; no known-error
  translation or field association exists.
- Direction: map common connection failures to actionable summaries, associate field errors where
  possible, keep redacted technical detail behind disclosure, and retain the driver text for
  diagnosis without making it the primary message.
- Related surfaces: connection API error model, ConnectDrawer, CLI/direct target modes.
- Risk: medium because redaction and engine-specific diagnostics must not regress.

### A08 - Hidden inline-edit activation

- Journey and reproduction: scan the populated grid for an edit action, then inspect cell behavior.
- User experience: editable values look like values; the key interaction is conveyed mainly by a
  `title` saying `Double-click to edit`. Keyboard Enter works once the cell action is focused, but
  neither pathway is discoverable and double-click is not a standard web activation convention.
- Cause: EditableCell compresses viewing and activation into a visually quiet button without a
  persistent or focus-visible editing cue.
- Direction: add a restrained editable-state cue and consistent single activation/focus contract;
  teach the shortcut contextually once, not on every cell.
- Related surfaces: EditableCell, NewRowCell, table toolbar help.
- Risk: medium; avoid adding icon noise to every cell or triggering accidental writes.

### A09 - Fragmented status and error semantics

- Journey and reproduction: run an invalid query, request Explain, and inspect Console updates.
- User experience: the query error reads like low-emphasis content; async plan results are not
  announced; Console has no semantic heading/list/log contract. Visual users receive feedback, but
  assistive-technology users may miss it.
- Cause: ErrorState has no alert/live semantics; QueryPlanPanel has no status region; ConsoleLog is
  generic spans/divs. Each feature invents feedback independently.
- Direction: create shared, severity-aware feedback primitives with deliberate live-region policy.
  Errors announce once; loading uses status; the console is a labelled log without announcing every
  historical row.
- Related surfaces: ErrorState, QueryRunner, QueryPlanPanel, ConsoleLog, connection errors.
- Risk: medium; over-announcement is itself an accessibility regression.

### A10 - Weak schema-card semantics

- Journey and reproduction: navigate the schema grid by headings/regions with accessibility
  inspection.
- User experience: visual cards convey tables and their columns, but table names and card groups do
  not create equivalent semantic navigation landmarks.
- Cause: SchemaGrid maps generic TableDetail containers without heading/region structure.
- Direction: label the schema view, give each table a correctly levelled heading, and expose column
  collections semantically without adding visual chrome.
- Related surfaces: SchemaGrid, TableDetail, graph/grid switcher.
- Risk: low; preserve compact visuals and avoid excessive landmarks for very large schemas.

### A11 - Undersized adjacent controls

- Journey and reproduction: measure shell, toolbar, checkbox, and icon-only targets.
- User experience: representative controls measured 10-21px, including 12px row checkboxes and
  13-16px shell actions. Several sit adjacent, so the WCAG 2.2 24-by-24 spacing exception cannot be
  assumed. Mouse precision and touchpad use suffer even in a desktop-first product.
- Cause: visual icon size is also used as hit-area size; no shared compact-target contract separates
  glyph from interactive box.
- Direction: preserve small glyphs while expanding hit areas to 24px where the exception does not
  apply; document intentional dense-grid exceptions with spacing evidence.
- Related surfaces: TitleBar, Sidebar, table toolbar, row selection, duplicate/delete actions.
- Risk: medium for density and row height; use pseudo-padding or contained hit areas rather than a
  blanket component enlargement.

### A12 - Schema graph fit and orientation

- Journey and reproduction: open Graph for a five-table schema with long names.
- User experience: the model occupies a small band near the bottom center while most of the canvas
  is empty; names truncate before the graph communicates useful structure.
- Cause: default fit/layout optimizes the node bounds without a useful minimum readable scale or
  distribution rule for small schemas.
- Direction: tune initial layout/fit for small and medium graphs, protect readable node scale, and
  retain user zoom/pan plus the Grid alternative.
- Related surfaces: SchemaGraph, graph controls, long identifiers.
- Risk: medium and data-shape dependent; validate disconnected, sparse, dense, cyclic, and long-name
  schemas.

### A13 - Ambiguous empty states

- Journey and reproduction: open Files without `--files-dir`; compare disconnected schema tree and
  a connected empty database.
- User experience: a sentence sits at the top of a large blank Files panel, while disconnected and
  empty schema states are conflated. Users cannot quickly tell whether there is nothing to show,
  a configuration step is required, or the feature is unavailable.
- Cause: empty states are feature-local text rather than a shared state model with condition,
  explanation, and available action.
- Direction: use a compact professional empty-state primitive with explicit unavailable/empty/error
  variants and one relevant next action.
- Related surfaces: FilesBrowser, SchemaTree, schema tabs, query history.
- Risk: low; avoid decorative illustration or excessive whitespace.

### A14 - Design-token implementation drift

- Journey and evidence: compare source styling with the documented design-system contract.
- User experience: visual hierarchy is mostly coherent, but quiet text is again implemented through
  `text-foreground/65-90`, Access notices reference nonexistent `--c-yellow`, and the WebKit
  scrollbar selector is misspelled as `::-webkit-scrollbar-tqyre`.
- Cause: shared semantic tokens are not enforced at lint/test level after F145 introduced
  `quiet-foreground` specifically to replace opacity-modified foreground text.
- Direction: migrate remaining semantic uses, correct the warning token and selector, and add a
  narrow executable guard for forbidden opacity-modified text roles and unknown color variables.
- Related surfaces: table cells, filters, drawers, Settings, Console, scrollbar styling.
- Risk: low to medium; re-run both-theme Axe and visual checks to preserve hierarchy.

### A15 - Remote font dependency in a local-first product

- Journey and evidence: inspect the app stylesheet and load path offline/private-network constrained.
- User experience: typography depends on a Google Fonts request. It can fall back offline, create a
  visible metric shift, and makes a local-first UI initiate an avoidable third-party request.
- Cause: `@import` points to `fonts.googleapis.com`; the design-system reference codifies the same
  delivery choice rather than a bundled/system source.
- Direction: bundle the approved typefaces with the application or use a deliberate local/system
  stack; update the design-system source and CSP/build expectations.
- Related surfaces: global CSS, packaging, security/privacy documentation.
- Risk: medium for bundle size, licensing, font metrics, and text truncation; verify packaged and
  offline launches across platforms.

### A16 - Inert selection in read-only tables

- Journey and reproduction: open a forced read-only or restricted-role table.
- User experience: row checkboxes remain, but no bulk or destructive operation is available. They
  add focus/visual weight without a consequence.
- Cause: selection visibility is independent from effective row-mutation capability.
- Direction: hide selection when no current action consumes it, or provide an explicit read-only
  consumer such as copy/export selection only if product requirements justify it.
- Related surfaces: RowsTable, capability gates, toolbar.
- Risk: low; ensure exports and future bulk actions are not accidentally removed.

### A17 - Silent time/timestamp fidelity loss

- Journey and reproduction: edit an existing SQL `time`, `timestamp`, or timezone-bearing value,
  then change its time segments. Source reproduction is deterministic: `TimeSegments.commit`
  emits only `HH:MM`; the `datetime-local` composition rebuilds the value from that output.
- User experience: seconds, fractional seconds, and timezone information can disappear without an
  explicit warning. A successful commit can therefore store a different value than the user
  intended even though Qyre's type-fidelity specification forbids silent precision or timezone
  loss.
- Cause: a filter-oriented minute-precision `DateTimeInput` was reused as a mutation editor even
  though filtering and lossless data editing have different fidelity requirements.
- Direction: immediately prevent unsafe mutation paths, then introduce a lossless temporal editor
  that preserves the raw stored representation unless the user explicitly changes each part. Date,
  local timestamp, timezone timestamp, and time-with-zone need distinct capability rules.
- Related surfaces: EditableCell, NewRowCell, DateTimeInput, row-mutation validation, PostgreSQL,
  MySQL, and SQLite temporal types.
- Risk: critical data-integrity risk. Verification requires real round-trips for seconds,
  fractional precision, offsets, DST boundaries, null, and invalid values on every applicable
  engine before the editor is re-enabled.

### A18 - Conflicting row selection and editing interaction

- Journey and reproduction: click or drag across a row, then try to edit a scalar cell. The table
  gives the entire row a pointer cursor and starts drag-selection on row `pointerdown`, while an
  editable cell requires double-click or Enter and replaces its display with controls of different
  dimensions.
- User experience: clicking appears to change row state instead of entering the expected edit; a
  double-click combines selection and editing concepts; entering boolean or datetime editing can
  widen or heighten the row and move adjacent content. The table feels unstable and easy to
  misoperate.
- Cause: row selection and cell activation were designed independently, and editors render inline
  without a shared fixed-geometry editor shell or explicit row/cell interaction model.
- Direction: single row click selects only; cell focus and edit activation are explicit and
  consistent (`Enter`/`F2` plus a clear pointer action). Scalar editing must preserve row height and
  column geometry; complex editing opens a stable secondary surface without shifting the grid.
- Related surfaces: RowsTable, selection drag, EditableCell, CellValue, keyboard grid model.
- Risk: high because expert selection, copying, navigation, and screen-reader table semantics must
  remain fast and predictable.

### A19 - Incomplete type-aware editor system

- Journey and reproduction: inspect editability across JSON/JSONB, arrays, binary, enum/set, UUID,
  numeric, boolean, date/time, and unknown declared types.
- User experience: structured, binary, and unknown types are excluded entirely with little in-
  context explanation; JSON and arrays cannot be edited despite being common database values;
  enum/set values fall back to a text input; UUID is plain text; boolean uses three tiny buttons;
  temporal values share the lossy editor described in A17. MongoDB has a separate whole-document
  text editor rather than a reusable structured-value experience.
- Cause: editability reuses the filtering type classifier and only maps scalar kinds to five coarse
  widgets. The server explicitly rejects structured/binary/unknown mutation values.
- Direction: define a mutation-specific column-editor capability matrix and registry. Support
  exact numeric/identifier inputs, tri-state boolean, accessible custom enum/set selectors,
  lossless temporal editing, and validated/prettified JSON/JSONB/array editing. Binary and unknown
  types remain read-only until a safe engine-specific contract exists, with the reason visible.
- Related surfaces: core type classification, server mutation validation, SQL drivers,
  EditableCell, NewRowCell, MongoDB document editor, design-system controls.
- Risk: high and cross-engine. JSON, arrays, timezone types, enum/set, decimals, and null/default
  semantics require an explicit engine matrix and conformance cases; no editor may stringify or
  coerce silently.

### A20 - Add-row is an unstable table mutation surface

- Journey and reproduction: choose Add row on a wide table with mixed types and required columns.
- User experience: a full always-editing row is inserted above data, every editable column becomes
  a control at once, non-editable fields say only `not editable`, horizontal width expands, focus is
  not guided, and required/default/generated distinctions are unclear. This compounds A01 and A04.
- Cause: insert reuses cell widgets directly inside the grid rather than modelling Add row as one
  bounded form task with validation, field metadata, and deliberate submission/cancellation.
- Direction: Add and Duplicate open a dedicated, responsive row composer that preserves table
  context, groups fields by type/state, keeps actions stable, focuses the first meaningful field,
  and supports keyboard traversal. The grid shows the staged result compactly only after a valid
  draft is accepted.
- Related surfaces: RowsTableToolbar, NewRowCell, pending inserts, table metadata, responsive
  drawers/panels.
- Risk: high because defaults, generated keys, nullable fields, large schemas, and permission-
  restricted columns differ by engine.

### A21 - Commit is not a coherent review and recovery flow

- Journey and reproduction: stage an edit, insert, and delete; expand the bottom CommitBar; trigger
  a failed operation.
- User experience: the table abruptly loses vertical space when the bar appears; the primary
  review content is collapsed by default; generated SQL is separated from the affected rows and
  values; Discard applies to everything; validation and failed-operation recovery are not connected
  back to the relevant field/row. `Commit` communicates an action but not the complete consequence.
- Cause: CommitBar is a count/action strip appended below the table, while edit state, validation,
  operation preview, and recovery remain owned by separate components.
- Direction: use one pending-changes model surfaced through a compact, stable table-toolbar status
  and a deliberate review panel. Review shows human-readable before/after values first and exact SQL
  as optional technical detail, distinguishes insert/update/delete, supports targeted undo, blocks
  invalid operations, and returns focus to the failed field/row. Normal commit remains explicit and
  destructive operations retain stronger confirmation.
- Related surfaces: pending-changes model, CommitBar, RowsTable, mutation preview, error mapping.
- Risk: high because review copy must never misstate the exact transactional operation.

### A22 - Missing shared Button and Select contracts

- Journey and evidence: inventory the control layer across `packages/ui` and `apps/web`.
- User experience: 132 raw `<button>` instances across 40 files repeat subtly different padding,
  typography, focus, disabled, icon, and color rules. Six native `<select>` controls use unrelated
  styling in export, CSV mapping, and schema dialogs. Controls that serve the same role do not
  always look or behave the same.
- Cause: the shared primitive layer has date-time, segmented, and dialog helpers but no Button,
  IconButton, Select/Combobox, Field, or editor-action contract. A `ViewButton` and `ActionButton`
  are local one-offs.
- Direction: create consumer-driven shared primitives with Qyre-specific compact sizes and semantic
  variants. The custom Select must implement labelled combobox/listbox semantics, keyboard
  navigation, typeahead, disabled items, collision-aware positioning, scrolling, and visible focus.
  Migrate by approved workflow, not through one uncontrolled mechanical rewrite.
- Related surfaces: editing, commit, filters, export, CSV mapping, schema dialogs, shell actions.
- Risk: medium; custom selects can regress accessibility if they imitate a select visually without
  the full keyboard and screen-reader contract.

### A23 - Normal writable status is footer noise

- Journey and reproduction: use a normal writable connection and inspect the footer information
  hierarchy.
- User experience: `read-write` repeats the presence of visible write actions but does not help the
  user decide anything. It competes with connection, engine, database/schema, and latency facts.
- Cause: access status is rendered symmetrically even though only the exceptional read-only state
  changes the user's workflow.
- Direction: remove the normal `read-write` label. Preserve an explicit read-only/restricted
  indicator, with reason, only when it explains missing or blocked actions; surface it near the
  affected work area as well as in global status when appropriate.
- Related surfaces: StatusBar, table toolbar, capability reasons, restricted sessions.
- Risk: low, but read-only enforcement and explanation must remain more visible, not less.

## Systemic causes

1. **Dense primitives lack bounded-content contracts.** Tables, grants, and graphs render all
   available content literally rather than choosing readable defaults with full-detail escape
   hatches.
2. **Visual hiding is not semantic hiding.** Overlay state is expressed in transforms instead of a
   shared lifecycle that owns focus and the accessibility tree.
3. **Interaction density grew without a composite keyboard model.** Reusable cells became buttons,
   but the grid never acquired one predictable entry/navigation/exit convention.
4. **Capability gating is stronger than task-state gating.** Qyre correctly hides unauthorized
   writes, but incomplete inserts and inert selection are not gated by what the user can currently
   complete.
5. **Settings mixes overview and exhaustive diagnostics.** Preference tasks compete with raw access
   evidence whose volume is orders of magnitude larger.
6. **Feedback semantics are feature-local.** Error, status, log, and empty states use inconsistent
   markup and announcement behavior.
7. **The design-system contract is documented but not mechanically defended.** Recent semantic
   tokens coexist with older opacity utilities and invalid raw variables.
8. **Editing reused read/filter primitives without a mutation-fidelity contract.** A minute-
   precision filter widget, coarse filter type categories, and cell display components were
   promoted into write workflows even when a safe edit needs stricter round-trip guarantees.
9. **Edit, add, and commit were delivered as separate controls instead of one state machine.** Row
   selection, editor geometry, validation, staged review, targeted undo, commit, and recovery do not
   share one interaction model.
10. **The shared control layer is incomplete.** Repeated raw buttons and native selects encode
    size, state, focus, and color locally, so related actions drift and improvements cannot propagate.

## Proposed experience direction

Qyre should feel like a calm, precise database workbench: dense enough for experts, legible enough
for occasional users, explicit about connection and access state, and conservative around writes.
Editing must feel deliberate, lossless, and spatially stable: selecting a row never accidentally
starts an edit; a quick scalar edit never changes table geometry; complex values get sufficient
space; Add row is one guided form task; and Commit is a clear review and recovery step. The primary
task should stay stable while exceptional detail is available on demand. Keyboard users should enter
a complex surface once, work efficiently within it, and leave it once. Responsive behavior should
preserve the data workspace through controlled internal scrolling and collapsible navigation, not
shrink content until it is unreadable. Visual refinement should come from semantic tokens and shared
primitives, never page-specific decoration.

## Proposed implementation slices

These IDs are proposed and will only be added/promoted after approval. Each slice ends with its
narrow verification and interactive review before the next begins.

### Slice 1 - DF-11: Editing integrity and stable scalar interaction

Outcome: editing cannot silently alter temporal precision, and row/cell interaction remains spatially
stable and predictable.

Acceptance criteria:

- The row-editing and type-fidelity specifications are corrected before production code changes.
- Unsafe time/timestamp mutation paths are disabled until they can round-trip losslessly.
- A mutation-specific editor capability matrix distinguishes date, time, local timestamp, timezone
  timestamp, numeric, identifier, boolean, text, enum/set, structured, binary, and unknown kinds.
- Editing an unchanged temporal value preserves its exact seconds, fractional precision, and offset;
  each explicit part change has a visible before/after representation.
- Single row click selects only. Cell edit activation is consistent by pointer and `Enter`/`F2`.
- Scalar editors preserve row height and column geometry; Escape cancels and Enter applies the draft.
- Clicking another body cell dismisses any active scalar, structured, or inserted-row editor.
- Timestamp date selection reuses the filter calendar and preserves the exact stored time suffix.
- PostgreSQL, MySQL, and SQLite temporal round-trip tests cover precision, offsets, null, invalid,
  and DST-boundary values; MongoDB is explicitly not applicable to SQL cell editing.

### Slice 2 - DF-12: Shared controls and complete typed editors

Outcome: every safely editable type has a deliberate, accessible editor built from consistent Qyre
controls; unsupported types explain why they are read-only.

Acceptance criteria:

- Shared Button, IconButton, Field, Select/Combobox, and editor-action primitives define compact
  sizes, variants, focus, disabled, loading, destructive, and icon-only behavior.
- Custom Select/Combobox implements labelled combobox/listbox semantics, arrows, Home/End, Escape,
  Enter, typeahead, disabled options, scroll, portal/collision behavior, and focus restoration.
- Text/multiline, exact numeric/decimal, UUID/identifier, tri-state boolean, enum/set, date/time,
  timestamp, JSON/JSONB, and supported array editors each validate without silent coercion.
- Structured editing provides syntax error location, formatting, full-value space, and lossless
  before/after preview. SQL JSON/array editing opens directly in the shared right-side drawer with
  no intermediate popover or duplicated metadata. MongoDB reuses the structured editor while
  preserving Extended JSON.
- Binary and unknown types remain read-only unless an engine-specific lossless contract is approved;
  the cell explains the limitation.
- Server validation and all applicable drivers gain conformance coverage for newly editable
  structured types; read-only and permission guards remain authoritative.
- The row-editing specification records the per-engine editable-type matrix and wire formats.

### Slice 3 - DF-13: Guided Add and Duplicate row composer

Outcome: creating a row is one bounded, understandable task instead of an unstable row of controls
inside the data grid.

Acceptance criteria:

- Add row and Duplicate open a dedicated responsive composer without changing table geometry.
- The composer identifies required, optional, nullable, defaulted, generated, and non-editable
  fields from authoritative metadata; it never guesses a default value.
- It uses the DF-12 typed editor registry, focuses the first meaningful field, supports complete
  keyboard traversal, and keeps primary actions stable at every viewport.
- Known-invalid drafts cannot be staged; errors are associated with fields and summarized with
  first-error navigation.
- Large schemas remain usable through search/grouping or progressive sections without hiding
  required fields.
- PostgreSQL, MySQL, and SQLite cover generated keys/default/nullability differences; MongoDB Insert
  document uses the structured composer contract where applicable.

### Slice 4 - DF-14: Pending-change review, commit, and recovery

Outcome: users always understand what will change, can undo a specific operation, and can recover
from failure without losing work or hunting for the affected row.

Acceptance criteria:

- A compact pending-change status in the table toolbar does not resize the grid when the first
  change is staged.
- A deliberate review panel groups insert/update/delete operations and leads with readable
  before/after values; exact generated SQL remains available as technical detail.
- Users can undo a cell, row, or operation, discard all with explicit confirmation, and return from
  review without losing drafts.
- Commit is disabled for invalid operations, remains explicit, and states transaction scope.
- Failure identifies the operation and field/row, preserves all drafts, restores focus to the
  problem, and distinguishes validation, permission, constraint, conflict, and connection errors.
- Successful commit reports affected operations, refreshes data without selection/focus jumps, and
  clears only committed state.

### Slice 5 - DF-15: Bounded, accessible data-grid foundation

Outcome: dense data remains readable and keyboard-efficient at every practical desktop width.

Acceptance criteria:

- Columns use documented type-aware min/default/max sizing; long values expose full content without
  making later fields unreachable.
- Short dense data retains current useful row density; internal horizontal scrolling is preserved.
- Sort controls are semantic buttons with `aria-sort`.
- A documented composite-grid model provides one entry/exit tab stop and arrow navigation without
  harming native screen-reader table navigation.
- Selection appears only when an available operation consumes it; forced read-only/restricted
  tables contain no inert selection controls.
- Before/after captures cover 1440, 800, 640, 400, and 320px in both themes.

### Slice 6 - DF-16: Overlay, feedback, and first-use accessibility

Outcome: hidden controls are unreachable, important state is announced predictably, and first-use
connection recovery is understandable.

Acceptance criteria:

- Closed drawers are inert and absent from the accessibility tree; open overlays own labels,
  deterministic initial focus, containment, Escape/cancel, and restoration.
- Shared error/status/log/empty primitives announce deliberately without duplicate noise.
- Disconnected, connecting, connected-empty, and failed states have distinct language.
- Known connection errors map to actionable summaries/fields with redacted technical details behind
  disclosure; direct connection is primary and CLI launch remains an expert alternative.
- Security contracts for recent targets, credentials, token auth, permissions, and destructive
  confirmation remain unchanged.

### Slice 7 - DF-17: Scalable Access and Settings information architecture

Outcome: preferences remain quickly reachable while exact access evidence scales to thousands of
grants.

Acceptance criteria:

- Access and Preferences are distinct navigable sections with stable focus and view state.
- Access leads with identity, effective mode, roles, and bounded summaries.
- Grants can be grouped, filtered, and expanded to raw facts; truncation is always explicit.
- Rendering and keyboard navigation remain responsive with 0, 20, 1,000, and long-name grants.
- Summaries never imply privileges beyond the authoritative raw response.
- 1440, 800, and 640px layouts pass accessibility checks in both themes.

### Slice 8 - DF-18: Schema orientation, empty states, and shell hierarchy

Outcome: users can orient themselves, understand unavailable/empty states, and see only status that
changes a decision.

Acceptance criteria:

- Schema grid exposes useful heading/group semantics; Graph defaults remain readable for sparse,
  dense, cyclic, and long-name fixtures with Grid fallback.
- Files, schema, history, and disconnected surfaces distinguish unavailable, empty, loading, and
  error with one relevant action.
- Normal writable sessions no longer show `read-write` in the footer.
- Read-only/restricted status and its reason remain clearly visible where missing actions need
  explanation; security behavior is unchanged.
- Responsive checks cover expanded/collapsed navigation and 320-1440px widths.

### Slice 9 - DF-19: Product-wide design-system and local-first finish

Outcome: colors, sizes, control behavior, targets, and typography feel like one restrained system,
and the packaged UI has no avoidable third-party font dependency.

Acceptance criteria:

- Editing-derived shared controls migrate to other approved consumers by workflow; no parallel
  one-off Button/Select variants remain without a documented reason.
- Default, hover, active, focus-visible, disabled, loading, selected, invalid, and destructive states
  have consistent token-based color, size, alignment, and motion in both themes.
- Remaining semantic quiet text uses approved tokens; every color variable resolves; scrollbar
  rules work in supported browsers.
- Compact glyphs keep their size while eligible target boxes meet WCAG 2.2 sizing/spacing.
- Approved fonts are bundled legally or a documented system stack is adopted; offline startup makes
  no font request and avoids disruptive metric shifts.
- Narrow executable checks prevent token and primitive regressions.
- Both themes pass automated and manual contrast, focus, state, target, and responsive review.

## Dependencies and sequence

1. DF-11 first because silent mutation fidelity loss outranks visual work and establishes stable
   editing geometry.
2. DF-12 builds the type/editor and control contracts required by every later write surface.
3. DF-13 replaces Add/Duplicate only after the typed editor registry exists.
4. DF-14 completes the write journey with coherent review, commit, and recovery.
5. DF-15 then applies stable editing geometry to grid sizing and keyboard navigation.
6. DF-16 establishes shared overlay/feedback behavior and applies it to first use.
7. DF-17 addresses Settings' independent high-volume information architecture.
8. DF-18 resolves orientation, empty states, and footer hierarchy.
9. DF-19 performs controlled product-wide primitive/token migration after real consumers have proven
   the contracts, preventing a speculative component library or repeated visual churn.

DF-11 through DF-14 are separate because data fidelity, reusable typed controls, row composition,
and transaction review have different security and regression surfaces. They form one continuous
editing journey and must be re-exercised together after each slice. DF-19 is deliberately last:
shared primitives originate in real editing consumers, then migrate product-wide once their API is
proven.

## Verification strategy

Per slice:

1. Run the narrowest affected package tests and builds.
2. Run focused Playwright coverage for the journey, including keyboard assertions and Axe where
   appropriate.
3. Exercise the live workflow with realistic short/long/dense data in both themes.
4. Capture before/after evidence at the slice's stated widths.
5. Recheck writable, forced-read-only, and restricted-role behavior.
6. State verified and not-applicable engines explicitly.
7. Run `pnpm verify:pr`, review the complete diff, push the feature branch, wait for both CI jobs,
   and only then mark the slice passing.

Plan exit gate:

- Repeat the journey map end to end across all four engines.
- Repeat role/read-only and destructive-action suites.
- Run the full repository delivery gate and both-theme accessibility suite.
- Compare every accepted finding against before/after evidence at 1440, 800, 640, 400, and 320px
  where relevant.
- Confirm no new one-off tokens, responsive exceptions, inaccessible names, or overlay conventions.

## Risks and likely regressions

- Temporal editing can corrupt stored values if any engine's raw precision/offset contract is
  normalized through JavaScript or minute-only UI state.
- Structured editors can stringify database-native JSON/array/BSON values incorrectly unless the
  browser, server, and driver share one explicit wire-format contract.
- Data-grid changes can reduce useful density, obscure full values, or break edit/copy behavior.
- Composite keyboard behavior can conflict with native table and screen-reader navigation.
- Local insert validation can disagree with engine defaults or server-side constraints.
- Custom Select/Combobox and editor overlays can regress keyboard navigation, accessible naming,
  focus restoration, or collision handling if they provide only themed visuals.
- Privilege summaries can accidentally overstate access if treated as authoritative.
- Live regions can become noisy and overlays can lose retained state during transitions.
- Bundled fonts can increase package size and change text metrics/column truncation.
- Broader targets can inflate rows/toolbars if hit area and glyph size are not separated.
- Graph layout improvements can help small schemas while degrading large/cyclic schemas.

Mitigations are encoded in slice acceptance criteria: preserve exact raw/full values, keep the
database as authority, use per-type engine fixture matrices, retain screen-reader semantics, compare
density and responsive captures, and run the existing role/engine E2E gate after every slice.

## Deliberately deferred

- Mobile-first editing: Qyre is a professional desktop workbench; 320-400px checks protect reflow and
  recovery, not full phone optimization.
- Editable arbitrary SQL result sets: unrelated data-lineage and mutation-safety problem.
- Multi-connection workspaces or query tabs: information architecture expansion not evidenced by
  this audit.
- Large-scale visual rebrand, animation system, illustrations, increased radii/elevation, or looser
  density: subjective preferences without demonstrated user benefit.
- Table virtualization: the reproduced blocker is horizontal width and keyboard interaction;
  pagination already bounds rows. Revisit only with measured rendering latency.
- A graphical query-plan redesign: the current text plan is usable; semantic status is the verified
  issue.
- New privilege-management actions: Access remains a viewer by product/security design.
- JS bundle splitting: the build reported a 1.166MB minified main chunk, but this audit did not
  establish a user-visible latency regression. Measure cold-start and interaction timing before
  scheduling performance work.

## Subjective observations excluded from scope

The dark palette, compact typography, square radii, muted borders, and IDE-like density are not
findings by themselves. They support the product model and should remain. No change is proposed
solely because another database tool uses a different aesthetic. The graph, grid, and Settings
changes above are driven by measurable reach, accessibility semantics, or task completion, not
personal taste.

## Approved decisions

1. The revised nine-slice sequence puts editing integrity and the complete write journey first.
2. Row click selects; stable inline editing serves quick scalar
   changes; complex values use a larger secondary editor; neither changes grid geometry.
3. The inline Add/Duplicate draft row will be replaced by a dedicated responsive row composer.
4. Shared Qyre Button/IconButton/Field/Select/Combobox primitives will replace native
   selects in approved workflows; the custom selector must meet the full accessibility contract.
5. The detached CommitBar will be replaced by toolbar pending status plus a deliberate review and
   recovery panel while preserving explicit transactional confirmation.
6. The normal `read-write` footer label will be removed while retaining stronger contextual
   read-only/restricted explanations.
7. Access and Preferences will be separated within one Settings destination.
8. The remote font request will be eliminated; bundling versus a system stack will be decided from
   licensing, package size, and metric comparison during DF-19.

## Progress log

- 2026-07-15: Confirmed `main`, clean worktree, and no active feature. Read product, frontend,
  architecture, security, structure, naming, feature, plan, and design-system guidance.
- 2026-07-15: `pnpm check:quiet` passed. Full Playwright E2E passed on Node 22: 29 passed and 43
  intentional project skips across all engines and access projects.
- 2026-07-15: Completed live audit with 35 screenshots, DOM/source inspection, light/dark themes,
  realistic dense data, all four engines, forced read-only, restricted role, and 320-1440px widths.
- 2026-07-15: Created DF-10 and this approval-gated plan. Current step: obtain explicit approval.
- 2026-07-15: User review rejected the current editing, add-row, commit, selector, button, and footer
  experience. Follow-up source audit confirmed conflicting row/edit gestures, unstable inline editor
  geometry, structured-type exclusion, fragmented controls, and a critical minute-only temporal
  mutation risk. Revised the plan to put the complete write journey first. No production code
  changed.
- 2026-07-15: User explicitly approved the revised plan. Current step: deliver DF-10, then activate
  DF-11 and implement editing integrity only.
- 2026-07-15: DF-10 delivered in draft PR #157 at `c24b1b3`; local, pre-push, and both GitHub CI
  gates passed. Current step: activate DF-11.
- 2026-07-15: Activated DF-11 on `feature/DF-11-editing-integrity`. Corrected the row-editing and
  type-fidelity contracts before production changes: filtering no longer defines mutation-editor
  safety, and time/timestamp editing must fail closed until it can preserve precision and offsets.
- 2026-07-15: Implemented the mutation-specific capability matrix and stable scalar edit activation.
  Focused core, UI, and web suites passed (69, 371, and 148 tests), UI/web typechecks and builds
  passed, and the focused writable/read-only E2E run passed. Live Postgres review at 1440, 1024,
  and 768px confirmed pointer and F2 activation, Escape focus restoration, no row selection from a
  cell action, unchanged 29.25px row geometry while editing, no page overflow, and no console
  errors. Current step: full delivery gate and draft PR.
- 2026-07-15: DF-11 full `pnpm verify:pr` passed: 34/34 package tasks, 11 smoke E2E with four
  expected project skips, and 29 full E2E with 43 expected project skips. Current step: review,
  commit, push, draft PR, and CI.
- 2026-07-15: DF-11 merged in PR #158 at `a6330fa`. Activated DF-12 on
  `feature/DF-12-shared-typed-editors`; current step: specify and implement shared controls plus the
  lossless typed-editor registry.
- 2026-07-15: Implemented DF-12's shared Button, IconButton, Field, custom Select/Combobox, editor
  actions, and typed editor registry. PostgreSQL enum/array and MySQL enum/set introspection now
  supplies authoritative editor metadata; exact numeric, temporal, JSON/JSONB, native array, SET,
  boolean, identifier, text, and MongoDB structured values validate without browser coercion.
  Unsupported binary/XML/unknown paths remain read-only.
- 2026-07-15: Live PostgreSQL review verified custom-selector keyboard behavior, JSON syntax errors
  with line/column, Escape focus restoration, distinct structured inspect/edit actions, add-row
  typed staging, commit persistence, and editor collision containment at 848px and 640px with no
  document overflow. The live-found sticky-header clipping defect is covered by viewport-position
  unit tests.
- 2026-07-15: DF-12 full `pnpm verify:pr` passed: 34/34 package tasks, 11 smoke E2E with four
  expected project skips, and 29 full E2E with 43 expected project skips. Focused writable,
  MongoDB, read-only, and structured-inspector workflows also passed. Current step: review, commit,
  push, open the draft PR, and wait for CI before marking DF-12 passing.
- 2026-07-15: DF-12 is passing in draft PR #159 at `fc57253`; the pre-push full gate and both
  GitHub CI jobs passed. Current step: merge PR #159, return to `main`, then activate DF-13.
- 2026-07-16: F146 follow-up removed SQL Editor Analyze, made all grid editors dismiss when another
  body cell is clicked, and replaced the nested timestamp date/time popup with the shared filter
  calendar panel while preserving the complete stored time suffix. Current step: local PR gate and
  push to draft PR #160; GitHub Actions credits remain unavailable.
- 2026-07-16: User approved simplifying SQL JSON/array mutation editing to the existing right-side
  drawer. Existing-row and inserted-row structured editors now skip the anchored popover/Expand
  step and remove duplicated metadata, helper copy, Minify, and Copy while retaining Format,
  validation, nullable selection, Cancel, and Apply. Current step: full local PR gate and push to
  draft PR #160; GitHub Actions credits remain unavailable.
- 2026-07-16: F146 round 7 invalidates catalog/table/row caches after successful non-read SQL so
  DDL-created tables appear without reload, and adds lossless mutation contracts for binary hex
  across PostgreSQL/MySQL/SQLite plus PostgreSQL bit strings, network text, and raw XML. Focused
  SQL-driver and browser E2E proves bound-value round trips, sidebar refresh, and persistence;
  full local `pnpm verify:pr` passes 34/34 package tasks, 11 smoke E2E with four expected skips, and
  30 full E2E with 47 expected skips. Current step: commit and push to draft PR #160; GitHub Actions
  credits remain unavailable.
- 2026-07-16: F146 round 8 restores lossless date/time/time-zone editing, adds a raw PostgreSQL
  interval drawer, bounds JSON/binary drawers to the viewport with fixed actions, restores JSON
  Format/Minify/Copy, and adds a grouped bytes editor with byte count and ASCII preview. Native
  structured containment now covers PostgreSQL JSON/arrays, MySQL JSON, and MongoDB objects/arrays;
  enum equality filters use the shared selector, while SQLite remains explicitly unsupported.
  Focused unit/live-integration and PostgreSQL browser E2E pass; compact 1280x720 visual QA confirms
  the editor controls remain visible. Full local `pnpm verify:pr` passes 34/34 package tasks, 11
  smoke E2E with four expected skips, and 30 full E2E with 47 expected skips. Round 8 is pushed to
  draft PR #160 as `bdf2667`; both GitHub jobs fail before any steps because Actions credits remain
  unavailable. Current step: rerun CI when credits return, then move F146 to passing.
- 2026-07-16: F146 round 9 keeps the shortened scalar display value invisibly in table layout while
  its absolute inline editor is active, preventing long-text columns from collapsing on
  double-click. Component coverage and a real-browser fixture verify identical before/edit widths;
  local `pnpm verify:pr` again passes 34/34 package tasks, 11 smoke E2E with four expected skips,
  and 30 full E2E with 47 expected skips. Implemented as `c74d70a`; current step remains rerunning
  CI when Actions credits return.
- 2026-07-16: F146 round 10 changes SQL structured `contains` to ordinary escaped substring text
  for PostgreSQL JSON/arrays, MySQL JSON, and SQLite JSON while retaining MongoDB's native JSON
  candidate contract. Legacy PostgreSQL interval objects serialize back to editable interval text,
  and every drawer disables click and keyboard Apply from the same parser used for staging. Focused
  component/driver tests and PostgreSQL browser QA pass; local `pnpm verify:pr` passes 34/34 package
  tasks, 11 smoke E2E with four expected skips, and 30 full E2E with 47 expected skips. Implemented
  as `148d4b7`; current step remains rerunning CI when Actions credits return.
- 2026-07-16: F146 round 11 normalizes transport-level Buffer objects to canonical hex while
  staging Duplicate row, preventing untouched PostgreSQL bytea, MySQL binary/blob, and SQLite BLOB
  values from failing insert validation. Component regression coverage, all 426 UI tests, and local
  `pnpm verify:pr` pass; implemented as `6bd5276`. Current step remains rerunning CI when Actions
  credits return.
- 2026-07-16: F146 round 12 replaces MongoDB's separate whole-document editor with the shared
  Add/Duplicate/edit/delete/Commit grid. The commit endpoint accepts JSON operations; MongoDB
  updates apply only changed top-level fields through `$set`, preserve current BSON types, and use
  original-value guards for same-field conflict detection. SQL preview lines remain statements;
  MongoDB preview lines are JSON operations. Focused unit/live-integration and MongoDB browser E2E
  pass. The full local `pnpm verify:pr` gate passes with 34/34 package tasks, check:state, smoke E2E
  (11 passed, 4 skipped), and full E2E (30 passed, 47 skipped). This round remains intentionally
  uncommitted and unpushed pending user UI approval.
- 2026-07-16: F146 round 13 maps MongoDB regex, timestamp, code, MinKey, and MaxKey fields to exact
  validated JSON drawer shapes, preloads valid Add-row templates, converts inserts to canonical
  Extended JSON, and preserves native BSON types during field-level updates. Focused core/UI/server
  suites pass with 124/420/307 tests, live MongoDB passes 76 tests, and the full local
  `pnpm verify:pr` gate passes with 34/34 package tasks, check:state, smoke E2E (11 passed, 4
  skipped), and full E2E (30 passed, 47 skipped). This round remains intentionally uncommitted and
  unpushed pending user UI approval.
- 2026-07-16: F146 round 14 fixes MongoDB row commits whose `_id` crossed the UI boundary as an
  ObjectId/Extended JSON object instead of a 24-hex string. The adapter now normalizes ObjectIds to
  stable lowercase hex across BSON package instances, and server validation accepts the safe
  `{ "$oid": "..." }` form as a fallback. Server tests pass 308/308, live MongoDB passes 77/77,
  the focused Mongo browser commit journey passes, and the full local gate passes with 34/34 package
  tasks, smoke E2E (11 passed, 4 skipped), and full E2E (30 passed, 47 skipped). This remains
  intentionally uncommitted and unpushed pending user approval.
- 2026-07-16: F146 round 15 accepts the exact legacy `{ buffer: { "0": byte, ... "11": byte } }`
  ObjectId shape retained by an already-open pre-fix browser page, while rejecting every other
  object shape. The rebuilt production endpoint committed and restored a real MongoDB demo row
  with that payload; the rebuilt browser UI then committed and restored the row again. Server tests
  pass 309/309, and the Node 22 full gate passes with 34/34 package tasks, smoke E2E (11 passed, 4
  skipped), and full E2E (30 passed, 47 skipped). This remains intentionally uncommitted and
  unpushed pending user approval.
- 2026-07-16: F146 round 16 fixes fast click-away staging for inline scalar inputs. Blur now reads
  the live DOM input value instead of a potentially one-render-old React draft, so leaving a cell
  cannot drop the final edit while Enter succeeds. All 421 UI tests pass with a timing regression,
  and rebuilt production browser checks stage the changed value on click-away in MongoDB and
  PostgreSQL. Rounds 12-16 are pushed to draft PR #160 as `b06a89d`; the Node 22 local and pre-push
  gates pass. Both hosted CI jobs still fail before any steps while Actions credits are unavailable.
- 2026-07-16: F147 addresses post-merge Tables smoke-QA findings. Inline Enter/Tab and filter
  keyboard actions now read the live input value instead of render-lagged state; returning to the
  filter's column step restores search focus so Escape closes predictably; and declared SQLite
  BOOLEAN values display as true/false without changing MySQL TINYINT(1) or raw copy/export data.
  UI tests pass 426/426 and five focused PostgreSQL browser journeys cover the immediate-input race,
  filter keyboard flow, and existing edit/connect behavior. The Node 22 full local PR gate passes
  with 34/34 package tasks, smoke E2E (11 passed, 4 skipped), and full E2E (32 passed, 55 skipped).
  Current step: review, commit, push, and open the draft PR.
