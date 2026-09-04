import { ErrorState, FilesBrowser, Spinner } from "@qyre/ui";
import type { ReactNode } from "react";
import type { useFileContent, useFilesOverview } from "../model/use-files.js";

export interface FilesTabProps {
  filesOverview: ReturnType<typeof useFilesOverview>;
  fileContent: ReturnType<typeof useFileContent>;
  selectedFilePath: string | undefined;
  onSelectFile: (path: string) => void;
  onRunInEditor?: (content: string) => void;
}

export function FilesTab({
  filesOverview,
  fileContent,
  selectedFilePath,
  onSelectFile,
  onRunInEditor
}: FilesTabProps): ReactNode {
  if (filesOverview.isLoading) {
    return (
      <p className="flex items-center gap-1.5 p-4 text-[13px] text-muted-foreground">
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
      <p className="p-4 text-[13px] text-muted-foreground">
        File browsing is available for every database engine when Qyre is launched with{" "}
        <code className="font-mono">--files-dir &lt;dir&gt;</code>. No files directory is configured
        for this session.
      </p>
    );
  }

  if (filesOverview.data.tree.length === 0) {
    return (
      <p className="p-4 text-[13px] text-muted-foreground">
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
      contentTruncated={fileContent.data?.truncated}
      isContentLoading={fileContent.isLoading}
      contentError={
        fileContent.isError
          ? fileContent.error instanceof Error
            ? fileContent.error.message
            : "Failed to load file."
          : undefined
      }
      onRetryContent={() => fileContent.refetch()}
      onRunInEditor={onRunInEditor}
    />
  );
}
