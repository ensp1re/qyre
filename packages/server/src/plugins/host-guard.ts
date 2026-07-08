import type { FastifyInstance } from "fastify";

// The server binds to 127.0.0.1 and sets no CORS headers, but has no auth - the residual risk is
// DNS rebinding: a malicious page the developer visits resolves its own hostname to 127.0.0.1, so
// the browser treats a request to http://<attacker-domain>:<port>/api/... as same-origin even
// though it reaches this server. Rejecting any request whose Host header isn't one of these
// loopback hostnames closes that vector, since an attacker-registered domain can never be one.
const ALLOWED_HOSTNAMES = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

/** Extract the hostname portion of a `Host` header, handling bracketed IPv6 literals correctly. */
function extractHostname(hostHeader: string): string {
  if (hostHeader.startsWith("[")) {
    const closeIndex = hostHeader.indexOf("]");
    return (closeIndex === -1 ? hostHeader : hostHeader.slice(0, closeIndex + 1)).toLowerCase();
  }
  const colonIndex = hostHeader.lastIndexOf(":");
  return (colonIndex === -1 ? hostHeader : hostHeader.slice(0, colonIndex)).toLowerCase();
}

/** Rejects any request whose Host header isn't a loopback hostname (DNS-rebinding guard, F025). */
export function registerHostGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const hostHeader = request.headers.host;
    if (!hostHeader || !ALLOWED_HOSTNAMES.has(extractHostname(hostHeader))) {
      return reply.status(400).send({ error: "Invalid Host header." });
    }
  });
}
