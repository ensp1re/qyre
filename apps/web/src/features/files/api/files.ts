import type { FileContent, FilesOverview } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

/** Fetch the Files tab's tree of `.sql` files (empty/disabled if no --files-dir was configured). */
export function fetchFilesOverview(): Promise<FilesOverview> {
  return fetchJson<FilesOverview>("/api/files");
}

/** Fetch a single `.sql` file's content by its path (as returned in FilesOverview's tree). */
export function fetchFileContent(path: string): Promise<FileContent> {
  return fetchJson<FileContent>(`/api/files/content?path=${encodeURIComponent(path)}`);
}
