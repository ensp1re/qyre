import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  createShutdownHandler,
  defaultWebRoot,
  formatBanner,
  parseArgs,
  resolveFilesRoot,
  resolvePort,
  resolveVersion
} from "./index.js";

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

  it("defaults verbose to false", () => {
    expect(parseArgs(["postgres://localhost/db"]).verbose).toBe(false);
  });

  it("parses the --verbose flag", () => {
    expect(parseArgs(["postgres://localhost/db", "--verbose"]).verbose).toBe(true);
  });
});

describe("resolvePort", () => {
  it("prefers the --port flag over QYRE_PORT", () => {
    expect(resolvePort(9000, { QYRE_PORT: "8000" })).toBe(9000);
  });

  it("falls back to QYRE_PORT when no flag is given", () => {
    expect(resolvePort(undefined, { QYRE_PORT: "8000" })).toBe(8000);
  });

  it("returns undefined when neither is set", () => {
    expect(resolvePort(undefined, {})).toBeUndefined();
  });

  it("ignores an invalid QYRE_PORT", () => {
    expect(resolvePort(undefined, { QYRE_PORT: "not-a-number" })).toBeUndefined();
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

describe("createShutdownHandler", () => {
  it("closes the server and adapter, then exits 0 on success", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const log = vi.fn();
    const shutdown = createShutdownHandler({ close, disconnect, exit, log });

    await shutdown();

    expect(close).toHaveBeenCalledOnce();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
    expect(log).not.toHaveBeenCalled();
  });

  it("exits 1 and logs the reason when teardown throws", async () => {
    const close = vi.fn().mockRejectedValue(new Error("pool is wedged"));
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const log = vi.fn();
    const shutdown = createShutdownHandler({ close, disconnect, exit, log });

    await shutdown();

    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("pool is wedged"));
    expect(disconnect).not.toHaveBeenCalled();
  });

  it("exits 1 once teardown exceeds the configured timeout, instead of hanging forever", async () => {
    const close = vi.fn(() => new Promise<void>(() => {})); // never resolves
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const log = vi.fn();
    const shutdown = createShutdownHandler({ close, disconnect, exit, log, timeoutMs: 10 });

    await shutdown();

    expect(exit).toHaveBeenCalledWith(1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("did not complete within 10ms"));
  });

  it("ignores a second signal while teardown is already in flight (re-entrancy guard)", async () => {
    let resolveClose: () => void = () => {};
    const close = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveClose = resolve;
        })
    );
    const disconnect = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const log = vi.fn();
    const shutdown = createShutdownHandler({ close, disconnect, exit, log });

    const first = shutdown();
    const second = shutdown();
    resolveClose();
    await Promise.all([first, second]);

    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });
});

describe("defaultWebRoot", () => {
  function makeDir(): string {
    return mkdtempSync(join(tmpdir(), "qyre-cli-webroot-"));
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

describe("resolveVersion", () => {
  it("reads the version from package.json one directory up from `here`", () => {
    const root = mkdtempSync(join(tmpdir(), "qyre-cli-version-"));
    const here = join(root, "dist");
    mkdirSync(here);
    writeFileSync(join(root, "package.json"), JSON.stringify({ version: "1.2.3" }));

    expect(resolveVersion(here)).toBe("1.2.3");
  });
});

describe("formatBanner", () => {
  it("includes the version, target, url, and issue/contributing links", () => {
    const banner = formatBanner({
      version: "1.2.3",
      target: "postgres://localhost:5432/db",
      url: "http://127.0.0.1:4000"
    });

    expect(banner).toContain("Qyre v1.2.3");
    expect(banner).toContain("postgres://localhost:5432/db");
    expect(banner).toContain("http://127.0.0.1:4000");
    expect(banner).toContain("https://github.com/ensp1re/qyre/issues");
    expect(banner).toContain("https://github.com/ensp1re/qyre/blob/main/CONTRIBUTING.md");
  });

  it("shows an explicit 'no database connected yet' line when target is null (F073)", () => {
    const banner = formatBanner({ version: "1.2.3", target: null, url: "http://127.0.0.1:4000" });

    expect(banner).toContain("Qyre v1.2.3 — no database connected yet");
    expect(banner).toContain("http://127.0.0.1:4000");
    expect(banner).not.toContain("connected to");
  });
});
