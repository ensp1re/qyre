import { describe, expect, it } from "vitest";
import { redactSensitiveQueryParams } from "../../src/services/log-redaction.js";

describe("redactSensitiveQueryParams (F130)", () => {
  it("masks a token query param", () => {
    expect(redactSensitiveQueryParams("/api/tables/public/x/export.csv?token=super-secret")).toBe(
      "/api/tables/public/x/export.csv?token=%5Bredacted%5D"
    );
  });

  it("leaves the rest of the query string untouched", () => {
    const redacted = redactSensitiveQueryParams(
      "/api/tables/public/x/export.csv?sortColumn=id&token=abc123"
    );
    expect(redacted).toContain("sortColumn=id");
    expect(redacted).not.toContain("abc123");
  });

  it("returns the url unchanged when there is no token param", () => {
    const url = "/api/health?other=1";
    expect(redactSensitiveQueryParams(url)).toBe(url);
  });

  it("returns the url unchanged for a plain path with no query string", () => {
    expect(redactSensitiveQueryParams("/api/health")).toBe("/api/health");
  });

  it("never throws on a url that fails to parse, returning it unchanged", () => {
    expect(redactSensitiveQueryParams("http://[bad")).toBe("http://[bad");
  });
});
