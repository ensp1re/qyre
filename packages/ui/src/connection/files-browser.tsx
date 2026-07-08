import type { FileNode } from "@qyre/core";
import { File, FileCode2, FolderOpen, Play } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "../cn.js";
import { ErrorState } from "../feedback/error-state.js";
import { Spinner } from "../feedback/spinner.js";

export interface FilesBrowserProps {
  tree: FileNode[];
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  content?: string;
  isContentLoading?: boolean;
  contentError?: string;
  onRetryContent?: () => void;
  /** Runs the currently-previewed `.sql` file's content in the SQL Editor (F062). Omitted (button
   * hidden) when the SQL Editor isn't available for the current connection, e.g. MongoDB. */
  onRunInEditor?: (content: string) => void;
}

function TreeRow({
  node,
  depth,
  selectedPath,
  onSelectFile
}: {
  node: FileNode;
  depth: number;
  selectedPath?: string;
  onSelectFile: (path: string) => void;
}): ReactNode {
  const [open, setOpen] = useState(depth < 1);
  const isSelected = node.type === "file" && node.path === selectedPath;

  return (
    <div>
      <div
        role={node.type === "file" ? "button" : undefined}
        aria-pressed={node.type === "file" ? isSelected : undefined}
        className={cn(
          "mx-1 flex cursor-pointer select-none items-center gap-1.5 rounded-[2px] py-[3px] pr-2 hover:bg-sidebar-accent",
          isSelected && "bg-primary/10"
        )}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => {
          if (node.type === "directory") setOpen((current) => !current);
          else onSelectFile(node.path);
        }}
      >
        {node.type === "directory" ? (
          <svg
            viewBox="0 0 24 24"
            className={cn(
              "h-2.5 w-2.5 shrink-0 text-muted-foreground/60 transition-transform",
              open && "rotate-90"
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className="w-2.5 shrink-0" />
        )}

        {node.type === "directory" ? (
          <FolderOpen className="h-3 w-3 shrink-0" style={{ color: "var(--c-amber)" }} />
        ) : (
          <File className="h-3 w-3 shrink-0" style={{ color: "var(--c-blue)" }} />
        )}

        <span
          className={cn(
            "truncate font-mono text-[11px] text-foreground/70",
            isSelected ? "text-foreground" : "hover:text-foreground"
          )}
        >
          {node.name}
        </span>
      </div>

      {node.type === "directory" && open && (
        <div>
          {node.children?.map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              onSelectFile={onSelectFile}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** A read-only browser for `.sql` files (DF-06): a folder/file tree plus a line-numbered preview. */
export function FilesBrowser({
  tree,
  selectedPath,
  onSelectFile,
  content,
  isContentLoading,
  contentError,
  onRetryContent,
  onRunInEditor
}: FilesBrowserProps): ReactNode {
  const lines = content?.split("\n") ?? [];
  const canRunInEditor =
    onRunInEditor !== undefined && content !== undefined && selectedPath?.endsWith(".sql");

  return (
    <div
      data-testid="files-browser"
      className="flex h-full overflow-hidden rounded-[3px] border border-border"
    >
      <nav className="w-48 shrink-0 overflow-y-auto border-r border-border bg-sidebar py-1">
        {tree.map((node) => (
          <TreeRow
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            onSelectFile={onSelectFile}
          />
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-card px-3 py-2">
          <FileCode2 className="h-3 w-3 shrink-0" style={{ color: "var(--c-blue)" }} />
          <span className="truncate font-mono text-[11px] text-foreground">
            {selectedPath ?? "Select a file"}
          </span>
          {canRunInEditor && (
            <button
              type="button"
              onClick={() => onRunInEditor?.(content ?? "")}
              title="Run this file's SQL in the SQL Editor"
              className="ml-auto flex items-center gap-1 rounded-[3px] px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Play className="h-2.5 w-2.5" /> Run in editor
            </button>
          )}
        </div>

        {isContentLoading ? (
          <p className="flex items-center gap-1.5 p-3 text-[13px] text-muted-foreground">
            <Spinner /> Loading file...
          </p>
        ) : contentError ? (
          <ErrorState message={contentError} onRetry={() => onRetryContent?.()} />
        ) : content === undefined ? (
          <p className="p-3 font-mono text-[11px] text-muted-foreground">No file selected.</p>
        ) : (
          <div className="flex flex-1 overflow-auto">
            <div
              aria-hidden="true"
              className="shrink-0 select-none border-r border-border bg-background pr-3 pt-3 text-right font-mono text-[11px] text-muted-foreground/30"
              style={{ minWidth: "44px" }}
            >
              {lines.map((_, index) => (
                <div key={index} style={{ lineHeight: "20px" }}>
                  {index + 1}
                </div>
              ))}
            </div>
            <pre className="flex-1 whitespace-pre p-3 font-mono text-[12px] leading-5 text-foreground/80">
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
