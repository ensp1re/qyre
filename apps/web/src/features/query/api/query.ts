import type {
  QueryExecutionResult,
  QueryPlanResult,
  RowPage,
  StatementClassification
} from "@qyre/core";
import { getAuthToken } from "../../../shared/api/auth-token.js";
import { apiResponseError } from "../../../shared/api/permission-denied.js";

export type QueryRunResult = (RowPage | QueryExecutionResult) & {
  classification?: StatementClassification;
};

export class DestructiveConfirmationRequiredError extends Error {
  constructor(public readonly classification: StatementClassification) {
    super("This statement is destructive and requires confirmation before it can run.");
    this.name = "DestructiveConfirmationRequiredError";
  }
}

export class ReadOnlySessionRejectionError extends Error {}

export class QueryCancelledError extends Error {}

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
    throw apiResponseError(body, response.status);
  }
  return body as QueryRunResult;
}

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
    throw apiResponseError(body, response.status);
  }
  return body as QueryPlanResult;
}
