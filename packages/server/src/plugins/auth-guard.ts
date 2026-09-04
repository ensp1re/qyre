import type { FastifyInstance, FastifyRequest } from "fastify";
import { tokensMatch } from "../services/access/auth-token.js";
import { consumeDownloadGrant } from "../services/access/download-grants.js";

const BEARER_PREFIX = "Bearer ";

function extractToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (header?.startsWith(BEARER_PREFIX)) return header.slice(BEARER_PREFIX.length);
  const url = new URL(request.raw.url ?? "", "http://localhost");
  return url.searchParams.get("token") ?? undefined;
}

export function registerAuthGuard(app: FastifyInstance, token: string): void {
  app.addHook("onRequest", async (request, reply) => {
    const matched = request.routeOptions.url ?? request.raw.url;
    if (!matched?.startsWith("/api/")) return;
    const grant = new URL(request.raw.url ?? "", "http://localhost").searchParams.get("grant");
    if (grant && consumeDownloadGrant(grant)) return;

    const provided = extractToken(request);
    if (!provided || !tokensMatch(token, provided)) {
      return reply.status(401).send({ error: "Unauthorized: missing or invalid session token." });
    }
  });
}
