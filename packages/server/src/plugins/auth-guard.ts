import type { FastifyInstance, FastifyRequest } from "fastify";
import { tokensMatch } from "../services/auth-token.js";

const BEARER_PREFIX = "Bearer ";

/**
 * Extracts the session token from a request: the `Authorization: Bearer <token>` header (used by
 * every `fetchJson` call from the SPA), or a `token` query param (used by export downloads' plain
 * `<a href>` download, which triggers a real browser navigation and can't set headers). Reads the
 * query string straight off the raw URL rather than `request.query`, so this doesn't depend on
 * where in Fastify's request lifecycle query parsing happens relative to `onRequest` hooks.
 */
function extractToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith(BEARER_PREFIX)) return header.slice(BEARER_PREFIX.length);
  const url = new URL(request.raw.url ?? "", "http://localhost");
  return url.searchParams.get("token") ?? undefined;
}

/**
 * Rejects any `/api/*` request without a valid session token (F122) - closes the no-auth surface
 * host-guard alone leaves open: a cross-origin page's plain request (blocked only incidentally by
 * Fastify's JSON content-type requirement today) could otherwise call every route. Static/HTML
 * routes stay unguarded so the browser can load the page and receive its token in the first place
 * (injected by static-web.ts) - which means another local OS user/process that can reach this port
 * can retrieve the token the same way, an accepted limitation documented in docs/SECURITY.md
 * (this token defends against cross-origin/CSRF-shaped requests, not a genuinely shared machine).
 */
export function registerAuthGuard(app: FastifyInstance, token: string): void {
  app.addHook("onRequest", async (request, reply) => {
    if (!request.raw.url?.startsWith("/api/")) return;
    const provided = extractToken(request);
    if (!provided || !tokensMatch(token, provided)) {
      return reply.status(401).send({ error: "Unauthorized: missing or invalid session token." });
    }
  });
}
