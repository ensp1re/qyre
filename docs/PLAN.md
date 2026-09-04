# Security audit and hardening plan

Status: **all findings below are fixed as of F157**, except the native-SQLite P1, which is
partially fixed and has a named remainder - see its own Status line. Each heading carries its
outcome inline. Verification for every item is in the F157 PR.

Audit date: 2026-08-26, against `main` at `fb425b2` (v0.4.3 published, F155/F156 merged unreleased).
Method: every claim below was checked by running it - `pnpm audit`, `git grep`/history scans,
reading the live server/driver/CLI code paths, and live queries against the local Docker engines
and one real remote Postgres. Nothing is asserted from reading alone. This supersedes the
narrower findings list in `exec-plans/completed/0009-security-audit-hardening.md`, which fixed
six issues in F154; those are not repeated here.

Severity is for Qyre's actual threat model: a local-first, single-developer tool bound to
`127.0.0.1` with a per-session bearer token. "Remote attacker" means a web page the developer
visits or a database server they connect to - not a shared host, which `SECURITY.md` already
places out of scope.

---

## Findings, ranked

### P1 - Plaintext connections to remote databases, silently

**Fixed (F157).** `connectionWarnings()` in `packages/core/src/connection-warnings.ts` classifies
the host (loopback, RFC1918, `.local`/`.internal`, bare service names are local) and warns when a
remote host carries no TLS parameter. Surfaced in the CLI banner, in the `POST /api/connect`
response, and in the Console event log - the drawer closes on success, so a response-only warning
would have flashed and vanished. Not auto-upgraded, for the reason given below.

**What.** No adapter passes any TLS configuration (`packages/drivers/*/src/runtime/adapter.ts`
contain no `ssl`/`tls` at all), so each driver's default applies:

| Engine   | Default when the URL says nothing        |
| -------- | ---------------------------------------- |
| Postgres | `sslmode=disable` (node-postgres)        |
| MySQL    | no TLS unless `ssl=` is given (mysql2)   |
| MongoDB  | no TLS unless `tls=true` / `mongodb+srv` |

Paste `postgres://user:pass@some.remote.host/db` and Qyre sends the password and every row
**unencrypted across the internet**, with nothing in the UI saying so.

**Evidence, live.** Against a real remote Postgres 18.6 supplied during this audit:

```
psql default (sslmode=prefer)  -> pg_stat_ssl.ssl = false   (server has SSL off entirely)
PGSSLMODE=disable              -> accepted
```

That server accepts plaintext and Qyre would use it. The same URL pasted into the connect
drawer produces no warning.

**Why P1.** This is the one finding where the harm is off-machine and irreversible: credentials
and data on the wire. It is also the most common real-world use of the tool ("connect to the
staging DB").

**Fix.** At the parse boundary (`packages/core/src/connection-target.ts`, where the URL is
already parsed) classify the host: loopback / RFC1918 / `.local` / Docker service name are
"local"; anything else is "remote". For a remote host with no explicit TLS parameter, surface a
warning in the connect drawer and the CLI banner: _"Connecting to a remote host without TLS -
credentials and data travel unencrypted. Add `?sslmode=require` (Postgres), `?ssl=true` (MySQL), or
`?tls=true` (MongoDB)."_ Do not silently upgrade - `sslmode=require` fails against servers with
SSL off (like the one above), and a surprising failure is worse than an informed choice.
~40 lines, one test per engine's parameter spelling.

### P1 - Pasted connection strings can weaken the client without any signal

**Fixed (F157).** Same helper: `multipleStatements`, `insecureAuth`, `tlsInsecure`,
`tlsAllowInvalidCertificates`, `tlsAllowInvalidHostnames`, `sslmode=disable`, and
`allowLoadLocalInfile` each warn when actually switched on. Value-aware, so `tls=true` is silent
and `tlsInsecure=true` is not; matched case-insensitively, as the drivers do.

**What.** Query parameters flow straight into driver configuration. mysql2 merges every URL
parameter into its options (`connection_config.js` `parseUrl` loop, verified) - so a pasted
string can set `multipleStatements=true`, `insecureAuth=true`, or override `ssl`. MongoDB honours
`tlsInsecure=true` / `tlsAllowInvalidCertificates=true`; Postgres honours `sslmode=disable` and
`sslrootcert`. A connection string shared in a wiki or ticket is a config injection vector.

**Fix.** Same parse boundary as above: an allowlist of parameters that may change security
posture, each mapped to a one-line warning in the drawer. Not a block - the user may need
`tlsInsecure` against a self-signed dev cluster - but never silent. Pairs with the P1 above; do
them in one change.

### P1 - Native SQLite installation blocks Qyre before startup, including PostgreSQL

**Status.** **Partially fixed (F157); the runtime-independence requirement remains open.**

Fixed and verified:

- `better-sqlite3` `^11.10.0` -> `^12.11.1`, whose `engines` is
  `20.x || 22.x || 23.x || 24.x || 25.x || 26.x`. The exact reproduction below no longer occurs: on
  Node **26.5.0** it installs a prebuilt binary in seconds with no compiler. The v11 pin, not the
  native addon as such, was what broke. Deliberately **not** v13, which requires Node >= 22 and
  would have silently dropped this repo's declared `>=20.11.0` floor and its own Node 20 CI - CI
  caught that, having fallen back to node-gyp.
- It is now an `optionalDependency` of `@qyre/sqlite`, loaded lazily inside `connect()` via a
  dynamic import rather than at module scope. A failed native build therefore cannot abort
  `npm i qyre`, and cannot stop the CLI booting - verified by making the specifier unresolvable and
  confirming the adapter module still imports, with only `connect()` failing, carrying an
  actionable message naming Postgres/MySQL/MongoDB as unaffected.
- Moving it to `optionalDependencies` silently dropped it from tsup's auto-external list, so
  esbuild inlined better-sqlite3's own JS and broke its `__dirname`-relative binding lookup. Caught
  by the conformance suite; fixed with an explicit `external` in the sqlite tsup config. Worth
  recording because it would have shipped a SQLite driver that could never load its binding.

**Still open, and deliberately not attempted here.** This section's required outcome is
independence from the user's Node ABI, not merely "works on today's Node" - a future release can
reintroduce the gap the moment prebuilds lag. That means the WASM-or-bundled-runtime evaluation
below, plus the install matrix in Acceptance, and the section itself says the direction must be
decided before implementation. It is a multi-week architectural change with its own conformance
burden and does not belong in a security PR. What F157 buys is that the failure is no longer
total: it is confined to SQLite, surfaced clearly, and does not block installing or launching Qyre.

This is a product onboarding failure, not a security severity rating.

**What.** `qyre@0.4.3` installs `@qyre/sqlite` and `better-sqlite3@11.10.0` for every user,
including users connecting only to PostgreSQL, MySQL, or MongoDB. Its native addon depends on
Node/V8 compatibility. Installation can fail before the CLI runs, leaving only the
`prebuild-install@7.1.3` deprecation warning and a return to the shell. The warning is not the
underlying failure. A CLI preflight cannot explain an installation failure that happens before
the executable is available.

**Evidence, reproduced.** A fresh temporary npm cache on macOS arm64 with Node **26.5.0**:

```bash
npm exec --foreground-scripts --yes --package qyre@0.4.3 -- qyre --version
```

The installer found no prebuilt binary, fell back to `node-gyp`, and failed compiling against
V8 (`GetPrototype`, `GetIsolate`, and `PropertyCallbackInfo.This` were missing). npm exited 1;
without foreground scripts, the build errors were hidden. No database connection was needed to
reproduce this. With Node **22.23.1**, the dependency installed successfully, Qyre started, and
its web interface returned HTTP 200. Database behavior was not tested in this reproduction.

**Required outcome.** Users must not need to install nvm, downgrade or switch Node versions,
install a compiler, or debug native bindings to try Qyre. PostgreSQL, MySQL, and MongoDB startup
must not depend on successful installation of SQLite native bindings. SQLite must also have a
working installation path without manual runtime setup. `npx` itself still requires Node; the
goal is to remove sensitivity to the user's Node ABI and provide a runtime-independent launch
option if necessary, rather than promise that every future Node release already works.

**Fix direction, to decide before implementation.** Evaluate a SQLite implementation that does
not require a Node-specific native addon (for example, WASM), or a distribution that bundles a
tested runtime and compatible SQLite implementation. Compare persistent file access, existing
SQLite features, performance, package size, and supported operating systems/architectures.
Isolate engine loading and packaging so an unused driver cannot block installation or startup;
lazy imports alone do not prevent npm from running a required dependency's install script.
Making SQLite optional is only an intermediate mitigation unless SQLite users also retain a
working path. A dependency upgrade, narrower `engines` declaration, or Node 22 instructions
alone do not meet the required outcome.

**Acceptance and verification.**

- Install the packed release through npm in clean environments, with real dependency resolution
  and no monorepo `node_modules` symlinks. Exercise both `qyre` and `@qyre/qyre` launchers.
- Define and automate the supported Node/OS/architecture matrix, covering supported LTS and
  current Node releases. Include the Node 26/macOS arm64 reproduction as a regression case.
- Verify CLI startup and web asset serving without changing the host's Node version or requiring
  native build tools. Verify any bundled-runtime distribution on the same supported platforms.
- Verify real connections across PostgreSQL, MySQL, SQLite, and MongoDB. Simulate unavailable
  SQLite native binaries and prove other engines still install and start.
- For any replacement SQLite implementation, run shared adapter conformance and existing SQLite
  tests, including file persistence, transactions, schema operations, and read-only enforcement.
- Gate publishing on these installation checks; document the supported runtime policy and any
  remaining limitations. Do not close this item based only on a build or a dependency bump.

### P2 - Dependency advisories have no refresh mechanism

**Fixed (F157).** `pnpm audit --prod` now reports **no known vulnerabilities**. Achieved with a
lockfile refresh only - no declared range was widened - plus the deliberate `@fastify/static`
`^9.1.3` -> `^10.1.3` major bump. `.github/dependabot.yml` now runs weekly for npm and
github-actions, grouping minor/patch and ignoring majors so those stay deliberate.

The `@fastify/static` bump was breaking, exactly as this plan predicted: v10 hands `setHeaders` a
`FastifyReply` where v9 handed the raw `ServerResponse`, so the existing `res.setHeader` call threw
inside the plugin's send pump and hung the request. Caught by the existing F044 cache-header test.

**What.** `pnpm audit --prod` today: **6 high, 1 moderate**, all in the Fastify chain.

| Advisory                                 | Package                 | Reachable in Qyre?                                 |
| ---------------------------------------- | ----------------------- | -------------------------------------------------- |
| GHSA-c96f-x56v-gq3h                      | `find-my-way` 9.6.0     | No - `http2` never enabled                         |
| GHSA-83w8-p2f5-377r, GHSA-8pvw-jcv7-9cmj | `@fastify/static` 9.1.3 | No - no route guards over static, no `allowedPath` |
| GHSA-v2hh-gcrm-f6hx, GHSA-7p8r-x3mc-p8w7 | `fast-uri` 3.1.3        | No - only resolves Qyre's own schema `$id`s        |
| GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 | `brace-expansion` 5.0.7 | No - glob patterns never user-supplied             |

None is exploitable in this configuration (analysis in plan 0009). The finding is structural:
**there is no Dependabot or Renovate config** (`.github/dependabot.yml` missing, verified), so
five of the seven are already fixable by a lockfile refresh that nothing ever triggers. The next
advisory that _is_ reachable will sit unnoticed the same way.

**Fix.** Two steps, separate PRs:

1. `pnpm update` (lockfile only) - clears `find-my-way`, `fast-uri`, `brace-expansion`. Ranges
   already permit the patched versions (`^9.6.0`→9.8.0, `^3.0.0`→3.1.5, `^5.0.5`→5.0.9).
2. `@fastify/static ^9.1.3 → ^10.1.3` - a major bump. Smoke-test hashed-asset serving and the
   token-injecting `/` handler in `packages/server/src/plugins/static-web.ts`.

Then add `.github/dependabot.yml` (weekly, `npm`, grouped minor/patch) so this doesn't recur.

### P2 - No npm publish provenance; releases depend on one laptop

**Fixed (F157).** `.github/workflows/release.yml` publishes on a `v*` tag with `id-token: write`,
npm Trusted Publishing, and `--provenance`. `scripts/publish.mjs` gained a `--ci` mode that skips
the branch check and local tag (a tag build is a detached HEAD) and adds the provenance flag. The
workflow verifies the tag matches the committed version before publishing.

**Requires one manual step before first use:** register the Trusted Publisher for each package on
npmjs.com (org/repo `ensp1re/qyre`, workflow `release.yml`). Until then the publish step fails
closed rather than falling back to a token.

**What.** `.github/workflows/` contains only `ci.yml` (verified: 0 publish workflows). Every
release is `pnpm release publish` run locally with a long-lived npm token by a single maintainer.
No provenance attestation, no OIDC, no second factor in the pipeline. A compromised developer
machine publishes a malicious `qyre` to everyone running `npx qyre` - a tool people point at
production databases.

**Fix.** A `release.yml` triggered on `v*` tags: `permissions: id-token: write`, npm Trusted
Publishing (no token stored at all), `pnpm publish --provenance`. Require 2FA on the npm account
for the remaining manual paths. This is the highest-leverage supply-chain change available and
worth more than all seven advisories above combined.

### P3 - CI workflow declares no `permissions`

**Fixed (F157).** `permissions: contents: read` at workflow level, and all three actions pinned to
commit SHAs with the tag retained as a trailing comment.

**What.** `ci.yml` has no `permissions:` block (verified), so `GITHUB_TOKEN` gets the repository
default - `write` on repositories created before 2023. Triggers are `push` and `pull_request`
only (no `pull_request_target`), so there is no injection path today; this is defence in depth.

**Fix.** Add at the top of `ci.yml`:

```yaml
permissions:
  contents: read
```

Also pin the three actions (`actions/checkout@v4` etc.) to commit SHAs. One-line each.

### P3 - Session token travels in export URLs

**Fixed (F157).** `POST /api/exports/grant` mints a single-use, 60-second grant; the export URL
carries that instead of the session token. Spending it deletes it, so a URL left in browser history
cannot be replayed even inside the TTL. Streaming behaviour is unchanged - it is still a real
navigation, not a Blob.

**What.** Whole-table exports are a real browser navigation, so the bearer token is passed as
`?token=` (`apps/web/src/features/table/api/rows.ts:63`). F154 stopped it reaching the server's
own logs, but it still lands in the **browser history** and in any proxy or corporate egress
log. The token is per-session and dies with the process, which bounds the damage.

**Fix.** Mint a one-shot, short-TTL download token per export (`POST /api/exports` returns an
opaque id; `GET /api/exports/:id` streams once and expires). Removes the session token from URLs
entirely. ~60 lines; do it when touching exports next, not as its own change.

### P3 - Auth guard is coupled to Fastify router defaults, and nothing pins that

**Fixed (F157).** The guard now keys on `request.routeOptions.url` - the route find-my-way actually
matched - falling back to the raw URL when nothing matched, so unmatched `/api/*` stays guarded.
Regression tests cover `//api/health`, `/api/health/`, `/./api/health`, `/API/health`, and
`/api%2Fhealth`.

**What.** `packages/server/src/plugins/auth-guard.ts:31` decides on
`request.raw.url.startsWith("/api/")`. That is correct **only** because Fastify's defaults are
`ignoreDuplicateSlashes: false`, `ignoreTrailingSlash: false`, `caseSensitive: true` (verified in
`fastify/lib/config-validator.js`). Flip any of them and `//api/query` or `/API/query` reaches a
handler with no token check. No test asserts this.

**Fix.** A regression test that `//api/health`, `/api/health/`, `/./api/health`, `/API/health`
all return 401/404 without a token. Better: guard on `request.routeOptions.url` (the matched
route) instead of the raw string, which survives any router option change. ~15 lines.

### P3 - SQLite queries cannot be interrupted

**Documented (F157), option (a) as the plan proposed.** `docs/RELIABILITY.md` gains a "Known
limitation" section naming the freeze, the recovery (Ctrl-C, nothing lost), and the worker-thread
upgrade path. Not fixed in code: no user has reported it and the recovery is immediate.

**What.** Postgres and MySQL have a 30 s `statement_timeout` (`connection.ts:19`,
`adapter.ts:129`) and pool-level cancellation. SQLite via `better-sqlite3` is **synchronous with
no timeout** (`sqlite/src/runtime/adapter.ts:267` documents this). A `WITH RECURSIVE` that never
terminates freezes the whole Node event loop - every request, every engine, the UI itself - until
the process is killed. Single-user, so only self-inflicted, but it is a full hang with no
recovery path except `Ctrl-C`.

**Fix.** `better-sqlite3` supports no interrupt on the main thread. Options, cheapest first:
(a) document it in `docs/RELIABILITY.md` and the SQL editor's help; (b) run SQLite queries in a
`worker_thread` so `worker.terminate()` becomes the cancel button - the existing
`OperationRegistry` cancellation contract already has the shape for it. (a) now, (b) when a user
actually reports a hang.

### P4 - Query history persists raw SQL, including any literals, to localStorage

**Fixed (F157).** The history drawer gained a Clear control next to what it deletes, wired to the
existing `queryHistory.clear`. Literal redaction remains deliberately out - it cannot be done
reliably and would mangle legitimate queries.

**What.** `use-query-history.ts` stores the trimmed SQL text of every executed statement
(`qyre-query-history`, unencrypted). `UPDATE users SET api_key = 'sk-live-…'` is now in the
browser profile indefinitely. Recent connection targets are already handled correctly - the
credential-bearing ones are excluded (`canPersistTarget`, verified) - so this is the one
remaining persisted-secret surface.

**Fix.** Either cap the history to session storage, or add a "Clear history" that is also
triggered on disconnect. The Settings screen already has "Clear query history"; making it
prominent in the history drawer itself is a two-line change. Full literal redaction is not worth
it - it cannot be done reliably and would mangle legitimate queries.

---

## Verified clean

Recorded so the next audit does not repeat them. Each was checked, not assumed.

- **SQL injection.** All three SQL drivers parameterise values; identifiers are quoted with
  correct doubling (`quoteIdent`); filter/sort columns are allowlisted against the live catalog
  (`services/rows/row-query.ts`) and operators checked per column type. `FILTER_OPS` is fully
  covered by the builders.
- **NoSQL injection.** No `$where` / `$function` / `$accumulator` anywhere; regex values pass
  through `escapeRegExp`; recursive `$expr` builder is depth-bounded (8).
- **`--read-only` coverage.** Every write route uses `permissionRoute()` (defaults
  `mutating: true`), and `error-handler.ts:16` throws **at boot** if a mutating route lacks
  denial metadata - structural, not conventional. `/api/query` is the intended exception and
  routes every `read` classification through the engine-level `READ ONLY` backstop.
- **Path traversal (Files tab).** `services/transfer/files.ts`: lexical `..` rejection,
  `.sql`-only allowlist, prefix check, _and_ a `realpathSync` re-check that defeats symlinks.
- **XSS.** Zero `dangerouslySetInnerHTML` / `innerHTML` / `eval`. The one DB-value-to-`href`
  sink (`cell-value.tsx:80`) allowlists `http:`/`https:` only.
- **CSRF / cross-origin.** No CORS headers, JSON-only body parsing (preflight required), bearer
  token on every `/api/*` route, `Host` allowlist closes DNS rebinding.
- **Session token.** 256-bit `randomBytes`, `timingSafeEqual` with a length pre-check.
- **Command execution.** No `child_process` in any runtime package. `open()` receives only the
  self-built `http://127.0.0.1:<port>` URL. `host` is never CLI-controllable (always loopback).
- **Header injection.** Export filenames are sanitised to `[\p{L}\p{N}._-]` before
  `Content-Disposition`.
- **Malicious-server file read (MySQL `LOAD DATA LOCAL`).** mysql2 refuses unless
  `infileStreamFactory` is set; Qyre never sets it.
- **Upload limits.** Multipart caps on size, count, fields, parts; `csv-parse` with
  `max_record_size` 1 MiB and strict column count.
- **Secrets in repo.** `git grep` over tracked files and a history scan for embedded connection
  strings: only test fixtures (`alice:secret@host`). `.env` is gitignored and untracked. Published
  packages ship `files: ["dist"]` only. Install scripts are allowlisted to three packages.
- **Credential redaction.** `redactConnectionString`, `redactErrorMessage`, and
  `redactSensitiveQueryParams` cover URLs, free-text driver errors, and the request logger; the
  global error handler was wired to all of them in F154.

---

## Suggested order

**Installation priority:** resolve the P1 native SQLite blocker before the next release; users
must be able to launch Qyre without managing Node versions. The security work order remains:

1. **P2 provenance** - one workflow file, removes the single worst outcome.
2. **P1 TLS warning + P1 parameter warning** - one change at the parse boundary.
3. **P3 CI permissions + action pinning** - four lines.
4. **P2 lockfile refresh**, then `@fastify/static` bump, then Dependabot.
5. **P3 auth-guard regression test.**
6. P3 export token, P3 SQLite hang note, P4 items - as their areas are next touched.

Items 1-3 are each under an hour and close everything that could hurt someone other than the
developer running the tool.

---

## Out of scope, deliberately

- Shared / multi-tenant hosts - `SECURITY.md` already excludes them; the unauthenticated token
  hand-out at `GET /` is a documented, accepted limitation of that model.
- Rate limiting and request timeouts on the HTTP server - loopback only; Fastify defaults
  (`bodyLimit` 1 MiB, no request timeout) are fine there.
- The Socket.dev behavioural alerts ("network access", "filesystem access", "env var access",
  "shell access", "native code" etc. across ~40 packages) - these describe `pg`, `mysql2`,
  `mongodb`, `better-sqlite3`, and `open` doing their jobs and are not findings.
