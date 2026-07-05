import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { redactConnectionString, parseConnectionTarget } from "./connection-target.js";
import { InvalidConnectionTargetError } from "./errors.js";

describe("parseConnectionTarget", () => {
  it("accepts postgres:// urls", () => {
    const target = parseConnectionTarget("postgres://user:pass@localhost:5432/mydb");
    expect(target.engine).toBe("postgres");
  });

  it("accepts postgresql:// urls", () => {
    const target = parseConnectionTarget("postgresql://localhost/mydb");
    expect(target.engine).toBe("postgres");
  });

  it("rejects an empty target", () => {
    expect(() => parseConnectionTarget("")).toThrow(InvalidConnectionTargetError);
  });

  it("rejects a bare path/string that doesn't resolve to an existing file", () => {
    expect(() => parseConnectionTarget("not a url")).toThrow(InvalidConnectionTargetError);
  });

  it("accepts mysql:// urls", () => {
    const target = parseConnectionTarget("mysql://user:pass@localhost:3306/mydb");
    expect(target.engine).toBe("mysql");
  });

  it("accepts mongodb:// urls", () => {
    const target = parseConnectionTarget("mongodb://localhost:27017/mydb");
    expect(target.engine).toBe("mongodb");
  });

  it("accepts mongodb+srv:// urls", () => {
    const target = parseConnectionTarget(
      "mongodb+srv://user:pass@cluster.example.mongodb.net/mydb"
    );
    expect(target.engine).toBe("mongodb");
  });

  it("rejects unsupported protocols", () => {
    expect(() => parseConnectionTarget("redis://localhost/db")).toThrow(
      InvalidConnectionTargetError
    );
  });

  it("accepts an existing SQLite file path", () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-core-sqlite-"));
    const dbPath = join(dir, "app.db");
    writeFileSync(dbPath, "");
    const target = parseConnectionTarget(dbPath);
    expect(target.engine).toBe("sqlite");
    expect(target.raw).toBe(dbPath);
  });

  it("accepts a file:// URL pointing at an existing SQLite file", () => {
    const dir = mkdtempSync(join(tmpdir(), "qyre-core-sqlite-"));
    const dbPath = join(dir, "app.db");
    writeFileSync(dbPath, "");
    const target = parseConnectionTarget(`file://${dbPath}`);
    expect(target.engine).toBe("sqlite");
  });

  it("rejects a SQLite path that does not exist, naming the resolved path", () => {
    expect(() => parseConnectionTarget("./definitely-does-not-exist.db")).toThrow(
      /definitely-does-not-exist\.db/
    );
  });
});

describe("redactConnectionString", () => {
  it("masks the password", () => {
    expect(redactConnectionString("postgres://user:secret@localhost:5432/db")).not.toContain(
      "secret"
    );
  });

  it("returns a mask for unparseable input", () => {
    expect(redactConnectionString("nope")).toBe("<unparseable connection string>");
  });

  it("masks a credential passed as a ?password= query parameter (F024 regression)", () => {
    const redacted = redactConnectionString(
      "postgres://user@localhost:5432/db?password=supersecret"
    );
    expect(redacted).not.toContain("supersecret");
    expect(redacted).toContain("password=***");
  });

  it("masks a ?pwd= query parameter", () => {
    const redacted = redactConnectionString("mysql://user@localhost:3306/db?pwd=supersecret");
    expect(redacted).not.toContain("supersecret");
  });

  it("masks a MongoDB TLS client-cert passphrase query parameter", () => {
    const redacted = redactConnectionString(
      "mongodb://localhost:27017/db?tlsCertificateKeyFilePassword=supersecret"
    );
    expect(redacted).not.toContain("supersecret");
  });

  it("does not touch an unrelated query parameter", () => {
    const redacted = redactConnectionString("postgres://user@localhost:5432/db?sslmode=require");
    expect(redacted).toContain("sslmode=require");
  });
});
