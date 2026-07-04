# Humb — Project Review & Suggestions

A holistic review of the repository at branch `feature/F015-mongodb-engine` (commit `2db5455`).
Findings are grouped by priority (Critical → High → Medium → Low), then by category. Each item
states **what** the issue is, **why** it matters, the **recommended fix**, and the **expected
impact**. Where a claim was verified by running code, that is noted.

The overall engineering quality here is high: clean layer boundaries, a defense-in-depth read-only
model, per-engine type-fidelity fixes, structured docs, and CI with real database services. Most
findings below are edge cases and hardening opportunities rather than systemic problems.

Severity is judged in the context of Humb's threat model: a **local-first, localhost-bound,
read-only** dev tool. Several items that would be Critical in a hosted service are downgraded
accordingly, and this is called out where relevant.

---

## Critical

_None found._ No remote code execution, no auth bypass on a network-exposed surface, no secret
leakage to third parties, and no known-vulnerable dependencies (`pnpm audit --prod` → "No known
vulnerabilities found"). The read-only enforcement has a genuine engine-level backstop
(`READ ONLY` transactions / `readonly` SQLite handle), so the heuristic string-scan gaps below are
defense-in-depth weaknesses, not full bypasses.

---

## High

### H1 — Query runner mangles SQL that contains double-quoted text inside string literals (Postgres) — correctness

**Category:** Reliability / Correctness (data query path)
**Where:** `packages/drivers/postgres/src/index.ts` `coerceUnknownQuotedIdentifiers`

`coerceUnknownQuotedIdentifiers` rewrites every `"..."` token that isn't a known table/column name
into a single-quoted string literal, but it runs against the **raw SQL** without first stripping
string literals. Verified live:

- `SELECT 'he said "hi" loudly' FROM users` →
  `SELECT 'he said 'hi' loudly' FROM users` — the `"hi"` inside the string literal is rewritten,
  producing broken SQL that then fails at the database.
- `SELECT * FROM "public"."users"` → `SELECT * FROM 'public'."users"` — schema-qualified names
  break, because only table/column names are collected into `knownIdentifiers`, never **schema**
  names.
- `SELECT "a" FROM (SELECT 1 AS a) sub` → `SELECT 'a' FROM (...)` — aliases and CTE names defined
  **within the query** are not in `knownIdentifiers`, so legitimate references to them get
  corrupted.

**Why it matters:** The feature exists to _help_ users who type `"value"` out of habit, but it
silently corrupts valid queries in three common shapes (string literals containing quotes, schema
qualification, in-query aliases). A user runs a correct SELECT and gets a confusing database error
for a query they never wrote.

**Fix:** Tokenize properly instead of regex-replacing raw text: skip content inside string
literals and dollar-quoted blocks (reuse the same passes `stripLiterals` already implements), add
schema names to `knownIdentifiers`, and don't rewrite tokens that are query-local aliases. Given
the sharp edges, also consider whether this "helpful coercion" earns its keep at all versus simply
surfacing Postgres's own `column "value" does not exist` error with a hint.

**Impact:** Removes a class of silent query corruption on the primary Postgres query path; makes
the SQL editor trustworthy for quoted identifiers and schema-qualified queries.

### H2 — `assertReadOnly` rejects valid queries with `;` or reserved words inside string literals — correctness

**Category:** Reliability / Correctness (data query path)
**Where:** `packages/drivers/contract/src/read-only.ts` `assertReadOnly`

The multiple-statement guard checks for `;` on `withoutComments`, which still contains string
literals. Verified live: `SELECT 'a;b' AS x` is **rejected** with "Multiple statements are not
allowed." The forbidden-keyword scan does strip literals first (`stripLiterals`), but the semicolon
and leading-keyword checks run before that, so any data value containing `;` fails.

**Why it matters:** Filtering by a value that contains a semicolon (URLs, encoded blobs, free text)
is a normal read-only query and is wrongly blocked. It makes the read-only runner feel broken for
legitimate use.

**Fix:** Run the semicolon / statement-count check against a literal-and-comment-stripped copy of
the SQL (the same normalized form used for the keyword scan), not the raw text. Keep the original
string for actual execution.

**Impact:** Eliminates false-positive rejections on valid SELECTs; the read-only gate stops
punishing benign data.

### H3 — `/api/tables/:schema/:table/rows` returns HTTP 500 with a raw Zod dump on bad pagination params — correctness / API contract

**Category:** Reliability / API consistency
**Where:** `packages/server/src/index.ts` (rows route) vs. `/api/query` (which does it correctly)

The rows route calls `rowsQuerySchema.parse(request.query)`, which **throws** on invalid input.
Verified live: `GET /api/tables/public/users/rows?page=abc` returns **500** with a body of
stringified Zod issues (`{"error":"[\n  {\n    \"code\": \"invalid_type\", ...`). The `/api/query`
route uses `safeParse` and returns a clean **400**, so the two endpoints disagree on how they
handle bad input.

**Why it matters:** A client-side bug or a hand-crafted URL yields a 500 (implying server fault)
plus an internal validation-schema dump in the response body. It's an inconsistent contract and
leaks implementation detail.

**Fix:** Use `rowsQuerySchema.safeParse(...)` and return `reply.status(400).send({ error: "..." })`
on failure, matching the `/api/query` pattern. Consider a small shared helper so every query/param
parse handles failure identically.

**Impact:** Correct 4xx semantics, a readable error, and one consistent validation pattern across
routes.

---

## Medium

### M1 — Symlink escapes the Files-tab root via the content endpoint — security (local, opt-in)

**Category:** Security (path traversal)
**Where:** `packages/server/src/files.ts` `resolveSqlFilePath` + `packages/server/src/index.ts`
`/api/files/content`

`buildFileTree`'s `walk` deliberately excludes symlinks from the listing, but the content endpoint
resolves any client-supplied `.sql` path directly and reads it. `resolveSqlFilePath` only validates
the **lexical** path (`resolve` + `startsWith(root)`); it never checks the **real** path. Verified
live: a symlink `evil.sql` inside the root pointing at `/etc/passwd`-style content outside the root
is accepted, `statSync().isFile()` is true (it follows the link), and `readFileSync` returns the
out-of-root file's contents.

**Why it matters:** Anything that can create a `.sql` symlink inside `--files-dir` (or a
pre-existing one) can read arbitrary files through the API. Mitigating context: the server is
localhost-only, `--files-dir` is opt-in and off by default, and the reader is limited to `.sql`
paths — so this is Medium, not High. But it directly contradicts the "Files tab security boundary"
the doc claims to enforce.

**Fix:** After `resolve`, call `realpathSync(absolutePath)` and re-assert it still starts with
`realpathSync(rootDir) + sep` before reading. Update the security-boundary doc to state that real
paths (not just lexical) are validated, and add a symlink-escape test.

**Impact:** Closes the one path that bypasses the documented boundary; brings behavior in line with
the spec.

### M2 — `redactConnectionString` does not redact credentials passed as query parameters — security

**Category:** Security (secret handling)
**Where:** `packages/core/src/connection-target.ts` `redactConnectionString`

Redaction only masks `url.password` (the `user:pass@host` form). Both `pg` and `mysql2` also accept
`?password=...` in the query string. Verified live:
`redactConnectionString("postgres://user@localhost:5432/db?password=supersecret")` returns the
string **unchanged** — the password is not masked. This redacted value is surfaced in
`/api/health`'s `target` field (shown in the UI title/status bar) and is the value intended for
"safe to log."

**Why it matters:** SECURITY.md commits to "never log [connection strings] in full" and to redact
credentials in "logs, errors, screenshots, and diagnostics." A query-param password defeats that
guarantee and can end up on screen or in logs.

**Fix:** After parsing, also scan `url.searchParams` for known credential keys (`password`, `pwd`,
`sslpassword`, `auth`, tokens) and replace their values with `***`. Add test cases for the
query-param form for each engine's accepted syntax.

**Impact:** Restores the documented redaction guarantee across all supported connection-string
shapes.

### M3 — No Host-header / DNS-rebinding protection on the local API — security

**Category:** Security (network boundary)
**Where:** `packages/server/src/index.ts` (no `onRequest` host check), `packages/cli/src/index.ts`

The server binds to `127.0.0.1` (good) and sets no CORS headers (so cross-origin _reads_ are
blocked by the browser). However, there is no `Host` header allow-list. A malicious web page the
developer visits can use **DNS rebinding** (resolve its own hostname to `127.0.0.1`) to make
_same-origin_ requests to `http://<attacker-domain>:7717/api/...` and read database schema, rows,
and query results — no auth stands in the way.

**Why it matters:** This is the classic residual risk for unauthenticated localhost dev servers.
The data at stake is the user's database contents. Likelihood is modest (requires the user to visit
a hostile page while Humb is running and the attacker to know/guess the port), hence Medium.

**Fix:** Add a lightweight `onRequest` hook that rejects requests whose `Host` header is not
`127.0.0.1:<port>` / `localhost:<port>`. Optionally add a per-session token in the URL the CLI
opens. Document the decision in `docs/SECURITY.md`.

**Impact:** Neutralizes the primary remote-read vector against a local, unauthenticated API.

### M4 — MongoDB row pagination has no stable sort → duplicate/skipped documents across pages — reliability

**Category:** Reliability (correctness under pagination)
**Where:** `packages/drivers/mongodb/src/index.ts` `getRows`

`find().skip(offset).limit(pageSize)` runs with **no sort**. MongoDB does not guarantee a
consistent order between separate queries, so paging forward can show the same document twice or
skip one entirely, especially on collections receiving writes. `skip` is also O(n) and degrades on
deep pages.

**Why it matters:** Row browsing is the core MongoDB feature in this pass; unstable pages make it
look buggy and untrustworthy.

**Fix:** Add a deterministic sort, e.g. `.sort({ _id: 1 })`, to `getRows` (and mirror it in the
SQL adapters' `getRows` where practical, since `SELECT ... LIMIT/OFFSET` without `ORDER BY` has the
same theoretical instability — at least document the trade-off).

**Impact:** Deterministic, repeatable pagination; removes a whole class of "why did that row
appear twice?" reports.

### M5 — `useAllTables` fan-out: one HTTP request + several catalog queries per table — scalability

**Category:** Performance / Scalability
**Where:** `apps/web/src/hooks/use-all-tables.ts`, consumed by the Schema tab

Opening the Schema tab issues `useQueries` with **one query per table across all schemas**. Each
resolves to a `GET /api/tables/:schema/:table`, and each of those runs multiple catalog round-trips
(Postgres `getTable` alone runs columns + PK + FK + indexes + row-count). On a database with
hundreds of tables this is hundreds of concurrent HTTP requests and potentially a thousand-plus
database queries fired at once.

**Why it matters:** It can saturate the browser's connection pool, spike DB load, and make the
Schema tab slow or flaky on real-world schemas — the opposite of the "just look at a database right
now" promise.

**Fix:** Add a single server endpoint that returns lightweight per-table summaries in one (or a few
batched) queries, or lazy-load table detail on demand / with concurrency limiting. For Postgres,
one query joining `information_schema.columns` + catalog stats across all tables replaces N
requests.

**Impact:** Schema tab scales to large databases; large drop in request count and DB load.

### M6 — Pool errors bypass the structured event log and are invisible to the Console tab — reliability / observability

**Category:** Reliability / Observability
**Where:** `packages/drivers/postgres/src/index.ts` (`pool.on("error", ...)`),
`packages/drivers/mysql/src/index.ts` (`pool.pool.on("error", ...)`)

The pool error listeners (which correctly prevent a process crash) log via `console.error`. That
bypasses the server's `EventLog` (the Console tab's source) and ARCHITECTURE.md's own rule: "no ad
hoc console in product code." A dropped connection is exactly the event a user watching the Console
tab would want to see, and `/api/health` only reflects it on the next poll.

**Why it matters:** The most operationally interesting failure (connection dropped) is the one that
never reaches the in-app log. It also violates the stated logging boundary.

**Fix:** Give adapters a way to surface async connection events to the server (e.g. an optional
event callback on the adapter, or have the server subscribe), and route them into `EventLog` /
Fastify's pino logger instead of `console.error`.

**Impact:** Connection drops/restores appear in the Console tab and structured logs; the logging
boundary holds.

---

## Low

### L1 — Stale empty-state copy: "Postgres or SQLite" ignores MySQL/MongoDB — UX / docs drift

**Where:** `apps/web/src/App.tsx` (~line 146): "Launch Humb with a Postgres or SQLite target to get
started." MySQL and MongoDB are now fully supported (they're in the CLI help, README, and
`parseConnectionTarget`). **Fix:** update the copy to name all four engines or say "a supported
database." **Impact:** Removes a small credibility ding on the first screen a user sees.

### L2 — CSV export/copy is vulnerable to spreadsheet formula injection — security (low)

**Where:** `packages/ui/src/components/rows-table.tsx` `toCsv`. Cell values beginning with `=`,
`+`, `-`, or `@` are written verbatim; opened in Excel/Sheets they're interpreted as formulas
(classic CSV injection). Low because the data is the user's own local DB and the sink is their own
spreadsheet, but it's cheap to harden. **Fix:** prefix such values with a `'` or a leading tab when
escaping. **Impact:** Safe round-trip of DB text into spreadsheets.

### L3 — BSON `Timestamp` is normalized as a `Long` (it subclasses `Long`) — correctness (edge)

**Where:** `packages/drivers/mongodb/src/index.ts` `normalizeBsonValue`. Verified: `Timestamp
instanceof Long === true`, so the `value instanceof Long` branch captures BSON `Timestamp` values
and renders them as a single number/string via `toBigInt()`, losing the `{ t, i }` semantics. Other
BSON types (`Code`, `BSONRegExp`, `MinKey`, `MaxKey`, `BSONSymbol`) also fall through to the generic
object branch and may serialize awkwardly. **Fix:** handle `Timestamp` before `Long`, and add
explicit cases (or a documented fallback) for the other BSON wrapper types. **Impact:** Correct
rendering of replication timestamps and less-common BSON types.

### L4 — `apps/web/SUGGESTIONS.md` is committed into the repo — housekeeping

**Where:** `apps/web/SUGGESTIONS.md` is tracked in git (a completed DF-02 UI audit with items marked
"✅ Done"). It's stale working notes living in the source tree. **Fix:** delete it (its actionable
items are done) or move it under `docs/` if any value remains. Note the project already gitignores
`.local/` for exactly this kind of scratch doc. **Impact:** Cleaner tree; no confusion about which
suggestions doc is live.

### L5 — `.env.example` referenced by SECURITY.md does not exist — docs / DX

**Where:** `docs/SECURITY.md` says "Use `.env` (gitignored) and `.env.example` for templates," but
no `.env.example` exists at the repo root. Integration tests read `HUMB_TEST_DATABASE_URL` /
`HUMB_TEST_MYSQL_URL` / `HUMB_TEST_MONGO_URL` (see `turbo.json`), which a new contributor has to
discover from CI. **Fix:** add a committed `.env.example` documenting those variables. **Impact:**
Faster onboarding for running the integration suite locally.

### L6 — Repeated `export { assertReadOnly, ReadOnlyViolationError }` in every SQL driver — maintainability

**Where:** postgres/sqlite/mysql `index.ts` each re-export the same two symbols from
`@humbdb/driver-contract`. Minor duplication; if a consumer needs them it can import from the
contract directly. **Fix:** drop the re-exports unless a package genuinely needs to surface them.
**Impact:** Slightly less boilerplate; one obvious import source.

### L7 — No focus trap in modal drawers — accessibility

**Where:** `packages/ui/src/components/cell-value-drawer.tsx` (has Escape-to-close, good) and
`query-history-drawer.tsx`. Neither traps Tab focus within the open drawer or restores focus to the
trigger on close, so keyboard users can tab into obscured background content. **Fix:** trap focus
while open and return focus to the invoking control on close (a small `useFocusTrap` hook, or a
headless dialog primitive). **Impact:** Keyboard/AT users can operate the drawers correctly.

### L8 — `canGoNext` can offer an empty next page — UX (minor)

**Where:** `apps/web/src/App.tsx`: `canGoNext={rows.data.rows.length === rows.data.pageSize}`. When
the last page is exactly `pageSize` rows, "Next" is enabled and lands on an empty page. **Fix:** use
the known/approx row count to decide, or accept the empty-page-then-back behavior as intentional and
leave a comment. **Impact:** Marginally smoother pagination at exact page boundaries.

### L9 — Static assets served without compression or cache headers — performance (minor)

**Where:** `packages/server/src/index.ts` registers `@fastify/static` with defaults; no
`@fastify/compress`, no explicit cache-control for hashed bundle assets. For a localhost tool this
is negligible, but gzip/immutable-caching the built SPA is a cheap win. **Fix:** add compression and
long-cache headers for fingerprinted assets. **Impact:** Slightly faster first paint on large
bundles.

---

## Cross-cutting observations (not defects)

- **Testing:** Integration tests are correctly gated on `HUMB_TEST_*` env vars and skip when unset;
  CI provides real Postgres/MySQL/Mongo services. Consider adding unit tests that capture H1/H2
  (the coercion and semicolon false-positives) so they can't regress once fixed.
- **Architecture:** The layer model and "new engine = new package" rule are well enforced and
  genuinely paid off across four engines. The per-engine type-fidelity work (dates, bigints,
  binary) is unusually thorough.
- **Docs:** The routing-doc system (AGENTS.md → ARCHITECTURE/SECURITY/FEATURES) is a real strength;
  the main risk is drift (see L1, L5), which mechanical checks (`check:state`) partly guard against.

---

## Reminder

Once these suggestions have been reviewed and split into individual tasks (feature entries in
`docs/FEATURES.json` and/or tech-debt-tracker rows), **this `SUGGESTIONS.md` file should be cleaned
up and removed from the project.** It is a transient review artifact, not a maintained document.
