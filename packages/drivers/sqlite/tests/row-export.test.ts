import { describe, expect, it } from "vitest";
import { formatSqlInsert } from "../src/query/row-export.js";

describe("SQLite row export", () => {
  it("quotes identifiers and preserves structured and binary values as literals", () => {
    expect(
      formatSqlInsert('odd"table', ["name", "metadata", "payload"], {
        name: "O'Reilly",
        metadata: { active: true },
        payload: Buffer.from([0, 255])
      })
    ).toBe(
      `INSERT INTO "odd""table" ("name", "metadata", "payload") VALUES ('O''Reilly', '{"active":true}', X'00ff');`
    );
  });
});
