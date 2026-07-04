# Product Contract: Column Type Fidelity

A row's cell values must reach the browser exactly as stored - no silent precision loss, no
timezone reinterpretation, no unusably-rendered binary data. This spec covers three defect
categories (date/timestamp shift, bigint precision loss, binary rendering - five fixes total
across the three engines) found by systematically seeding a wide-type fixture table (`type_zoo`:
bigint, date, timestamp, timestamptz, bytea/blob/BLOB, plus the already-correct
json/jsonb/numeric/array paths) against live Postgres, MySQL, and SQLite instances and inspecting
the actual JSON each engine's `/api/tables/:schema/:table/rows` returned - not just reading the
driver code and assuming its defaults were safe.

## Why this exists

F016 fixed how the UI _renders_ a structured (object/array) value. While seeding a fixture to
verify that fix, the same "does this look right on screen" question was asked of every other
column type the three engines support - and three of them didn't: two silent data-corruption bugs
(bigint precision loss in MySQL/SQLite) and one wrong-data bug (date/timestamp values shifted by
the server's local UTC offset in Postgres/MySQL), confirmed live before any fix was written. A
fourth, lower-severity issue (binary columns rendering as a confusing `{ type, data }` JSON chip)
was also found and fixed as part of the same sweep, since it's the same class of "flat/wrong
rendering of a real column type" problem F016 already exists to solve.

## Confirmed defects and fixes

1. **Postgres `date` / `timestamp without time zone` shifted by server-local UTC offset.**
   `pg`'s default parser builds a JS `Date` at local wall-clock time for these two OIDs; Fastify's
   JSON response then serializes that `Date` to an absolute UTC instant, silently shifting the
   value by the server's offset (confirmed live on a UTC+2 host: a stored `2024-01-15` came back as
   `"2024-01-14T22:00:00.000Z"` - the wrong calendar date entirely). Fixed with
   `types.setTypeParser` for OIDs 1082 (`DATE`) and 1114 (`TIMESTAMP`) to return the raw wire
   string unchanged. `timestamptz` (1184) is untouched - it's a genuine absolute instant and
   converts to UTC correctly.
2. **MySQL: the same date/timestamp shift**, for the same underlying reason (mysql2's default also
   builds a local-time `Date`). Fixed with `dateStrings: true` on the pool - MySQL's own server-side
   session-timezone conversion for `TIMESTAMP` columns already happened before the string reaches
   the driver; this just stops the driver from re-interpreting it through Node's local zone.
3. **MySQL: `BIGINT` values lose precision past `Number.MAX_SAFE_INTEGER`** (confirmed live: a
   stored `9007199254740993` came back as `9007199254740992`, off by one - silent data corruption,
   not a display bug). The built-in `bigNumberStrings` option fixes the precision but stringifies by
   _column type_, not by value magnitude - every `LONGLONG` field becomes a string even when small,
   which broke `ping()`'s `=== 1` check and `getTable()`'s `rowCount` (both back by a `COUNT(*)`,
   itself a `LONGLONG`). Fixed with a `typeCast` function that only stringifies a `LONGLONG` value
   when it doesn't fit exactly in a JS number - the common case (small IDs, counts) is completely
   unaffected.
4. **SQLite: the same `BIGINT`/`INTEGER` precision loss** (better-sqlite3 returns a plain JS number
   by default). Fixed with `stmt.safeIntegers(true)` - scoped to the two statements that return
   arbitrary row data (`getRows`, `runReadOnlyQuery`), not database-wide (`defaultSafeIntegers`
   would have flipped every internal pragma/`COUNT(*)` query in the adapter to `BigInt` too,
   breaking `notnull === 0`/`unique === 1`-style comparisons the same way MySQL's blanket option
   broke `ping()`) - followed by a `normalizeRow` mapping each `BigInt` back to a plain `number`
   when lossless, or a string when it isn't (matching Postgres/MySQL's bigint-as-string convention
   for the rare unsafe case; `BigInt` itself has no `toJSON` and would otherwise throw once Fastify
   JSON-encodes the response).
5. **Binary columns (Postgres `bytea` / MySQL `blob` / SQLite `BLOB`) rendered as a confusing JSON
   chip.** Node's `Buffer.prototype.toJSON()` runs automatically wherever a driver hands back a
   real `Buffer` and the server JSON-encodes the response, producing `{ "type": "Buffer", "data":
[...] }` on the wire - which F016's generic structured-value chip then rendered as `{ 2 keys }`,
   expandable into meaningless `type`/`data` tree nodes. Now detected as its own `BinaryValue` shape
   (`packages/ui/src/components/cell-value.tsx`'s `isBinaryValue`) and rendered as a `binary · N
bytes` chip with a hex preview; its `CellValueDrawer` view shows a UTF-8 decode attempt (when the
   bytes are valid, printable UTF-8) above a proper offset/hex/ASCII hex dump (capped at 1024 bytes
   shown, matching the rest of this product's "never freeze the UI on a huge value" rule), and its
   copy button copies a plain hex string instead of the JSON shape.

## Scope

In scope: the four defects above, confirmed via a live fixture across all three engines and fixed
at the driver layer (1-4) or the shared `packages/ui` rendering layer (5).

Out of scope (not defects, confirmed correct or acceptable as-is during the same sweep):

- Postgres `numeric`/`bigint` (already string-typed by `pg`'s default, no precision loss), `array`,
  `json`/`jsonb` (F016), `uuid`, `inet`/`cidr`/`macaddr`, `money`, `bit` - all render as plain text
  today and are accurate.
- Postgres `interval` (`{ days, hours, ... }`) and `point` (`{ x, y }`) render via the generic
  structured-value chip (F016) rather than a bespoke format - genuinely object-shaped data, not a
  misrepresentation, just not maximally idiomatic. A dedicated interval/point formatter is a
  possible future enhancement, not a defect.
- MySQL `TINYINT(1)`/`BOOLEAN` renders as `1`/`0` rather than `true`/`false` - MySQL's own wire
  protocol doesn't distinguish a `BOOLEAN` from a small `TINYINT`, so this isn't misrepresenting
  the data, just not the most idiomatic label. Possible future enhancement, not a defect.
- SQLite has no native date/boolean/json column types (values are stored as `TEXT`/`INTEGER` at the
  developer's discretion) - nothing to reinterpret or get wrong at the driver layer.

## Acceptance criteria

- A Postgres table with `date`/`timestamp` columns shows the exact calendar date/wall-clock time
  that was stored, regardless of the server process's local timezone.
- A MySQL table with `DATE`/`DATETIME`/`TIMESTAMP` columns shows the same, and MySQL's own
  `ping()`/`rowCount`/small-integer paths are unaffected by the bigint fix.
- A MySQL or SQLite table with a `BIGINT`/`INTEGER` column holding a value past
  `Number.MAX_SAFE_INTEGER` shows the exact stored value, not an off-by-some-amount approximation.
- A Postgres `bytea`/MySQL `blob`/SQLite `BLOB` column renders as a `binary · N bytes` chip (not a
  generic object chip); its drawer shows a hex dump and, when applicable, a decoded text preview.
