import type { FastifyInstance } from "fastify";

// Restrict Host to loopback names to prevent DNS rebinding against the local server.
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

export function registerHostGuard(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const hostHeader = request.headers.host;
    if (!hostHeader || !ALLOWED_HOSTNAMES.has(extractHostname(hostHeader))) {
      return reply.status(400).send({ error: "Invalid Host header." });
    }
  });
}
