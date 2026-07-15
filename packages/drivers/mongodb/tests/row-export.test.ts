import { ObjectId } from "mongodb";
import { describe, expect, it } from "vitest";
import { serializeJsonRow } from "../src/query/row-export.js";

describe("MongoDB row export", () => {
  it("serializes raw BSON values as relaxed Extended JSON", () => {
    expect(
      serializeJsonRow({
        _id: new ObjectId("507f1f77bcf86cd799439011"),
        createdAt: new Date("2026-07-13T12:00:00.000Z")
      })
    ).toBe(
      '{"_id":{"$oid":"507f1f77bcf86cd799439011"},"createdAt":{"$date":"2026-07-13T12:00:00Z"}}'
    );
  });
});
