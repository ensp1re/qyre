import {
  Binary,
  BSON,
  BSONRegExp,
  Code,
  Decimal128,
  Double,
  Int32,
  Long,
  MaxKey,
  ObjectId,
  Timestamp
} from "mongodb";
import { describe, expect, it } from "vitest";
import {
  documentText,
  EXACT_DOCUMENT_READ,
  parseDocumentJson
} from "../../src/write/document-text.js";

function storedDocument(document: Record<string, unknown>): Buffer {
  return Buffer.from(BSON.serialize(document));
}

function readBack(bytes: Buffer): Record<string, unknown> {
  return BSON.deserialize(bytes, EXACT_DOCUMENT_READ) as Record<string, unknown>;
}

describe("MongoDB document editor text", () => {
  const stored = storedDocument({
    _id: new ObjectId("507f1f77bcf86cd799439011"),
    maxLong: Long.fromString("9223372036854775807"),
    smallLong: Long.fromNumber(5),
    integralDouble: new Double(1),
    bigIntegralDouble: new Double(3e9),
    negativeZero: new Double(-0),
    fraction: new Double(2.5),
    int: new Int32(7),
    decimal: Decimal128.fromString("0.1"),
    at: new Date("2024-01-01T10:00:00.000Z"),
    bytes: new Binary(Buffer.from([0, 255]), 0x80),
    pattern: new BSONRegExp("^a", "ix"),
    ts: Timestamp.fromBits(1, 2),
    code: new Code("return x", { x: Long.fromNumber(1) }),
    max: new MaxKey(),
    nested: { list: [Long.fromNumber(1), new Double(2), new Int32(3)], name: "n" }
  });

  it("renders values relaxed JSON cannot represent exactly in canonical form", () => {
    const text = documentText(readBack(stored));
    expect(text).toContain('"maxLong":{"$numberLong":"9223372036854775807"}');
    expect(text).toContain('"smallLong":{"$numberLong":"5"}');
    expect(text).toContain('"integralDouble":{"$numberDouble":"1.0"}');
    expect(text).toContain('"fraction":2.5');
    expect(text).toContain('"int":7');
    expect(text).toContain('"at":{"$date":"2024-01-01T10:00:00Z"}');
  });

  it("round-trips untouched values to identical BSON", () => {
    const parsed = parseDocumentJson(JSON.parse(documentText(readBack(stored))));
    expect(storedDocument(parsed).equals(stored)).toBe(true);
  });

  it("produces equal text for an unchanged document so the optimistic check still matches", () => {
    const text = documentText(readBack(stored));
    expect(documentText(parseDocumentJson(JSON.parse(text)))).toBe(text);
  });

  it("rejects malformed Extended JSON with 400", () => {
    expect(() => parseDocumentJson({ _id: { $oid: "zz" } })).toThrow(
      expect.objectContaining({ statusCode: 400 })
    );
  });
});
