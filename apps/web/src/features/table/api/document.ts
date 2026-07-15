import type { DeleteRowsResult, InsertRowResult, UpdateRowResult } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";
import { fetchMutation } from "../../../shared/api/fetch-mutation.js";

/** Fetches one document as relaxed Extended JSON text (F125) - the whole-document editor's fresh
 * load, never the grid's own lossy display values. A missing document is a genuine exceptional
 * case (there's nothing to edit), so this uses `fetchJson` and throws on the `404`. */
export async function fetchDocumentText(
  schema: string,
  table: string,
  id: string,
  signal?: AbortSignal
): Promise<string> {
  const { document } = await fetchJson<{ document: string }>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/document/${encodeURIComponent(id)}`,
    { signal }
  );
  return document;
}

/**
 * Saves an edited document (F125's whole-document replace). `originalDocument` is the text the
 * editor loaded before editing - required so the server can detect a concurrent change since load
 * (lost-update protection) and report it as `matched: 0`, a normal outcome this returns rather than
 * throws, so the caller can show "this document changed" instead of a generic error.
 */
export function saveDocument(
  schema: string,
  table: string,
  id: string,
  document: string,
  originalDocument: string
): Promise<UpdateRowResult> {
  return fetchMutation<UpdateRowResult>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: { _id: id },
        document: JSON.parse(document) as Record<string, unknown>,
        originalDocument: JSON.parse(originalDocument) as Record<string, unknown>
      })
    }
  );
}

/** Inserts a new document (F125) - `_id` may be omitted from `document`'s text, matching how an
 * auto-generated SQL primary key may be omitted on insert. */
export function insertDocument(
  schema: string,
  table: string,
  document: string
): Promise<InsertRowResult> {
  return fetchJson<InsertRowResult>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: document
    }
  );
}

/** Deletes one document by `_id` (F125). A `409` here just means it was already deleted - a normal
 * outcome (the user's goal, the document being gone, is already achieved), not an error, so this
 * uses `fetchMutation` rather than throwing. */
export function deleteDocument(
  schema: string,
  table: string,
  id: string
): Promise<DeleteRowsResult> {
  return fetchMutation<DeleteRowsResult>(
    `/api/tables/${encodeURIComponent(schema)}/${encodeURIComponent(table)}/rows`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: [{ _id: id }] })
    }
  );
}
