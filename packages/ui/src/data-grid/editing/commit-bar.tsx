import { AlertTriangle, Check, ChevronDown, ChevronUp, X } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "../../cn.js";
import { Spinner } from "../../feedback/spinner.js";

export interface CommitBarProps {
  insertCount: number;
  updateCount: number;
  deleteCount: number;
  /** One generated-statement preview line per staged op, in the same order the commit request will
   * submit them (docs/product-specs/row-editing.md's "generated-statement preview" - the buffer's
   * own review step, and this feature's confirmation surface for non-destructive ops). */
  previewLines: readonly string[];
  onCommit: () => void;
  onDiscard: () => void;
  committing: boolean;
  /** Message from a failed commit attempt - shown alongside the failed op, buffer left intact so
   * the work isn't lost (per the spec's "buffer preserved on failure"). */
  error?: string;
  /** Index into `previewLines` of the operation that failed, when known - highlighted in the
   * preview list. */
  failedIndex?: number;
}

/**
 * The pending-changes commit bar (F105): the final review/apply step for everything staged by
 * F103's inline editing and F104's Add-row/Duplicate-row. Renders nothing when the buffer is empty
 * - appears only once there's something to commit. Never calls the server itself; `onCommit`/
 * `onDiscard` are the caller's (packages/ui components don't fetch, per FRONTEND.md).
 */
export function CommitBar({
  insertCount,
  updateCount,
  deleteCount,
  previewLines,
  onCommit,
  onDiscard,
  committing,
  error,
  failedIndex
}: CommitBarProps): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const total = insertCount + updateCount + deleteCount;
  if (total === 0) return null;

  const parts: string[] = [];
  if (insertCount > 0) parts.push(`${insertCount} to insert`);
  if (updateCount > 0) parts.push(`${updateCount} to update`);
  if (deleteCount > 0) parts.push(`${deleteCount} to delete`);

  return (
    <div className="shrink-0 border-t border-border bg-card">
      {expanded && (
        <div className="max-h-40 overflow-auto border-b border-border-subtle px-3 py-2">
          <ol className="space-y-1 font-mono text-[10px] text-muted-foreground">
            {previewLines.map((line, index) => (
              <li
                key={index}
                className={cn(
                  "whitespace-pre-wrap break-all",
                  index === failedIndex && "font-bold text-[var(--c-red)]"
                )}
              >
                {line}
              </li>
            ))}
          </ol>
        </div>
      )}

      {error && (
        <div
          className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-1.5 font-mono text-[10px]"
          style={{ color: "var(--c-red)" }}
        >
          <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
          {error}
        </div>
      )}

      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          className="flex items-center gap-1 font-mono text-[11px] text-foreground/80 hover:text-foreground"
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {parts.join(", ")}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onDiscard}
            disabled={committing}
            className="flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            <X className="h-3 w-3" /> Discard
          </button>
          <button
            type="button"
            onClick={onCommit}
            disabled={committing}
            title="Commit (Ctrl/Cmd+S)"
            className="flex items-center gap-1.5 rounded-[3px] px-3 py-1 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "var(--c-green)" }}
          >
            {committing ? (
              <Spinner className="h-2.5 w-2.5 text-primary-foreground" />
            ) : (
              <Check className="h-2.5 w-2.5" />
            )}
            {committing ? "Committing..." : "Commit"}
          </button>
        </div>
      </div>
    </div>
  );
}
