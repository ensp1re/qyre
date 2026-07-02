/**
 * Read-only filesystem access for the Files tab (DF-06). The security boundary this implements is
 * documented in docs/product-specs/dashboard-ui.md's "Files tab security boundary" section - read
 * that before changing this file.
 */
import { readdirSync } from "node:fs";
import { extname, join, relative, resolve, sep } from "node:path";
import type { FileNode } from "@humbdb/core";

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
    // Symlinks are neither isDirectory() nor isFile() (Dirent doesn't follow them) and are
    // silently excluded - see the security boundary doc for why this matters.
  }

  return nodes.sort((a, b) =>
    a.type !== b.type ? (a.type === "directory" ? -1 : 1) : a.name.localeCompare(b.name)
  );
}

/** Recursively builds a tree of `.sql` files under `rootDir`, pruning directories with none. */
export function buildFileTree(rootDir: string): FileNode[] {
  return walk(rootDir, rootDir);
}

/** A client-supplied file path failed the Files tab's security boundary. Maps to HTTP 400. */
export class InvalidFilePathError extends Error {}

/**
 * Resolves a client-supplied relative path to an absolute path within `rootDir`, rejecting `..`
 * traversal, non-`.sql` extensions, and anything that resolves outside `rootDir`.
 */
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

  return absolutePath;
}
