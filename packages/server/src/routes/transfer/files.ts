import { existsSync, statSync } from "node:fs";
import { fileContentQuerySchema, FILES_PREVIEW_MAX_BYTES } from "@qyre/core";
import type { FileContent, FilesOverview } from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../../app.js";
import {
  buildFileTree,
  InvalidFilePathError,
  readFilePreview,
  resolveSqlFilePath
} from "../../services/transfer/files.js";

export function registerFilesRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get("/api/files", async (): Promise<FilesOverview> => {
    if (!ctx.filesRoot) return { enabled: false, tree: [] };
    return { enabled: true, tree: buildFileTree(ctx.filesRoot) };
  });

  app.get<{ Querystring: Record<string, string> }>("/api/files/content", async (request, reply) => {
    if (!ctx.filesRoot) {
      return reply.status(503).send({ error: "File browsing is not configured." });
    }
    const parsed = fileContentQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Query must include ?path=<relative path>." });
    }

    let absolutePath: string;
    try {
      absolutePath = resolveSqlFilePath(ctx.filesRoot, parsed.data.path);
    } catch (error) {
      if (error instanceof InvalidFilePathError) {
        return reply.status(400).send({ error: error.message });
      }
      throw error;
    }

    if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
      return reply.status(404).send({ error: "File not found." });
    }

    const content: FileContent = {
      path: parsed.data.path,
      ...readFilePreview(absolutePath, FILES_PREVIEW_MAX_BYTES)
    };
    return content;
  });
}
