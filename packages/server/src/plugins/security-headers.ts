import type { FastifyInstance } from "fastify";

// img-src stays open to http/https so the F086 DB-driven image previews keep working - a database
// value can be any image URL. Everything else is locked to the app's own origin: connect-src
// blocks the served page from ever phoning data out to a third-party host (the actual exfil vector
// worth neutralizing - images can only leak whatever's already encoded into the URL itself, a much
// narrower channel than JS fetch/XHR). script-src/style-src allow 'unsafe-inline' because
// apps/web/index.html ships an inline theme-detection script and boot-splash style, and this is a
// local-first tool with no first-party content to distrust.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
].join("; ");

/** Sets browser-hardening headers on every response (F122): CSP (see above), plus the standard
 * MIME-sniffing (nosniff) and clickjacking (frame-ancestors/X-Frame-Options) guards. */
export function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
  });
}
