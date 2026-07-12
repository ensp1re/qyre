import { runQuerySchema } from "@qyre/core";
import { classifyStatement, ReadOnlyViolationError } from "@qyre/driver-contract";
import type { DatabaseAdapter, StatementClassification } from "@qyre/driver-contract";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ServerContext } from "../app.js";
import { applyReadOnlyOverride } from "../services/read-only-capabilities.js";
import { requireAdapter } from "../services/require-adapter.js";

/** The existing, unchanged read-only path: `runReadOnlyQuery` classifies/enforces read-only-ness
 * itself (via `assertReadOnly`, now built on `classifyStatement`, F106) - used both for sessions
 * with no write capability at all, and for `read`-classified statements in write-capable sessions
 * (per docs/product-specs/sql-editor.md's "Write-capable SQL execution": a read stays on the safe,
 * coercion-applying, `READ ONLY`-transaction-wrapped path regardless of session capability).
 *
 * `classification` is only passed by the write-capable caller (always `"read"` there) so its
 * response carries a `classification` field for the SQL Editor's history (F108) - a plain
 * non-write-capable session's response is untouched, matching the spec's "read-only sessions keep
 * today's editor exactly". Symmetrically, the rejection response only gets a `reason: "read-only"`
 * discriminator when `classification` is absent - the client (F108) uses it to show the session's
 * friendly `readOnlyReason` instead of the raw rejection text, but only when read-only-ness is
 * actually why the query failed, never for an unrelated failure in a write-capable session.
 */
async function runReadOnlyPath(
  db: DatabaseAdapter,
  ctx: ServerContext,
  sql: string,
  reply: FastifyReply,
  classification?: StatementClassification
) {
  const start = Date.now();
  try {
    const result = await db.runReadOnlyQuery(sql);
    ctx.eventLog.log(
      "info",
      `Query executed in ${Date.now() - start}ms - ${result.rows.length} rows returned`
    );
    return classification ? { ...result, classification } : result;
  } catch (error) {
    if (error instanceof ReadOnlyViolationError) {
      ctx.eventLog.log("warn", `Query rejected: ${error.message}`);
      return reply
        .status(400)
        .send({ error: error.message, ...(classification ? {} : { reason: "read-only" }) });
    }
    // Anything else (a bad table name, a syntax error, ...) is a genuine unexpected failure -
    // handled generically (and logged) by the global error handler, not duplicated here.
    throw error;
  }
}

export function registerQueryRoute(app: FastifyInstance, ctx: ServerContext): void {
  app.post<{ Body: unknown }>("/api/query", async (request, reply) => {
    const parsed = runQuerySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Request body must be { sql: string, confirmed?: boolean }." });
    }
    const { sql, confirmed } = parsed.data;
    const db = requireAdapter(ctx.adapter);

    const capabilities = applyReadOnlyOverride(await db.getCapabilities(), ctx.readOnly);
    // Bound, not a bare `db.runQuery` reference - every adapter's `runQuery` is a plain class
    // method relying on `this` (unlike `mutations`, which is a readonly object of already-bound
    // arrow functions), so calling it detached from `db` throws inside the method itself (e.g.
    // Postgres's `this.getPool()`).
    const runQuery = db.runQuery?.bind(db);
    if (!capabilities.supportsRowMutations || !runQuery) {
      return runReadOnlyPath(db, ctx, sql, reply);
    }

    let classification: StatementClassification;
    try {
      classification = classifyStatement(sql);
    } catch (error) {
      if (error instanceof ReadOnlyViolationError) {
        ctx.eventLog.log("warn", `Query rejected: ${error.message}`);
        return reply.status(400).send({ error: error.message });
      }
      throw error;
    }

    if (classification === "read") {
      return runReadOnlyPath(db, ctx, sql, reply, classification);
    }

    if (classification === "destructive" && !confirmed) {
      ctx.eventLog.log(
        "warn",
        "Destructive statement rejected pending confirmation - resubmit with confirmed: true."
      );
      return reply.status(409).send({
        error: "This statement is destructive and requires explicit confirmation to run.",
        classification
      });
    }

    const start = Date.now();
    const result = await runQuery(sql);
    ctx.eventLog.log(
      "info",
      `Executed a ${classification} statement in ${Date.now() - start}ms - ${result.rowsAffected} row(s) affected.`
    );
    return { ...result, classification };
  });
}
