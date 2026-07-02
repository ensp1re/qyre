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

/** Response for `GET /api/files/content`. */
export interface FileContent {
  readonly path: string;
  readonly content: string;
}
