import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyCompress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance } from "fastify";

/**
 * Serves the built `apps/web` static assets (its `index.html` and bundle) when `webRoot` is given
 * and exists, so `npx qyre <target>` has something to open. Registers nothing when omitted or
 * missing - only the `/api/*` routes are exposed in that case.
 */
export function registerStaticWeb(app: FastifyInstance, webRoot: string | undefined): void {
  if (!webRoot || !existsSync(join(webRoot, "index.html"))) return;

  // Compresses responses (gzip/brotli, negotiated via Accept-Encoding) - most useful for the
  // ~700KB JS bundle, negligible cost for the small JSON API responses (F044).
  void app.register(fastifyCompress);
  void app.register(fastifyStatic, {
    root: webRoot,
    // Disables @fastify/static's own default Cache-Control (public, max-age=0), which otherwise
    // wins over setHeaders below by being applied after it.
    cacheControl: false,
    setHeaders: (res, path) => {
      // Vite's build hashes every asset filename on content change, so those can be cached
      // aggressively and immutably; index.html itself references those hashed filenames and must
      // always be revalidated, or a stale cached copy would point at assets a redeploy removed.
      res.setHeader(
        "Cache-Control",
        path.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable"
      );
    }
  });
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}
