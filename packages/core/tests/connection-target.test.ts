import { describe, expect, it } from "vitest";
import { withDatabase } from "../src/connection-target.js";

function searchParam(raw: string, name: string): string | null {
  return new URL(raw).searchParams.get(name);
}

describe("withDatabase", () => {
  it("replaces the database path while preserving credentials and options", () => {
    const next = withDatabase("postgres://user:pw@localhost:5432/app?sslmode=require", "other");
    expect(next).toBe("postgres://user:pw@localhost:5432/other?sslmode=require");
  });

  it("keeps MongoDB authenticating against the original default auth database", () => {
    expect(searchParam(withDatabase("mongodb://root:pw@host:27017/", "app"), "authSource")).toBe(
      "admin"
    );
    expect(searchParam(withDatabase("mongodb://root:pw@host:27017", "app"), "authSource")).toBe(
      "admin"
    );
    const fromDatabase = withDatabase("mongodb://root:pw@host:27017/users?tls=true", "app");
    expect(new URL(fromDatabase).pathname).toBe("/app");
    expect(searchParam(fromDatabase, "authSource")).toBe("users");
    expect(searchParam(fromDatabase, "tls")).toBe("true");
  });

  it("leaves MongoDB URIs without credentials or with explicit auth settings unchanged", () => {
    expect(searchParam(withDatabase("mongodb://host:27017/", "app"), "authSource")).toBeNull();
    expect(
      searchParam(withDatabase("mongodb://root:pw@host:27017/?authSource=ops", "app"), "authSource")
    ).toBe("ops");
    expect(
      searchParam(
        withDatabase("mongodb://root@host:27017/?authMechanism=MONGODB-X509", "app"),
        "authSource"
      )
    ).toBeNull();
    expect(
      searchParam(withDatabase("mongodb+srv://root:pw@cluster.example.net/", "app"), "authSource")
    ).toBeNull();
  });
});
