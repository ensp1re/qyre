import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFileTree, InvalidFilePathError, resolveSqlFilePath } from "./files.js";

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), "humb-files-"));
}

describe("buildFileTree", () => {
  it("lists .sql files and skips other extensions", () => {
    const root = makeRoot();
    writeFileSync(join(root, "schema.sql"), "SELECT 1;");
    writeFileSync(join(root, "notes.txt"), "not sql");

    const tree = buildFileTree(root);
    expect(tree).toEqual([{ name: "schema.sql", path: "schema.sql", type: "file" }]);
  });

  it("includes directories only if they contain a .sql file somewhere below them", () => {
    const root = makeRoot();
    mkdirSync(join(root, "migrations"));
    writeFileSync(join(root, "migrations", "001_init.sql"), "CREATE TABLE t (id int);");
    mkdirSync(join(root, "empty"));

    const tree = buildFileTree(root);
    expect(tree).toEqual([
      {
        name: "migrations",
        path: "migrations",
        type: "directory",
        children: [{ name: "001_init.sql", path: "migrations/001_init.sql", type: "file" }]
      }
    ]);
  });

  it("skips dotfiles and node_modules", () => {
    const root = makeRoot();
    writeFileSync(join(root, ".hidden.sql"), "SELECT 1;");
    mkdirSync(join(root, "node_modules"));
    writeFileSync(join(root, "node_modules", "pkg.sql"), "SELECT 1;");

    expect(buildFileTree(root)).toEqual([]);
  });

  it("does not follow a symlink into or out of the root", () => {
    const root = makeRoot();
    const outside = makeRoot();
    writeFileSync(join(outside, "secret.sql"), "SELECT 'secret';");
    symlinkSync(outside, join(root, "linked"));

    expect(buildFileTree(root)).toEqual([]);
  });
});

describe("resolveSqlFilePath", () => {
  it("resolves a valid relative path within the root", () => {
    const root = makeRoot();
    expect(resolveSqlFilePath(root, "schema.sql")).toBe(join(root, "schema.sql"));
    expect(resolveSqlFilePath(root, "migrations/001_init.sql")).toBe(
      join(root, "migrations", "001_init.sql")
    );
  });

  it("rejects a path containing '..' segments", () => {
    const root = makeRoot();
    expect(() => resolveSqlFilePath(root, "../secret.sql")).toThrow(InvalidFilePathError);
    expect(() => resolveSqlFilePath(root, "a/../../secret.sql")).toThrow(InvalidFilePathError);
  });

  it("rejects a non-.sql extension", () => {
    const root = makeRoot();
    expect(() => resolveSqlFilePath(root, "secret.txt")).toThrow(InvalidFilePathError);
  });

  it("rejects an absolute path that resolves outside the root", () => {
    const root = makeRoot();
    expect(() => resolveSqlFilePath(root, "/etc/passwd.sql")).toThrow(InvalidFilePathError);
  });
});
