# Plan 0008: AI Database Assistant

Status: Approved 2026-07-18. F150 is the first slice; none started yet.
Owner: current engagement
Linked features: F150 (config/settings/gating), F151 (chat + SQL suggestions), F152 (tool-use +
permissions + data analysis), F153 (charts)
Decisions captured: 2026-07-18 (user-approved via design review)

## Objective

Add an opt-in AI assistant as the first workspace tab (before SQL Editor): a chat interface scoped
exclusively to database work - writing SQL for the connected engine, explaining schema, analyzing
data ("what's the monthly volume for X?"), and rendering simple charts from query results. It
supports exactly one configured provider at a time (Anthropic, OpenAI, or OpenRouter), proxies all
LLM traffic through the local Qyre server, and asks for explicit per-scope user permission before
any schema or data leaves the machine.

## Scope and out-of-scope

In scope: a new `assistant` shell tab; presentational chat components in `packages/ui`; an
`apps/web/src/features/assistant` feature; `packages/server/src/routes/ai/` proxy routes with a
provider abstraction and a server-side tool-execution loop; a Settings "AI Assistant" category
(provider exclusivity, masked key input, OpenRouter model input, permission management); consent
UX; SECURITY.md and README amendments for the opt-in external-network carve-out.

Out of scope: assistant-initiated writes of any kind (the assistant only reaches the database
through the existing read-only query path), conversation persistence, multiple simultaneous
providers, local models (Ollama), MCP, chat history search, embeddings/RAG over table contents,
fine-grained per-table permissions, streaming token-usage/cost display, and mobile layouts beyond
what the existing shell already provides.

## Constraints discovered in analysis (binding)

1. **CSP forces a server proxy.** `packages/server/src/plugins/security-headers.ts` sets
   `connect-src 'self'`; the browser cannot call any LLM API directly. All provider traffic goes
   through new `/api/ai/*` routes on the local server. This is also where redaction, streaming,
   and the tool loop live.
2. **The security contract needs an explicit carve-out.** `docs/SECURITY.md` forbids transmitting
   database contents/schemas off the machine and forbids external network calls without a
   documented decision and user opt-in. Decision (approved): the assistant is that documented
   opt-in - off by default, only calls the provider the user configured, and only sends
   schema/data after per-scope consent. SECURITY.md and the README's "never phones home" claim are
   amended in F150 to state the carve-out precisely.
3. **`packages/ui` components never fetch** (FRONTEND.md). All assistant UI is presentational;
   fetching/streaming state lives in `apps/web` feature hooks.
4. **Feature IDs must match `F###`** (scripts/check-features.mjs), so slices are F150-F153; the
   AI-assistant grouping lives in this plan, not in the ID scheme.

## Approved decisions

- **Key storage: localStorage.** Provider API keys persist in browser localStorage via the
  versioned-storage helpers, alongside provider choice, OpenRouter model name, and permission
  grants. Accepted limitation (documented in SECURITY.md in F150): anyone who can open the Qyre
  page on this machine can read the key - consistent with the existing session-token threat model
  ("defends cross-origin requests, not a genuinely shared machine"). The key is sent per-request
  to the local server and never logged; server holds it only for the duration of a request.
- **Consent model: explicit opt-in carve-out.** Two permission scopes, both default-deny:
  `share-schema` (table/column names and types may be sent to the provider) and `read-data` (the
  assistant may execute read-only queries and send results to the provider). The first tool call
  needing an ungranted scope pauses the response and renders a consent card above the composer;
  Allow persists the grant to localStorage; Deny returns the refusal to the model so it can answer
  without that capability. Grants are visible and revocable in Settings.
- **Conversations are in-memory only.** Refresh clears the chat. Nothing conversation-shaped is
  persisted anywhere.
- **Provider exclusivity.** Exactly one provider may hold a key. While one provider has a saved
  key, the other providers' inputs are disabled with a "clear the current provider to switch"
  hint. OpenRouter additionally requires a model-name input; Anthropic and OpenAI use maintained
  defaults in code.
- **Read-only by construction.** The assistant's only database access is the existing
  `POST /api/query` execution path with its engine-enforced `READ ONLY` backstop. Apply moves SQL
  text into the editor; running it stays under all existing confirmation and permission flows.

## Architecture

### Server (`packages/server/src/routes/ai/`)

- `POST /api/ai/chat` (SSE): body carries provider id, key, model (OpenRouter), granted scopes,
  and the message history (client-owned since conversations are in-memory). Streams
  `text-delta`, `tool-call`, `permission-request`, `chart`, and `done`/`error` events.
- Provider abstraction: one interface, two wire formats - OpenAI-compatible (OpenAI, OpenRouter)
  and Anthropic Messages. Lives in `packages/server/src/services/ai/`.
- Tool loop (server-side): `list_tables` and `get_table_schema` (require `share-schema`, backed by
  the adapter's existing introspection), `run_read_query` (requires `read-data`, executed through
  the same code path as the SQL editor's read queries, result rows capped before being sent to the
  provider). A tool call missing its scope emits `permission-request` and ends the stream; the
  client re-sends with the grant after Allow.
- System prompt: fixed, engine-aware, database-work-only; instructs refusal of off-topic requests
  and emission of a JSON chart spec (`{type: "bar"|"line", x, series}`) when a visualization is
  the right answer.
- The route registers behind the existing auth guard; keys are redacted from logs and error
  bodies via the existing log-redaction service.

### Web (`apps/web/src/features/assistant/`)

- `api/chat.ts` (SSE client), `model/use-assistant.ts` (message state, streaming, permission
  pause/resume), `model/use-ai-config.ts` (provider/key/model in versioned localStorage),
  `model/use-ai-permissions.ts` (grants in versioned localStorage), `ui/assistant-tab.tsx`
  (composition).
- Unconfigured state: the tab renders a centered empty state - "Connect an AI provider to use the
  assistant" with an "Open Settings" button (mirrors the F149 sidebar empty-state pattern).

### UI (`packages/ui/src/assistant/`)

- `assistant-pane.tsx` (message list + composer, existing token palette and density),
  `sql-suggestion-block.tsx` (monospace SQL block with Copy and Apply actions; Apply invokes a
  callback - the app dispatches the existing `queryLoaded` action which sets the editor SQL and
  switches tabs), `permission-request-card.tsx` (scope name, exactly what will be shared, Allow /
  Deny), `chart-block.tsx` (small dependency-free SVG bar/line renderer for the chart spec).
- `tab-bar.tsx`: add `"assistant"` first in `TABS` (Sparkles icon); `workspace-state.ts` default
  tab stays `sql-editor` until the assistant is configured (open question 1).

### Settings

- New "AI Assistant" category in `settings-screen.tsx`: provider selection, masked key input,
  OpenRouter model input, permission toggles, and a "what leaves this machine" explainer line.

## Implementation slices

### Slice 1 - F150: Provider configuration, Settings category, and gated tab

- The `assistant` tab appears first; unconfigured it shows the empty state routing to Settings.
- Settings gains the AI Assistant category with provider exclusivity exactly as approved: one
  saved key at a time, others disabled with a hint, clearing re-enables all; OpenRouter shows a
  required model-name input; keys render masked with a reveal toggle.
- Config persists via the versioned-storage helpers; keys never appear in logs, exports, or the
  recent-targets store.
- SECURITY.md gains the carve-out section (what is sent, when, to whom, and the localStorage-key
  accepted limitation); README's "never phones home" claim is amended in the same PR.
- Verification: `pnpm --filter @qyre/ui test`, `pnpm --filter @qyre/web test`, typecheck/build for
  ui/web, `pnpm verify:pr`.

### Slice 2 - F151: Chat with SQL suggestions, Copy, and Apply

- `POST /api/ai/chat` streams provider responses (no tools yet); provider abstraction covers
  Anthropic + OpenAI-compatible with normalized error surfaces (bad key, rate limit, network) as
  friendly inline chat errors.
- The DB-only system prompt ships with engine/dialect awareness from the connected adapter's
  engine id; off-topic requests get a scoped refusal.
- SQL in responses renders as SqlSuggestionBlock; Copy uses the clipboard; Apply dispatches
  `queryLoaded` (sets editor SQL + switches to SQL Editor). MongoDB (supportsSql false) prompts
  the model toward find/aggregate pseudo-queries and hides Apply.
- Verification: server route tests with a stubbed provider (streaming, error normalization, key
  redaction), UI render tests for the block actions, `pnpm verify:pr`.

### Slice 3 - F152: Tool-use, permission consent flow, and data analysis

- The server tool loop ships with `list_tables`, `get_table_schema`, `run_read_query`; the last
  one executes through the existing read-only query path and caps rows sent to the provider.
- Ungranted scopes pause the stream with `permission-request`; the consent card renders above the
  composer stating exactly what will be shared; Allow persists the grant and resumes; Deny feeds
  the refusal back to the model.
- Settings permission toggles reflect and revoke grants live.
- Cross-engine: tools verified against Postgres, MySQL, SQLite, MongoDB (find/aggregate for
  `run_read_query` per adapter capabilities).
- Verification: server tests for the tool loop, scope gating, and row caps; web tests for
  pause/resume; `pnpm verify:pr`.

### Slice 4 - F153: Charts from query results

- The system prompt's chart-spec contract activates; `chart` events render ChartBlock (SVG bar and
  line, token-colored, axis labels, no new dependency).
- A chart derived from a `run_read_query` result renders beneath the assistant's explanation;
  malformed specs degrade to a code block, never a crash.
- Verification: UI render tests for both chart types and the malformed-spec fallback,
  `pnpm verify:pr`.

## Dependencies and sequence

F150 → F151 → F152 → F153, strictly: config gates chat, chat carries the tool loop, tools feed
charts. Each slice is independently shippable and useful.

## Verification path

Per slice as listed, plus for every slice: no key material in any log, error body, or test
snapshot (extend the log-redaction tests); the full `pnpm verify:pr` gate on Node 22.

## Risks and blockers

- Provider APIs drift; the abstraction isolates wire formats, and defaults for Anthropic/OpenAI
  model ids live in one constants file.
- SSE through the local Fastify server alongside the auth guard needs a streaming-response test
  pattern the codebase doesn't have yet (existing routes are JSON request/response).
- Prompt-injection via database contents: tool results fed to the model could contain adversarial
  text. Mitigation in scope: the assistant has no write tools whatsoever and every capability is
  scope-gated; the READ ONLY backstop bounds worst case at data disclosure the user already
  consented to.
- Token limits on wide schemas: `get_table_schema` returns per-table detail on demand instead of
  dumping the whole catalog; `list_tables` returns names only.
- The README/SECURITY amendment must land with F150, not after - shipping the tab without the
  documented carve-out violates the repo's own contract.

## Open decisions

1. Default tab when the assistant is configured: keep `sql-editor` as the startup tab (current
   default) or open on `assistant`? Leaning keep `sql-editor`; revisit after F151 dogfooding.
2. Anthropic/OpenAI default model ids: pick at F151 implementation time against current provider
   catalogs; keep in one constants file.
3. Row cap for `run_read_query` results sent to the provider (initial proposal: 200 rows or
   32 KB, whichever is smaller); finalize during F152.

## Progress log

- 2026-07-18: Plan approved after design review. Decisions: localStorage key storage, explicit
  opt-in consent carve-out with per-scope grants, in-memory conversations, provider exclusivity,
  read-only-by-construction tool access. Slices F150-F153 queued as `not_started`.
