# Product Contract: SQL Editor Query History & Autocomplete

The SQL Editor (`QueryRunner`, `packages/ui/src/components/query-runner.tsx`) lets a developer run
read-only SQL against the connected database (F006). This spec covers two engine-agnostic
enhancements to that same editor: recalling past queries, and completion-as-you-type. Both apply
identically regardless of which engine (Postgres, SQLite, and whatever else `@humbdb/driver-contract`
gains) is currently connected.

## One-sentence promise

A developer never has to retype or hunt through scrollback for a query they already ran, and gets
SQL keyword/table completion as they type instead of relying on memory or the Schema tab.

## Query History

### Behavior

- A history icon sits in the SQL Editor's toolbar (next to Run). Clicking it opens a panel that
  slides in from the right edge of the viewport (a drawer, not a centered modal - it must stay open
  alongside the editor so a card can be clicked without losing sight of the current query).
- The panel lists past queries as cards, most recent first. Each card shows the query text
  (truncated with an ellipsis if long) and a relative timestamp (e.g. "2m ago").
- Clicking a card closes the panel and replaces the SQL Editor's current content with that query's
  text. It does **not** auto-run the query - the developer reviews/edits, then presses Run
  themselves, same as if they'd typed it.
- Only queries that ran **successfully** (no `ReadOnlyViolationError`, no adapter error) are
  recorded. A query that failed never appears in history - the developer was still mid-edit at that
  point, not at a query worth recalling.
- History is stored in the browser (`localStorage`), not the server - Humb has no server-side
  per-user storage today and this is a convenience feature, not an audit log (Console/DF-07 already
  covers server-side event logging). It persists across page reloads and across which database
  target is currently connected (one shared list, not scoped per connection) - simplest model, and
  matches how a developer actually thinks about "queries I've run recently" while working across
  multiple local databases in a session.
- Capped at the 50 most recent queries; the oldest entry is dropped once the cap is exceeded, the
  same bounded-list approach DF-07's server-side event log already uses.
- Duplicate consecutive entries (re-running the exact same query text) are not stored twice - move
  the existing entry to the front (most-recent) instead of appending a duplicate card.

### Out of scope (for now)

- Editing or deleting individual history entries (a "clear all" action may be worth adding but is not
  required for v1 - decide when picked up, matching DF-07's Console "Clear" precedent if added).
- Any server-side persistence or cross-browser/cross-device sync.
- Recording failed queries (see above - deliberately excluded, not an oversight).

### Acceptance criteria

- Running a query successfully adds it to the history panel, visible immediately without a reload.
- A failed query (rejected by the read-only check, or an adapter error) never appears in history.
- Clicking a history card prefills the SQL Editor with that exact query text and closes the panel;
  the query is not executed automatically.
- History survives a full page reload (backed by `localStorage`).
- The panel opens as a right-anchored slide-in drawer, not a centered/blocking modal.

## Autocomplete

### Behavior

- As the developer types in the SQL Editor, a completion popup appears near the cursor offering
  relevant suggestions:
  - **SQL keywords**: typing `SE` offers `SELECT` (and any other keyword starting with `SE`); typing
    `WHE` offers `WHERE`; etc. Only read-only-relevant keywords need be offered as a practical
    default (`SELECT`, `FROM`, `WHERE`, `JOIN`, `ORDER BY`, `GROUP BY`, `LIMIT`, `HAVING`, `AS`,
    `DISTINCT`, `AND`, `OR`, `IN`, `LIKE`, `NULL`, `IS`) - a full exhaustive SQL grammar is not
    required, since Humb's query runner rejects anything non-`SELECT`-shaped anyway (F006).
  - **Table names**: after `FROM ` (or `JOIN `), suggestions are the connected database's actual
    table names (e.g. `SELECT * FROM hu` offers `humb_demo_users` if that table exists), sourced from
    the same schema data the Schema tab already fetches (DF-05's `useAllTables`/overview endpoint) -
    no new backend endpoint required, this is a frontend-only feature consuming existing data.
  - Column-name completion is explicitly out of scope for this pass (see below).
- Accepting a suggestion (Enter/Tab, or a mouse click) replaces the in-progress word with the
  completion and keeps typing flow uninterrupted.
- Suggestions are schema-aware but never executed against the database to produce themselves - they
  come from data already fetched for the Schema tab, not a new query fired on every keystroke.

### Editor migration

The SQL Editor is implemented today as a plain `<textarea>` with a hand-rolled line-number gutter
(no code-editor library) - see `packages/ui/src/components/query-runner.tsx`. Building cursor-aware
popup positioning, a keyword trie, and table-name matching directly on a raw textarea is real,
maintenance-heavy custom work with no syntax highlighting to show for it.

Decision: migrate the SQL Editor to **CodeMirror 6** (`@codemirror/lang-sql` + `@codemirror/autocomplete`),
which provides SQL syntax highlighting and a schema-aware completion source out of the box (its SQL
language package accepts a `schema` option - table/column names - and keyword completion comes with
the language package itself). This replaces the existing textarea + custom gutter entirely; CodeMirror
supplies its own gutter, so the hand-rolled one is deleted, not kept alongside.

Constraints on the migration:

- Preserve existing behavior exactly: `⌘/Ctrl+Enter` runs the query, the toolbar (Run
  button/spinner/line count) is unchanged, `data-testid="query-runner"` and the query text prop
  contract (`sql`/`onSqlChange`) stay the same so `apps/web/src/App.tsx`'s usage doesn't need to
  change shape.
- Match the existing design tokens (see `docs/references/design-system.md`) - font, colors, spacing -
  rather than adopting CodeMirror's default theme as-is. Both light and dark mode must render
  correctly (per this repo's standard verification expectation, `FRONTEND.md`).
- `packages/ui` must not fetch data (per `FRONTEND.md`'s guardrail) - the schema data CodeMirror's SQL
  extension needs (table names) must be passed in as a prop from `apps/web` (which already has it via
  `useAllTables`), not fetched inside `packages/ui` itself.

### Out of scope (for now)

- Column-name completion (e.g. suggesting columns after `SELECT ` or `table.`) - meaningfully more
  scope (needs each table's column list available up front, not just table names) and is a natural
  follow-up once table-name completion is proven out, not required for v1.
- Autocomplete for anything beyond `SELECT`-shaped queries (matches the query runner's own
  read-only-only scope - there is no reason to suggest `INSERT`/`UPDATE`/`DELETE` keywords the server
  will reject anyway).

### Acceptance criteria

- Typing a partial SQL keyword shows matching keyword completions in a popup near the cursor.
- Typing a partial table name after `FROM `/`JOIN ` shows matching real table names from the
  connected database.
- Accepting a suggestion inserts it in place of the in-progress word.
- The editor still supports `⌘/Ctrl+Enter` to run, matches existing visual design in both themes, and
  the Files tab's read-only SQL preview (DF-06, if it also uses a shared editor component) is
  unaffected if left as plain text - this spec only requires the migration for the SQL Editor tab
  itself.

## Double-quoted string values (Postgres)

### Behavior

SQL reserves double quotes (`"..."`) for identifiers (columns/tables) and single quotes (`'...'`)
for string literals - but Postgres is the strictest of Humb's engines about this: it always throws
`column "X" does not exist` for `WHERE col="X"`, where most other tools are more forgiving (MySQL
treats `"..."` as a string by default; SQLite falls back to treating a double-quoted token as a
string whenever it doesn't match a real identifier - a documented quirk, see
[sqlite.org/quirks.html](https://sqlite.org/quirks.html)). Since most people reach for `""` out of
habit, Humb smooths this over for Postgres specifically:

- Before executing a query against Postgres, any double-quoted token in the SQL text that does not
  match a real schema, table, or column name in the connected database - nor an identifier the
  query defines itself (a column/table alias or CTE name) - is rewritten to an equivalent
  single-quoted string literal.
- A double-quoted token that **does** match a real schema/table/column name (including a
  legitimately quoted case-sensitive identifier), or that refers back to an alias/CTE the query
  itself defined, is left untouched - this never changes the meaning of a query that already runs
  successfully today.
- The rewrite tokenizes the SQL rather than regex-replacing raw text: a `"` character that lives
  inside a `'...'` string literal or a `$$...$$`/`$tag$...$tag$` dollar-quoted block is never
  mistaken for identifier quoting, so it's never rewritten.
- Alias/CTE detection is a best-effort regex heuristic (not a full SQL parser) - it recognizes the
  common `AS alias`/`AS "alias"` and `name AS (...)` shapes, not every possible aliasing form.
- This is Postgres-only: SQLite already tolerates it natively; MySQL (F014) already treats `"..."`
  as a string by default, so neither engine needs the rewrite.

### Acceptance criteria

- `SELECT * FROM employees WHERE department="Support"` returns matching rows instead of erroring,
  when `"Support"` matches no real column/table name.
- `SELECT "department" FROM employees` (a real column, double-quoted) still works as a column
  reference, not a string literal.
- A single-quoted value (`department='Support'`) is unaffected - this only changes double-quote
  handling.
- `SELECT 'he said "hi" loudly' FROM users` runs unmodified - the `"hi"` lives inside a string
  literal, not as bare identifier quoting.
- `SELECT * FROM "public"."users"` runs unmodified - schema-qualified names resolve correctly.
- `SELECT "a" FROM (SELECT 1 AS a) sub` runs unmodified - a double-quoted reference to a
  query-local column alias is not coerced into a string literal.

## Multi-statement / semicolon detection (all engines)

### Behavior

`@humbdb/driver-contract`'s `assertReadOnly` rejects a query containing more than one SQL
statement - the read-only query runner only ever executes exactly one statement per request. The
`;`-count check runs against the same literal-and-comment-stripped text the forbidden-keyword scan
already uses, not raw SQL, so a data value that happens to contain a semicolon (a URL, an encoded
blob, free text) is not mistaken for a second statement. A single trailing `;` (a habit carried over
from other SQL tools) is still tolerated.

### Acceptance criteria

- `SELECT 'a;b' AS x` (or the equivalent with a double-quoted identifier) runs unmodified -
  the `;` lives inside a literal, not between two statements.
- `SELECT 'a;b' AS x; DROP TABLE users` is still rejected - a real second statement outside any
  literal is still a real second statement.
- `SELECT 'a;b' AS x;` (single statement, trailing semicolon) is still accepted.

## Statement timeout (all engines)

### Behavior

Every adapter caps how long a single read-only query or row fetch may run, so a heavyweight query
(a huge unindexed scan, a cartesian join) fails fast with a clear error instead of hanging the
request and holding a pool connection indefinitely. Configurable via `HUMB_STATEMENT_TIMEOUT_MS`
(one env var name shared across engines), default 30 seconds. The enforcement mechanism is
necessarily engine-specific:

- **Postgres**: `statement_timeout` set on the connection pool - `pg` issues `SET statement_timeout`
  on every new connection, so it covers introspection queries too, not just the query runner.
- **MySQL**: a per-query `timeout` option (mysql2 has no pool-level equivalent to pg's
  `statement_timeout`; the session-variable equivalent, `MAX_EXECUTION_TIME`, races the pool handing
  out a freshly created connection before the `SET` command lands - confirmed live). mysql2 cannot
  cancel the query server-side once the client-side timeout fires; it closes the connection instead,
  an acceptable cost for stopping a runaway query from holding the pool.
- **MongoDB**: `maxTimeMS` on the row-fetch (`getRows`) and field-sampling (`getTable`) cursors - the
  server itself enforces the cutoff.

### Acceptance criteria

- A query/row-fetch that runs longer than the configured timeout rejects with a timeout-shaped
  error instead of hanging.
- The timeout is configurable via `HUMB_STATEMENT_TIMEOUT_MS` and defaults to 30 seconds when unset.
