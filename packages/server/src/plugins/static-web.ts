import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fastifyCompress from "@fastify/compress";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply } from "fastify";

function injectAuthToken(html: string, authToken: string): string {
  return html.replace(
    "<head>",
    `<head>\n    <script>window.__QYRE_TOKEN__ = ${JSON.stringify(authToken)};</script>`
  );
}

function serveIndexHtml(reply: FastifyReply, webRoot: string, authToken: string): void {
  const html = injectAuthToken(readFileSync(join(webRoot, "index.html"), "utf8"), authToken);
  reply.header("Content-Type", "text/html; charset=utf-8");
  reply.header("Cache-Control", "no-cache");
  reply.send(html);
}

export function registerStaticWeb(
  app: FastifyInstance,
  webRoot: string | undefined,
  authToken: string
): void {
  if (!webRoot || !existsSync(join(webRoot, "index.html"))) return;

  void app.register(fastifyCompress);
  void app.register(fastifyStatic, {
    root: webRoot,
    index: false,
    cacheControl: false,
    setHeaders: (reply) => {
      reply.header("Cache-Control", "public, max-age=31536000, immutable");
    }
  });

  const serveIndex = (_request: unknown, reply: FastifyReply): void =>
    serveIndexHtml(reply, webRoot, authToken);
  app.get("/", serveIndex);
  app.get("/index.html", serveIndex);

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith("/api/")) {
      return reply.status(404).send({ error: "Not found" });
    }
    return serveIndexHtml(reply, webRoot, authToken);
  });
}
