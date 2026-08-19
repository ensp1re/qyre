# Plan 0009: Security audit and hardening

Status: Completed 2026-08-19. Single slice, F154.
Owner: current engagement
Linked features: F154
Trigger: a Socket.dev dependency-alert review for `qyre@0.4.2`, widened on request into a full
end-to-end audit of the server, drivers, core, and the frontend's injection sinks.

## Objective

Audit the published package and the codebase for vulnerabilities and correctness bugs, then fix
everything confirmed. Findings were only accepted after being reproduced - by executing the real
logic, or against the live Postgres/MySQL containers - never from reading alone.

## What the Socket.dev review actually showed

`qyre` itself carries **no** package alerts. Every alert on that page is a dependency alert, and
the loud categories ("network access" ×11, "filesystem access" ×31, "environment variable access"
×26, "URL strings" ×36, "shell access" ×8, "uses eval" ×9, "native code", "unmaintained" ×42) are
behavioral flags describing `pg`, `mysql2`, `mongodb`, `better-sqlite3`, and `open` doing their
ordinary jobs. They are not findings and were not actioned.

`pnpm audit --prod` reports 7 advisories, all in the Fastify chain, and **none is reachable in
Qyre's configuration**:

| Advisory                                 | Package           | Why unreachable                                                            |
| ---------------------------------------- | ----------------- | -------------------------------------------------------------------------- |
| GHSA-c96f-x56v-gq3h                      | `find-my-way`     | `Fastify({ logger })` never enables `http2`                                |
| GHSA-83w8-p2f5-377r                      | `@fastify/static` | needs route guards over static files; Qyre's static root is the public SPA |
| GHSA-8pvw-jcv7-9cmj                      | `@fastify/static` | needs the `allowedPath` callback, which `static-web.ts` does not use       |
| GHSA-v2hh-gcrm-f6hx, GHSA-7p8r-x3mc-p8w7 | `fast-uri`        | only resolves `$id`/`$ref` in Qyre's own route schemas                     |
| GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 | `brace-expansion` | reached via glob patterns Qyre never supplies                              |

Five of the seven are stale-lockfile artifacts: the declared ranges already permit patched
versions (`find-my-way ^9.6.0` → 9.8.0, `fast-uri ^3.0.0` → 3.1.5, `brace-expansion ^5.0.5` →
5.0.9). Only `@fastify/static` needs a manifest change (`^9.1.3` → `^10.1.3`, a major bump).
Deferred deliberately - see "Deferred" below - because none is reachable and a dependency refresh
deserves its own diff rather than riding a security-fix PR.

## Findings fixed (all reproduced first)

1. **`--read-only` bypass writing files on a MySQL server.** Two defects compose:
   - `capResultRows` detected its leading keyword against raw SQL, so a leading comment
     (`-- note\nSELECT ...`) read as first keyword `--` and the F050 row cap silently did not
     apply - an unbounded scan into memory on its own.
   - `SELECT ... INTO OUTFILE/DUMPFILE` leads with an allowed read keyword and appears in no
     forbidden-word list, so `classifyStatement` returned `read`. MySQL's
     `START TRANSACTION READ ONLY` does not block a filesystem write, so the engine-level
     backstop - the layer the architecture correctly treats as authoritative - does not catch it.

   The plain form was incidentally saved by the cap's derived-table wrapper, which MySQL rejects.
   Prefix a comment and the wrapper is skipped, and the statement reaches MySQL intact. Confirmed
   live against MySQL 8: the file was written inside a `READ ONLY` transaction.

2. **Session token written into the Console event log.** `error-handler.ts` logged raw
   `request.url`. Export downloads carry the live bearer token as `?token=...` (the one route the
   auth guard accepts it from), so any 5xx on an export wrote a working credential into
   `ctx.eventLog` - served by `GET /api/console` and rendered in the Console tab. Same class as
   F130/S2, in a second sink the existing `redactSensitiveQueryParams` helper was never wired to.

3. **Global error handler bypassed `redactErrorMessage`.** The catch-all returned and logged
   driver text verbatim while the connect routes redacted theirs, so a connection string echoed by
   a driver error (MongoDB's family especially) leaked outside connect.

4. **Writable CTEs failed on the write path.** `capResultRows` wrapped by leading keyword, turning
   `WITH d AS (DELETE ... RETURNING *) SELECT * FROM d` into a subquery. Confirmed live: Postgres
   rejects it with "WITH clause containing a data-modifying statement must be at the top level",
   so every `WITH`-led write failed.

5. **MySQL rejected ordinary joins with repeated column names.** MySQL alone rejects a derived
   table whose SELECT list repeats a name (ER_DUP_FIELDNAME); Postgres and SQLite allow it. The row
   cap's wrapper made `SELECT a.*, b.* FROM a JOIN b` fail whenever both carry an `id` - a very
   common shape. Confirmed live.

6. **CSV escaping gaps in both copies** (`packages/ui` and `packages/server`, deliberate
   duplicates): a bare `\r` was left unquoted, splitting its record for parsers that treat CR as a
   terminator; and the formula guard anchored on the bare character, so `\t=cmd()` and `\r=cmd()`
   passed unprefixed even though spreadsheets strip leading whitespace before evaluating.

## Verified clean

Recorded so future effort skips them: SQL injection (values parameterized across all three SQL
drivers, identifiers quoted with correct doubling, `resolveRowFilters`/`resolveRowSort` allowlist
columns against the live catalog); `--read-only` route coverage (every write route carries
`permissionRoute`, and an `onRoute` hook throws at boot if a mutating route lacks denial metadata);
path traversal in the Files tab (lexical `..` rejection, extension allowlist, prefix check, and a
`realpathSync` symlink re-check); XSS (no `dangerouslySetInnerHTML`; the one DB-value-to-`href`
sink allowlists `http:`/`https:`); NoSQL injection (no `$where`/`$function`, regex values escaped,
recursion depth-bounded); the session token (256-bit `randomBytes`, `timingSafeEqual` with a length
pre-check); malicious-MySQL-server file read (blocked by mysql2 requiring an explicit
`infileStreamFactory`, which Qyre does not set); and multipart upload limits.

## Deferred

Real, not oversight - each wants its own diff:

- The 7 dependency advisories above. Lockfile refresh clears five; `@fastify/static ^9 → ^10` is a
  major bump needing its own smoke test of asset serving and the token-injecting `/` handler.
- **No npm publish provenance.** Releases are pushed manually with a long-lived token by a single
  maintainer, with no attestation. Moving to GitHub Actions with npm Trusted Publishing (OIDC,
  `--provenance`) is worth more than all seven CVEs combined.
- **Connection-string query params reach driver configs unvalidated.** mysql2 merges URI params
  straight into client options (`multipleStatements`, `insecureAuth`); MongoDB accepts
  `tlsInsecure`; Postgres `sslmode=disable`. A pasted string can silently downgrade TLS with no UI
  signal. Wants a warning at the parse boundary.
- **The auth guard is coupled to Fastify's router defaults.** `request.raw.url.startsWith("/api/")`
  is correct only because `ignoreDuplicateSlashes`/`ignoreTrailingSlash` are false and
  `caseSensitive` is true (verified). Nothing pins that; a regression test asserting `//api/…`,
  `/api/…/`, `/./api/…`, and `/API/…` cannot reach a handler unauthenticated would.
- **`engines: node >=20.11.0`** contradicts the known `better-sqlite3` breakage on Node 24/26.

## Progress log

- 2026-08-19: Audit run, six findings reproduced and fixed, plan recorded and completed as F154.
  Coverage caveat: `packages/ui` presentation logic beyond its injection sinks was not
  exhaustively reviewed.
