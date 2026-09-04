import { describe, expect, it } from "vitest";
import { describeError, displayTarget } from "../../src/services/connection/connection-display.js";

describe("describeError redaction (F131)", () => {
  it("redacts a userinfo password embedded in a driver error message", () => {
    const error = new Error(
      'Invalid scheme: expected connection string to start with "mongodb://": ' +
        '"mongodb://admin:hunter2@localhost/?badOption=1"'
    );
    const message = describeError(error);
    expect(message).not.toContain("hunter2");
    expect(message).toContain("mongodb://admin:***@localhost");
  });

  it("redacts a credential-named query param embedded in a driver error message", () => {
    const error = new Error(
      'Could not parse "postgres://host/db?sslpassword=hunter2&sslmode=require"'
    );
    const message = describeError(error);
    expect(message).not.toContain("hunter2");
    expect(message).toContain("sslpassword=***");
    expect(message).toContain("sslmode=require");
  });

  it("leaves an ordinary error message with no embedded credentials unchanged", () => {
    const error = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    expect(describeError(error)).toBe("connect ECONNREFUSED 127.0.0.1:5432");
  });

  it("unwraps an AggregateError's first nested error and still redacts it", () => {
    const inner = new Error("mongodb://admin:hunter2@localhost failed");
    const aggregate = new AggregateError([inner], "");
    const message = describeError(aggregate);
    expect(message).not.toContain("hunter2");
    expect(message).toContain("mongodb://admin:***@localhost");
  });

  it("redacts a non-Error value's string form too", () => {
    expect(describeError("mongodb://admin:hunter2@localhost")).toBe(
      "mongodb://admin:***@localhost"
    );
  });
});

describe("displayTarget (unaffected by F131)", () => {
  it("still redacts a normal connection target via redactConnectionString", () => {
    expect(displayTarget({ engine: "postgres", raw: "postgres://user:pass@localhost/db" })).toBe(
      "postgres://user:***@localhost/db"
    );
  });

  it("leaves a SQLite file path untouched", () => {
    expect(displayTarget({ engine: "sqlite", raw: "./app.db" })).toBe("./app.db");
  });
});
