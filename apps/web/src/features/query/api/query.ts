import type { QueryExecutionResult, RowPage, StatementClassification } from "@qyre/core";
import { getAuthToken } from "../../../shared/api/auth-token.js";

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

/** Runs a SQL statement. `confirmed` resubmits a previously-rejected destructive statement (F107) -
 * omitted (or false) on the first attempt for every statement, read or write alike. */
export async function runQuery(sql: string, confirmed?: boolean): Promise<QueryRunResult> {
  const token = getAuthToken();
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch("/api/query", {
      method: "POST",
      headers,
      body: JSON.stringify(confirmed ? { sql, confirmed: true } : { sql })
    });
  } catch {
    throw new Error("Could not reach the Qyre server. Is it still running?");
  }

  const body = (await response.json().catch(() => undefined)) as
    | QueryRunResult
    | { error?: string; classification?: StatementClassification; reason?: string }
    | undefined;

  if (response.status === 409 && body && "classification" in body && body.classification) {
    throw new DestructiveConfirmationRequiredError(body.classification);
  }
  if (!response.ok) {
    const message =
      (body as { error?: string } | undefined)?.error ??
      `Request failed (status ${response.status}).`;
    if ((body as { reason?: string } | undefined)?.reason === "read-only") {
      throw new ReadOnlySessionRejectionError(message);
    }
    throw new Error(message);
  }
  return body as QueryRunResult;
}
