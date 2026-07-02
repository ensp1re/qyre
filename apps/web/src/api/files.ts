import type { FileContent, FilesOverview } from "@humb/core";

/** Fetch the Files tab's tree of `.sql` files (empty/disabled if no --files-dir was configured). */
export async function fetchFilesOverview(): Promise<FilesOverview> {
  const response = await fetch("/api/files");
  if (!response.ok) {
    throw new Error(`Failed to load files (status ${response.status})`);
  }
  return (await response.json()) as FilesOverview;
}

/** Fetch a single `.sql` file's content by its path (as returned in FilesOverview's tree). */
export async function fetchFileContent(path: string): Promise<FileContent> {
  const response = await fetch(`/api/files/content?path=${encodeURIComponent(path)}`);
  if (!response.ok) {
    throw new Error(`Failed to load file ${path} (status ${response.status})`);
  }
  return (await response.json()) as FileContent;
}
