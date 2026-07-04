import { ErrorState, FilesBrowser, Spinner } from "@humbdb/ui";
import type { ReactNode } from "react";
import type { useFileContent, useFilesOverview } from "../hooks/use-files.js";

export interface FilesTabProps {
  filesOverview: ReturnType<typeof useFilesOverview>;
  fileContent: ReturnType<typeof useFileContent>;
  selectedFilePath: string | undefined;
  onSelectFile: (path: string) => void;
}

/** Files tab content - a read-only browser for `.sql` files near the launch target. */
export function FilesTab({
  filesOverview,
  fileContent,
  selectedFilePath,
  onSelectFile
}: FilesTabProps): ReactNode {
  if (filesOverview.isLoading) {
    return (
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Spinner /> Loading files...
      </p>
    );
  }

  if (filesOverview.isError) {
    return (
      <ErrorState
        message={
          filesOverview.error instanceof Error
            ? filesOverview.error.message
            : "Failed to load files."
        }
        onRetry={() => filesOverview.refetch()}
      />
    );
  }

  if (!filesOverview.data?.enabled) {
    return (
      <p className="text-[13px] text-muted-foreground">
        File browsing is disabled. Launch Humb with{" "}
        <code className="font-mono">--files-dir &lt;dir&gt;</code> to browse and preview{" "}
        <code className="font-mono">.sql</code> files.
      </p>
    );
  }

  if (filesOverview.data.tree.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        No .sql files found under the configured files directory.
      </p>
    );
  }

  return (
    <FilesBrowser
      tree={filesOverview.data.tree}
      selectedPath={selectedFilePath}
      onSelectFile={onSelectFile}
      content={fileContent.data?.content}
      isContentLoading={fileContent.isLoading}
      contentError={
        fileContent.isError
          ? fileContent.error instanceof Error
            ? fileContent.error.message
            : "Failed to load file."
          : undefined
      }
      onRetryContent={() => fileContent.refetch()}
    />
  );
}
