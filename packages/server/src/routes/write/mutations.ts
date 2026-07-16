import { commitMutationsRequestSchema } from "@qyre/core";
import type { DeleteRowsResult, InsertRowResult, UpdateRowResult } from "@qyre/core";
import type { FastifyInstance } from "fastify";
import type { DatabaseAdapter } from "@qyre/driver-contract";
import type { ServerContext } from "../../app.js";
import { requireAdapter } from "../../services/connection/require-adapter.js";
import { permissionRoute } from "../../services/access/permission-denied.js";
import { resolveBatchOps } from "../../services/rows/row-mutation-validation.js";

function rowCountFor(result: InsertRowResult | UpdateRowResult | DeleteRowsResult): number {
  // Checked in this order deliberately: `InsertRowResult.row` is optional, so `"row" in result`
  // can't narrow it out of the other branches the way `matched`/`deleted` (always-present on their
  // own result types) can - insert is the safe default once those two are ruled out.
  if ("matched" in result) return result.matched;
  if ("deleted" in result) return result.deleted;
  return 1;
}

async function commitMongoGridOps(db: DatabaseAdapter, ops: Parameters<typeof resolveBatchOps>[1]) {
  if (
    !db.mutations?.insertRow ||
    !db.mutations.updateFieldsByKey ||
    !db.mutations.deleteRowsByKey
  ) {
    throw Object.assign(new Error("MongoDB grid mutations are unavailable."), { statusCode: 400 });
  }

  const results: Array<InsertRowResult | UpdateRowResult | DeleteRowsResult> = [];
  for (let index = 0; index < ops.length; index += 1) {
    const op = ops[index]!;
    let result: InsertRowResult | UpdateRowResult | DeleteRowsResult;
    if (op.type === "insert") {
      result = await db.mutations.insertRow(op.schema, op.table, op.values);
    } else if (op.type === "update") {
      result = await db.mutations.updateFieldsByKey(
        op.schema,
        op.table,
        op.key,
        op.changes,
        op.originalValues ?? {},
        op.missingOriginalFields ?? []
      );
      if (result.matched === 0) {
        return { committed: false as const, failedIndex: index, appliedCount: results.length };
      }
    } else {
      result = await db.mutations.deleteRowsByKey(op.schema, op.table, op.keys);
      if (result.deleted < op.keys.length) {
        return { committed: false as const, failedIndex: index, appliedCount: results.length };
      }
    }
    results.push(result);
  }
  return { committed: true as const, results };
}

export function registerMutationsRoutes(app: FastifyInstance, ctx: ServerContext): void {
  // F102/F146: staged grid commit. SQL adapters run a native all-or-nothing transaction; MongoDB
  // applies validated JSON field operations in order because standalone deployments cannot offer a
  // transaction. Every op is validated against
  // its own table's real columns/permissions/kind before the transaction starts - a validation
  // failure on any op aborts the whole commit before any write happens, same as the per-op routes'
  // own validation but applied up front across the whole array.
  app.post<{ Body: unknown }>(
    "/api/mutations/commit",
    permissionRoute({
      operation: "batch-commit",
      target: "batch",
      likelyMissingGrant: "the operation-specific INSERT, UPDATE, or DELETE privilege"
    }),
    async (request, reply) => {
      const parsedBody = commitMutationsRequestSchema.safeParse(request.body);
      if (!parsedBody.success) {
        return reply.status(400).send({ error: "Request body must include ops." });
      }
      if (parsedBody.data.ops.length === 0) {
        return reply.status(400).send({ error: "ops must include at least one operation." });
      }
      const db = requireAdapter(ctx.adapter);
      const resolvedOps = await resolveBatchOps(db, parsedBody.data.ops);

      if (db.engine === "mongodb") {
        const startedAt = performance.now();
        const result = await commitMongoGridOps(db, resolvedOps);
        const durationMs = Math.round(performance.now() - startedAt);
        if (!result.committed) {
          ctx.eventLog.log(
            "warn",
            `MongoDB grid commit stopped at operation ${result.failedIndex}; ${result.appliedCount} earlier operation(s) applied.`
          );
          request.log.warn(
            {
              operation: "commit",
              failedIndex: result.failedIndex,
              appliedCount: result.appliedCount,
              durationMs,
              outcome: "conflict"
            },
            "MongoDB grid commit stopped"
          );
          return reply.status(409).send(result);
        }
        const rowCount = result.results.reduce((sum, opResult) => sum + rowCountFor(opResult), 0);
        ctx.eventLog.log(
          "info",
          `Committed ${result.results.length} MongoDB grid operation(s), ${rowCount} document(s) affected.`
        );
        return result;
      }

      if (!db.mutations?.commitBatch) {
        return reply.status(400).send({ error: "This engine does not support batch commit." });
      }

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
