/**
 * Read-only filesystem access for the Files tab (DF-06). The security boundary this implements is
 * documented in docs/product-specs/dashboard-ui.md's "Files tab security boundary" section - read
 * that before changing this file.
 */
import { readdirSync, realpathSync } from "node:fs";
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

  // The lexical check above stops `..` traversal, but not a symlink inside rootDir whose target
  // resolves outside it - buildFileTree excludes symlinks from listings, but this endpoint reads
  // whatever path it's given, so a pre-existing (or attacker-created) symlink would otherwise
  // bypass the boundary. realpathSync follows every symlink in the path; re-checking the result
  // against the real (also symlink-resolved) root catches that. A path that doesn't exist yet has
  // nothing to resolve - the caller's existsSync/statSync check handles that as a 404, not a
  // security concern, so it's not an error here.
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
