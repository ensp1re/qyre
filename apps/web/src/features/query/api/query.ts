import type {
  QueryExecutionResult,
  QueryPlanResult,
  RowPage,
  StatementClassification
} from "@qyre/core";
import { getAuthToken } from "../../../shared/api/auth-token.js";
import { apiResponseError } from "../../../shared/api/permission-denied.js";

/** A read query's `RowPage`, or (F108) a write-capable session's `QueryExecutionResult` - both
 * optionally tagged with `classification` (F106/F107's write routing), present only when the
 * server actually classified the statement (a plain read-only session never does, per
 * docs/product-specs/sql-editor.md's "read-only sessions keep today's editor exactly"). */
export type QueryRunResult = (RowPage | QueryExecutionResult) & {
  classification?: StatementClassification;
};

/** Thrown when a destructive statement (F106) needs the caller to resubmit with `confirmed: true`
 * (F107's server-enforced round-trip) - the SQL Editor (F108) catches this to open a confirmation
 * dialog instead of showing it as a plain error. */
export class DestructiveConfirmationRequiredError extends Error {
  constructor(public readonly classification: StatementClassification) {
    super("This statement is destructive and requires confirmation before it can run.");
    this.name = "DestructiveConfirmationRequiredError";
  }
}

/** Thrown specifically when a read-only session's query was rejected for being read-only (as
 * opposed to a genuine syntax/reference error) - the SQL Editor (F108) catches this to show the
 * session's friendly `readOnlyReason` instead of the raw rejection text. */
export class ReadOnlySessionRejectionError extends Error {}

/** Thrown when a query was cancelled mid-run via `POST /api/operations/:id/cancel` (F126) - the
 * SQL Editor catches this to show a distinct "cancelled" outcome instead of a generic error. */
export class QueryCancelledError extends Error {}

/** Runs a SQL statement. `confirmed` resubmits a previously-rejected destructive statement (F107) -
 * omitted (or false) on the first attempt for every statement, read or write alike. `operationId`
 * (F126) is an optional client-generated id that `POST /api/operations/:id/cancel` can later use to
 * cancel this same run while it's still in flight. */
export async function runQuery(
  sql: string,
  confirmed?: boolean,
  operationId?: string
): Promise<QueryRunResult> {
  const token = getAuthToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch("/api/query", {
      method: "POST",
      headers,
      body: JSON.stringify({ sql, ...(confirmed ? { confirmed: true } : {}), operationId })
    });
  } catch {
    throw new Error("Could not reach the Qyre server. Is it still running?");
  }

  const body = (await response.json().catch(() => undefined)) as
    | QueryRunResult
    | {
        error?: string;
        classification?: StatementClassification;
        reason?: string;
        cancelled?: boolean;
      }
    | undefined;

  if (response.status === 409 && body && "classification" in body && body.classification) {
    throw new DestructiveConfirmationRequiredError(body.classification);
  }
  if (!response.ok) {
    const message =
      (body as { error?: string } | undefined)?.error ??
      `Request failed (status ${response.status}).`;
    if ((body as { cancelled?: boolean } | undefined)?.cancelled) {
      throw new QueryCancelledError(message);
    }
    if ((body as { reason?: string } | undefined)?.reason === "read-only") {
      throw new ReadOnlySessionRejectionError(message);
    }
    // F139: routes every other non-2xx body (notably an engine permission denial) through the
    // shared apiResponseError - a structured `permission-denied` body notifies
    // subscribePermissionDenied so the F120 capability/table-permission caches refetch instead of
    // staying stale until the next 30s overview poll, the same way every other fetcher's error
    // path already does. The SQL Editor still just reads `.message` off whatever this throws
    // (unchanged rendered text), and this branch is unreachable for the three cases already
    // handled above.
    throw apiResponseError(body, response.status);
  }
  return body as QueryRunResult;
}

/** Requests the connected SQL engine's native text/tree plan; ANALYZE may execute a read query. */
export async function explainQuery(sql: string, analyze: boolean): Promise<QueryPlanResult> {
  const token = getAuthToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch("/api/query/explain", {
      method: "POST",
      headers,
      body: JSON.stringify({ sql, ...(analyze ? { analyze: true } : {}) })
    });
  } catch {
    throw new Error("Could not reach the Qyre server. Is it still running?");
  }

  const body = (await response.json().catch(() => undefined)) as
    QueryPlanResult | { error?: string } | undefined;
  if (!response.ok) {
    // F139: see runQuery's identical comment - routes the body through apiResponseError so a
    // structured permission denial (e.g. the connected role lacks EXPLAIN privilege) triggers the
    // same F120 capability-cache refresh every other fetcher's error path already gets.
    throw apiResponseError(body, response.status);
  }
  return body as QueryPlanResult;
}
