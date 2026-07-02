import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { defaultWebRoot, parseArgs, resolveFilesRoot, resolvePort } from "./index.js";

describe("parseArgs", () => {
  it("parses a target argument", () => {
    expect(parseArgs(["postgres://localhost/db"]).target).toBe("postgres://localhost/db");
  });

  it("parses the port option", () => {
    const args = parseArgs(["postgres://localhost/db", "--port", "9000"]);
    expect(args.port).toBe(9000);
  });

  it("returns an undefined target when none is given", () => {
    expect(parseArgs([]).target).toBeUndefined();
  });

  it("parses the --files-dir option", () => {
    const args = parseArgs(["postgres://localhost/db", "--files-dir", "./sql"]);
    expect(args.filesDir).toBe("./sql");
  });

  it("returns an undefined filesDir when the flag is omitted", () => {
    expect(parseArgs(["postgres://localhost/db"]).filesDir).toBeUndefined();
  });
});

describe("resolvePort", () => {
  it("prefers the --port flag over HUMB_PORT", () => {
    expect(resolvePort(9000, { HUMB_PORT: "8000" })).toBe(9000);
  });

  it("falls back to HUMB_PORT when no flag is given", () => {
    expect(resolvePort(undefined, { HUMB_PORT: "8000" })).toBe(8000);
  });

  it("returns undefined when neither is set", () => {
    expect(resolvePort(undefined, {})).toBeUndefined();
  });

  it("ignores an invalid HUMB_PORT", () => {
    expect(resolvePort(undefined, { HUMB_PORT: "not-a-number" })).toBeUndefined();
  });
});

describe("resolveFilesRoot", () => {
  it("resolves a relative path against cwd", () => {
    expect(resolveFilesRoot("./sql", "/home/user/project")).toBe("/home/user/project/sql");
  });

  it("returns undefined when no --files-dir flag was given", () => {
    expect(resolveFilesRoot(undefined, "/home/user/project")).toBeUndefined();
  });
});

describe("defaultWebRoot", () => {
  function makeDir(): string {
    return mkdtempSync(join(tmpdir(), "humb-cli-webroot-"));
  }

  it("prefers a bundled web/ directory next to the running file (published package, F010)", () => {
    const here = makeDir();
    mkdirSync(join(here, "web"));
    writeFileSync(join(here, "web", "index.html"), "<html></html>");

    expect(defaultWebRoot(here)).toBe(join(here, "web"));
  });

  it("falls back to the monorepo-relative apps/web/dist when no bundled copy exists", () => {
    const here = makeDir();
    expect(defaultWebRoot(here)).toBe(resolve(here, "../../../apps/web/dist"));
  });
});
