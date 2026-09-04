import {
  closeSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  statSync
} from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import type { FileNode } from "@qyre/core";

const SQL_EXTENSION = ".sql";
const SKIPPED_DIR_NAMES = new Set(["node_modules"]);

function toPosixPath(path: string): string {
  return path.split(sep).join("/");
}

function walk(rootDir: string, dir: string): FileNode[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") || SKIPPED_DIR_NAMES.has(entry.name)) continue;
    const absolutePath = join(dir, entry.name);

    if (entry.isDirectory()) {
      const children = walk(rootDir, absolutePath);
      if (children.length > 0) {
        nodes.push({
          name: entry.name,
          path: toPosixPath(relative(rootDir, absolutePath)),
          type: "directory",
          children
        });
      }
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === SQL_EXTENSION) {
      nodes.push({
        name: entry.name,
        path: toPosixPath(relative(rootDir, absolutePath)),
        type: "file"
      });
    }
  }

  return nodes.sort((a, b) =>
    a.type !== b.type ? (a.type === "directory" ? -1 : 1) : a.name.localeCompare(b.name)
  );
}

/** Recursively builds a tree of `.sql` files under `rootDir`, pruning directories with none. */
export function buildFileTree(rootDir: string): FileNode[] {
  return walk(rootDir, rootDir);
}

export class InvalidFilePathError extends Error {}

export function resolveSqlFilePath(rootDir: string, relativePath: string): string {
  if (relativePath.split(/[/\\]/).includes("..")) {
    throw new InvalidFilePathError("Path must not contain '..' segments.");
  }
  if (extname(relativePath).toLowerCase() !== SQL_EXTENSION) {
    throw new InvalidFilePathError("Only .sql files can be previewed.");
  }

  const absolutePath = resolve(rootDir, relativePath);
  const rootWithSep = rootDir.endsWith(sep) ? rootDir : rootDir + sep;
  if (!absolutePath.startsWith(rootWithSep)) {
    throw new InvalidFilePathError("Path escapes the files directory.");
  }

  // Recheck the resolved path after following symlinks to enforce root containment.
  let realAbsolutePath: string;
  try {
    realAbsolutePath = realpathSync(absolutePath);
  } catch {
    return absolutePath;
  }
  const realRootDir = realpathSync(rootDir);
  const realRootWithSep = realRootDir.endsWith(sep) ? realRootDir : realRootDir + sep;
  if (!realAbsolutePath.startsWith(realRootWithSep)) {
    throw new InvalidFilePathError("Path escapes the files directory.");
  }

  return realAbsolutePath;
}

export function readFilePreview(
  path: string,
  maxBytes: number
): { content: string; truncated: boolean } {
  if (statSync(path).size <= maxBytes) {
    return { content: readFileSync(path, "utf-8"), truncated: false };
  }

  const fd = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const bytesRead = readSync(fd, buffer, 0, maxBytes, 0);
    return { content: buffer.toString("utf-8", 0, bytesRead), truncated: true };
  } finally {
    closeSync(fd);
  }
}
