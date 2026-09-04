import type { FileContent, FilesOverview } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

export function fetchFilesOverview(): Promise<FilesOverview> {
  return fetchJson<FilesOverview>("/api/files");
}

export function fetchFileContent(path: string): Promise<FileContent> {
  return fetchJson<FileContent>(`/api/files/content?path=${encodeURIComponent(path)}`);
}
