/** A node in the Files tab's read-only file tree - either a directory or a `.sql` file. */
export interface FileNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory";
  readonly children?: FileNode[];
}

/** Response for `GET /api/files`. `enabled` is false when no `--files-dir` was configured. */
export interface FilesOverview {
  readonly enabled: boolean;
  readonly tree: FileNode[];
}

/** Above this size (F133/SUGGESTIONS.md S5), `GET /api/files/content` returns only the file's
 * first `FILES_PREVIEW_MAX_BYTES` bytes instead of reading the whole file into memory - a large
 * dump file (`.sql` files near a launch target commonly are) would otherwise block the event loop
 * and ship as one multi-gigabyte JSON string. */
export const FILES_PREVIEW_MAX_BYTES = 1024 * 1024;

/** Response for `GET /api/files/content`. `truncated` is true when `content` is only the file's
 * first `FILES_PREVIEW_MAX_BYTES` bytes, not the whole file (F133). */
export interface FileContent {
  readonly path: string;
  readonly content: string;
  readonly truncated: boolean;
}
