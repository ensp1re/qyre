import type { ConnectionTarget } from "@qyre/core";
import { describe, expect, it, vi } from "vitest";
import {
  composeGuidedConnectionString,
  fillMissingCredentials,
  needsCredentialPrompt,
  runGuidedLogin,
  type GuidedLoginPrompts
} from "./guided-login.js";

function makeIo(answers: string[]): GuidedLoginPrompts & { lines: string[] } {
  const lines: string[] = [];
  const queue = [...answers];
  return {
    lines,
    writeLine: (text) => lines.push(text),
    ask: async (question) => {
      lines.push(question);
      return queue.shift() ?? "";
    },
    askMasked: async (question) => {
      lines.push(question);
      return queue.shift() ?? "";
    }
  };
}

describe("composeGuidedConnectionString", () => {
  it("composes a full connection string from fields", () => {
    expect(
      composeGuidedConnectionString({
        engine: "postgres",
        host: "db.example.com",
        port: "5433",
        user: "alice",
        password: "secret",
        database: "mydb"
      })
    ).toBe("postgres://alice:secret@db.example.com:5433/mydb");
  });

  it("falls back to localhost and the engine's default port when blank", () => {
    expect(
      composeGuidedConnectionString({
        engine: "mysql",
        host: "",
        port: "",
        user: "",
        password: "",
        database: ""
      })
    ).toBe("mysql://localhost:3306");
  });

  it("omits the password when only a user is given", () => {
    expect(
      composeGuidedConnectionString({
        engine: "mongodb",
        host: "localhost",
        port: "27017",
        user: "bob",
        password: "",
        database: "app"
      })
    ).toBe("mongodb://bob@localhost:27017/app");
  });

  it("percent-encodes special characters in credentials", () => {
    expect(
      composeGuidedConnectionString({
        engine: "postgres",
        host: "localhost",
        port: "5432",
        user: "a@b",
        password: "p:w",
        database: "db"
      })
    ).toBe("postgres://a%40b:p%3Aw@localhost:5432/db");
  });
});

describe("needsCredentialPrompt", () => {
  it("is true for a URL-shaped target with no username", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://host:5432/db" };
    expect(needsCredentialPrompt(target)).toBe(true);
  });

  it("is false once a username is present", () => {
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://user@host:5432/db" };
    expect(needsCredentialPrompt(target)).toBe(false);
  });

  it("is always false for sqlite", () => {
    const target: ConnectionTarget = { engine: "sqlite", raw: "./app.db" };
    expect(needsCredentialPrompt(target)).toBe(false);
  });
});

describe("runGuidedLogin", () => {
  it("picks an engine, enters fields, and returns the composed string on a successful connect", async () => {
    const io = makeIo(["1", "alice", "secret", "db.example.com", "5433", "mydb"]);
    const connect = vi.fn().mockResolvedValue(undefined);

    const raw = await runGuidedLogin(io, connect);

    expect(raw).toBe("postgres://alice:secret@db.example.com:5433/mydb");
    expect(connect).toHaveBeenCalledWith(raw);
  });

  it("re-prompts fields and retries after a failed connect when the user says yes", async () => {
    const io = makeIo([
      "2", // MySQL
      "alice",
      "wrong-pass",
      "",
      "",
      "db",
      "y", // retry
      "alice",
      "right-pass",
      "",
      "",
      "db"
    ]);
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("auth failed"))
      .mockResolvedValueOnce(undefined);

    const raw = await runGuidedLogin(io, connect);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(raw).toBe("mysql://alice:right-pass@localhost:3306/db");
    expect(io.lines.some((line) => line.includes("auth failed"))).toBe(true);
  });

  it("throws the connect error when the user declines to retry", async () => {
    const io = makeIo(["3", "alice", "bad-pass", "", "", "db", "n"]);
    const error = new Error("connection refused");
    const connect = vi.fn().mockRejectedValue(error);

    await expect(runGuidedLogin(io, connect)).rejects.toThrow("connection refused");
    expect(connect).toHaveBeenCalledTimes(1);
  });
});

describe("fillMissingCredentials", () => {
  it("prompts for user/password and merges them into the target's connection string", async () => {
    const io = makeIo(["alice", "secret"]);
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://host:5432/db" };
    const connect = vi.fn().mockResolvedValue(undefined);

    const raw = await fillMissingCredentials(io, target, connect);

    expect(raw).toBe("postgres://alice:secret@host:5432/db");
  });

  it("skips the password prompt when user is left blank", async () => {
    const io = makeIo([""]);
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://host:5432/db" };
    const connect = vi.fn().mockResolvedValue(undefined);

    const raw = await fillMissingCredentials(io, target, connect);

    expect(raw).toBe("postgres://host:5432/db");
    expect(io.lines.filter((line) => line.startsWith("Password"))).toHaveLength(0);
  });

  it("retries the credential prompt after a failed connect", async () => {
    const io = makeIo(["alice", "wrong", "y", "alice", "right"]);
    const target: ConnectionTarget = { engine: "postgres", raw: "postgres://host:5432/db" };
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("bad password"))
      .mockResolvedValueOnce(undefined);

    const raw = await fillMissingCredentials(io, target, connect);

    expect(connect).toHaveBeenCalledTimes(2);
    expect(raw).toBe("postgres://alice:right@host:5432/db");
  });
});
