import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fastifyCompress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply } from "fastify";

/** Injects the session token as a global the SPA's `fetchJson` wrapper reads (F122). A plain
 * inline `<script>` (not a nonce/hash-gated one) works because the CSP already allows
 * 'unsafe-inline' script-src for apps/web's own inline boot script. */
function injectAuthToken(html: string, authToken: string): string {
  return html.replace(
    "<head>",
    `<head>\n    <script>window.__QYRE_TOKEN__ = ${JSON.stringify(authToken)};</script>`
  );
}

/** Reads and serves `index.html` with the session token injected. Read fresh each time (not
 * cached) - it's a few KB and this only runs on page loads, not on every API call. */
function serveIndexHtml(reply: FastifyReply, webRoot: string, authToken: string): void {
  const html = injectAuthToken(readFileSync(join(webRoot, "index.html"), "utf8"), authToken);
  reply.header("Content-Type", "text/html; charset=utf-8");
  reply.header("Cache-Control", "no-cache");
  reply.send(html);
}

/**
 * Serves the built `apps/web` static assets (its `index.html` and bundle) when `webRoot` is given
 * and exists, so `npx qyre <target>` has something to open. Registers nothing when omitted or
 * missing - only the `/api/*` routes are exposed in that case.
 */
export function registerStaticWeb(
  app: FastifyInstance,
  webRoot: string | undefined,
  authToken: string
): void {
  if (!webRoot || !existsSync(join(webRoot, "index.html"))) return;

  // Compresses responses (gzip/brotli, negotiated via Accept-Encoding) - most useful for the
  // ~700KB JS bundle, negligible cost for the small JSON API responses (F044).
  void app.register(fastifyCompress);
  void app.register(fastifyStatic, {
    root: webRoot,
    // index.html is always served dynamically below (it needs the token injected) - disables
    // @fastify/static's automatic directory-index resolution so it only ever serves hashed
    // bundle assets, never a raw, tokenless copy of index.html.
    index: false,
    // Disables @fastify/static's own default Cache-Control (public, max-age=0), which otherwise
    // wins over setHeaders below by being applied after it.
    cacheControl: false,
    setHeaders: (res) => {
      // Vite's build hashes every asset filename on content change, so these can be cached
      // aggressively and immutably; only hashed assets reach this handler now (index.html is
      // served separately, above).
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  });

  const serveIndex = (_request: unknown, reply: FastifyReply): void =>
    serveIndexHtml(reply, webRoot, authToken);
  app.get("/", serveIndex);
  // Closes the gap @fastify/static's index:false leaves: a literal request for /index.html would
  // otherwise still be served raw (untokenized) as an ordinary static file.
  app.get("/index.html", serveIndex);

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return serveIndexHtml(reply, webRoot, authToken);
  });
}
