import { commitMutationsRequestSchema } from "@qyre/core";
import type { DeleteRowsResult, InsertRowResult, UpdateRowResult } from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { ServerContext } from "../app.js";
import { requireAdapter } from "../services/require-adapter.js";
import { resolveBatchOp } from "../services/row-mutation-validation.js";

function rowCountFor(result: InsertRowResult | UpdateRowResult | DeleteRowsResult): number {
  // Checked in this order deliberately: `InsertRowResult.row` is optional, so `"row" in result`
  // can't narrow it out of the other branches the way `matched`/`deleted` (always-present on their
  // own result types) can - insert is the safe default once those two are ruled out.
  if ("matched" in result) return result.matched;
  if ("deleted" in result) return result.deleted;
  return 1;
}

export function registerMutationsRoutes(app: FastifyInstance, ctx: ServerContext): void {
  // F102: batch commit for the SQL pending-changes model. Registered for every engine (never a
  // bare 404, which could read as a routing bug) but responds 400 for MongoDB explaining documents
  // save individually there, per docs/product-specs/row-editing.md. Every op is validated against
  // its own table's real columns/permissions/kind before the transaction starts - a validation
  // failure on any op aborts the whole commit before any write happens, same as the per-op routes'
  // own validation but applied up front across the whole array.
  app.post<{ Body: unknown }>(
    "/api/mutations/commit",
    { config: { mutating: true } },
    async (request, reply) => {
      const parsedBody = commitMutationsRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must include ops." });
      }
      if (parsedBody.data.ops.length === 0) {
        return reply.status(400).send({ error: "ops must include at least one operation." });
      }
      const db = requireAdapter(ctx.adapter);
      if (db.engine === "mongodb") {
        return reply.status(400).send({
          error: "Batch commit does not apply to MongoDB; documents save individually."
        });
      }
      if (!db.mutations?.commitBatch) {
        return reply.status(400).send({ error: "This engine does not support batch commit." });
      }

      const resolvedOps = await Promise.all(
        parsedBody.data.ops.map((op) => resolveBatchOp(db, op))
      );

      const startedAt = performance.now();
      const result = await db.mutations.commitBatch(resolvedOps);
      const durationMs = Math.round(performance.now() - startedAt);

      if (!result.committed) {
        const failedOp = parsedBody.data.ops[result.failedIndex];
        ctx.eventLog.log(
          "warn",
          `Batch commit rolled back at operation ${result.failedIndex} (${failedOp?.type}).`
        );
        request.log.warn(
          {
            operation: "commit",
            failedIndex: result.failedIndex,
            failedType: failedOp?.type,
            durationMs,
            outcome: "conflict"
          },
          "batch commit rolled back"
        );
        return reply.status(409).send({
          error: "Commit failed and was rolled back.",
          failedIndex: result.failedIndex
        });
      }

      const rowCount = result.results.reduce((sum, opResult) => sum + rowCountFor(opResult), 0);

      ctx.eventLog.log(
        "info",
        `Committed ${result.results.length} operation(s), ${rowCount} row(s) affected.`
      );
      request.log.info(
        {
          operation: "commit",
          opCount: result.results.length,
          rowCount,
          durationMs,
          outcome: "success"
        },
        "batch commit succeeded"
      );

      return result;
    }
  );
}
