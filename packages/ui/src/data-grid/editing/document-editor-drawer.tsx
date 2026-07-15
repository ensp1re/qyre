import { AlertTriangle, Check, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../../primitives/use-focus-trap.js";
import { Spinner } from "../../feedback/spinner.js";

export interface DocumentEditorDrawerProps {
  mode: "edit" | "insert";
  /** The document as relaxed Extended JSON text (F125) - fetched fresh for "edit" mode (never the
   * grid's own lossy display values), empty for "insert". Populates the editor once loading
   * finishes; `undefined` while `loading` is true. */
  initialText?: string;
  /** Fetching the fresh document for "edit" mode. */
  loading?: boolean;
  saving: boolean;
  deleting?: boolean;
  /** A save/delete/load failure - shown inline, the drawer stays open so the user's edit isn't
   * lost. */
  error?: string;
  /** Whether the "Delete document" section renders at all - "edit" mode only. */
  canDelete?: boolean;
  /** The document's `_id`, shown in the header and required as the delete confirmation's typed
   * match - "edit" mode only. */
  documentId?: string;
  onSave: (text: string) => void;
  onDelete?: () => void;
  onClose: () => void;
}

/**
 * MongoDB's whole-document editor (F125, the "Compass model"): edit the full document as relaxed
 * Extended JSON text, save the whole thing at once - no cross-document buffer, no flat cell/column
 * model (that's the SQL grid's, F103-F105). Never calls the server itself; `onSave`/`onDelete` are
 * the caller's (packages/ui components don't fetch, per FRONTEND.md). Client-side validation is
 * "is this parseable JSON" only - the deeper "is this unambiguous EJSON" check is the server's,
 * per docs/product-specs/row-editing.md's "no JSON schema/shape validator" scope note.
 */
export function DocumentEditorDrawer({
  mode,
  initialText,
  loading,
  saving,
  deleting,
  error,
  canDelete,
  documentId,
  onSave,
  onDelete,
  onClose
}: DocumentEditorDrawerProps): ReactNode {
  const [text, setText] = useState(initialText ?? "");
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const asideRef = useRef<HTMLElement>(null);
  useFocusTrap(asideRef, true);

  useEffect(() => {
    if (initialText !== undefined) setText(initialText);
  }, [initialText]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  let parseError: string | undefined;
  try {
    if (text.trim().length > 0) JSON.parse(text);
  } catch (err) {
    parseError = err instanceof Error ? err.message : "Invalid JSON.";
  }

  const busy = Boolean(loading || saving || deleting);
  const canSave = !busy && !parseError && text.trim().length > 0;
  const deleteConfirmed = documentId !== undefined && deleteConfirmText === documentId;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} aria-hidden="true" />

      <aside
        ref={asideRef}
        tabIndex={-1}
        data-testid="document-editor-drawer"
        className="fixed inset-y-0 right-0 z-50 flex w-[28rem] max-w-full flex-col border-l border-border bg-card outline-none"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
          <span className="font-mono text-[9px] uppercase tracking-widest text-quiet-foreground">
            {mode === "edit" ? "Edit document" : "Insert document"}
          </span>
          {documentId && (
            <span className="truncate font-mono text-[10px] text-foreground/70">{documentId}</span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-[2px] p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto p-3">
          {loading ? (
            <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <Spinner /> Loading document...
            </p>
          ) : (
            <>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                aria-label="Document JSON"
                spellCheck={false}
                className="min-h-[16rem] flex-1 resize-none rounded-[3px] border border-border bg-secondary p-2 font-mono text-[11px] text-foreground outline-none focus:border-primary"
              />
              {parseError && (
                <p
                  className="flex items-start gap-1.5 font-mono text-[10px]"
                  style={{ color: "var(--c-red)" }}
                >
                  <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                  {parseError}
                </p>
              )}
            </>
          )}

          {error && (
            <p
              className="flex items-start gap-1.5 font-mono text-[10px]"
              style={{ color: "var(--c-red)" }}
            >
              <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
              {error}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(text)}
            disabled={!canSave}
            className="ml-auto flex items-center gap-1.5 rounded-[3px] bg-primary px-3 py-1 text-[11px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <Spinner className="h-2.5 w-2.5 text-primary-foreground" />
            ) : (
              <Check className="h-2.5 w-2.5" />
            )}
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {mode === "edit" && canDelete && documentId && (
          <div className="shrink-0 border-t border-border px-3 py-2">
            <p className="mb-1.5 font-mono text-[10px] text-muted-foreground">
              Type the document's <span className="text-foreground/80">_id</span> to confirm
              deletion.
            </p>
            <div className="flex items-center gap-2">
              <input
                value={deleteConfirmText}
                onChange={(event) => setDeleteConfirmText(event.target.value)}
                aria-label="Type the document's _id to confirm deletion"
                placeholder={documentId}
                className="min-w-0 flex-1 rounded-[3px] border border-border bg-secondary px-2 py-1 font-mono text-[10px] text-foreground outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={onDelete}
                disabled={!deleteConfirmed || busy}
                className="flex shrink-0 items-center gap-1 rounded-[3px] border px-2 py-1 font-mono text-[10px] disabled:cursor-not-allowed disabled:opacity-40"
                style={{ borderColor: "var(--c-red)", color: "var(--c-red)" }}
              >
                {deleting ? (
                  <Spinner className="h-2.5 w-2.5" />
                ) : (
                  <Trash2 className="h-2.5 w-2.5" />
                )}
                Delete
              </button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
