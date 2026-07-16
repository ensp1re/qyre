import { describe, expect, it } from "vitest";
import { mutationEditorCapability } from "../../src/mutation/editor-capabilities.js";
import {
  isExactDateText,
  isExactNumericText,
  isExactTimeText,
  isExactTimestampText,
  mutationValueText,
  parseMutationDraft,
  validateMutationValue
} from "../../src/mutation/editor-values.js";

describe("mutation editor exact values", () => {
  it.each(["9007199254740993", "-0.000000000000000001", "1.2300", "6.02e23"])(
    "preserves exact numeric text %s",
    (value) => {
      expect(isExactNumericText(value)).toBe(true);
      expect(
        parseMutationDraft(value, mutationEditorCapability("numeric", "postgres"), "postgres")
      ).toEqual({ valid: true, value });
    }
  );

  it.each(["NaN", "Infinity", "1,000", "1.2.3", ""])("rejects invalid number %s", (value) => {
    expect(isExactNumericText(value)).toBe(false);
  });

  it("validates calendar dates without normalizing them", () => {
    expect(isExactDateText("2024-02-29")).toBe(true);
    expect(isExactDateText("2023-02-29")).toBe(false);
  });

  it("preserves PostgreSQL seconds, fractions, and offsets", () => {
    expect(isExactTimeText("01:30:45.123456-04:00", "postgres")).toBe(true);
    expect(isExactTimeText("01:30:45.123456+02", "postgres")).toBe(true);
    expect(isExactTimestampText("2024-11-03 01:30:45.123456-04:00", "timestamp-time-zone")).toBe(
      true
    );
    expect(isExactTimestampText("2024-11-03 01:30:45.123456", "timestamp-time-zone")).toBe(false);
  });

  it("accepts MySQL signed TIME durations without treating them as a clock", () => {
    expect(isExactTimeText("-838:59:59.999999", "mysql")).toBe(true);
    expect(isExactTimeText("839:00:00", "mysql")).toBe(false);
  });

  it("reports JSON error location and requires arrays for native array editors", () => {
    const json = parseMutationDraft(
      '{\n  "a": 1,\n}',
      mutationEditorCapability("jsonb", "postgres")
    );
    expect(json).toMatchObject({ valid: false, error: expect.stringMatching(/line 3/i) });

    const arrayCapability = mutationEditorCapability("ARRAY", "postgres", {
      elementDataType: "text"
    });
    expect(parseMutationDraft('["a","b"]', arrayCapability)).toEqual({
      valid: true,
      value: ["a", "b"]
    });
    expect(parseMutationDraft('{"a":1}', arrayCapability)).toMatchObject({ valid: false });
  });

  it("validates enum and set members against metadata", () => {
    const metadata = { allowedValues: ["draft", "live"] };
    const enumCapability = mutationEditorCapability("enum", "mysql", metadata);
    expect(validateMutationValue(enumCapability, "live", "mysql", metadata)).toMatchObject({
      valid: true
    });
    expect(validateMutationValue(enumCapability, "other", "mysql", metadata)).toMatchObject({
      valid: false
    });

    const setCapability = mutationEditorCapability("set('draft','live')", "mysql", metadata);
    expect(
      validateMutationValue(setCapability, ["draft", "live"], "mysql", metadata)
    ).toMatchObject({
      valid: true
    });
  });

  it("round-trips binary wire values through canonical hexadecimal text", () => {
    const capability = mutationEditorCapability("bytea", "postgres");
    expect(mutationValueText({ type: "Buffer", data: [0, 15, 255] }, capability)).toBe("000fff");
    expect(parseMutationDraft("\\xCAFE", capability, "postgres")).toEqual({
      valid: true,
      value: "cafe"
    });
    expect(parseMutationDraft("0x00 ca fe ff", capability, "postgres")).toEqual({
      valid: true,
      value: "00cafeff"
    });
    expect(parseMutationDraft("abc", capability, "postgres")).toMatchObject({
      valid: false,
      error: expect.stringMatching(/even number/i)
    });
  });

  it("validates MongoDB ObjectId values for insert drafts", () => {
    const capability = mutationEditorCapability("objectId", "mongodb");
    expect(parseMutationDraft("507F1F77BCF86CD799439011", capability, "mongodb")).toEqual({
      valid: true,
      value: "507f1f77bcf86cd799439011"
    });
    expect(parseMutationDraft("not-an-object-id", capability, "mongodb")).toMatchObject({
      valid: false
    });
  });

  it.each([
    ["regex", '{"pattern":"^qyre","options":"im"}', { pattern: "^qyre", options: "im" }],
    ["timestamp", '{"t":1700000000,"i":5}', { t: 1700000000, i: 5 }],
    ["code", '{"code":"return x;","scope":{"x":1}}', { code: "return x;", scope: { x: 1 } }],
    ["minKey", '{"$minKey":1}', { $minKey: 1 }],
    ["maxKey", '{"$maxKey":1}', { $maxKey: 1 }]
  ] as const)("validates MongoDB %s JSON editor values", (dataType, draft, value) => {
    const capability = mutationEditorCapability(dataType, "mongodb");
    expect(parseMutationDraft(draft, capability, "mongodb")).toEqual({ valid: true, value });
  });

  it.each([
    ["regex", '{"pattern":"x","options":"gg"}'],
    ["timestamp", '{"t":-1,"i":0}'],
    ["code", '{"code":1}'],
    ["minKey", '{"$minKey":0}'],
    ["maxKey", '{"$maxKey":2}']
  ] as const)("rejects invalid MongoDB %s JSON editor values", (dataType, draft) => {
    expect(
      parseMutationDraft(draft, mutationEditorCapability(dataType, "mongodb"), "mongodb")
    ).toMatchObject({ valid: false });
  });

  it.each([
    ["regex", { pattern: "", options: "" }],
    ["timestamp", { t: 0, i: 0 }],
    ["code", { code: "", scope: {} }],
    ["minKey", { $minKey: 1 }],
    ["maxKey", { $maxKey: 1 }]
  ] as const)("provides a valid MongoDB %s template for Add row", (dataType, template) => {
    const capability = mutationEditorCapability(dataType, "mongodb");
    expect(JSON.parse(mutationValueText(undefined, capability))).toEqual(template);
    expect(
      parseMutationDraft(mutationValueText(undefined, capability), capability, "mongodb")
    ).toMatchObject({ valid: true });
  });

  it("preserves PostgreSQL interval text for native validation", () => {
    const capability = mutationEditorCapability("interval", "postgres");
    expect(
      mutationValueText(
        { days: 5, hours: 10, minutes: 15, seconds: 20, milliseconds: 250 },
        capability
      )
    ).toBe("5 days 10 hours 15 minutes 20.25 seconds");
    expect(parseMutationDraft("1 year 2 mons 03:04:05.678", capability, "postgres")).toEqual({
      valid: true,
      value: "1 year 2 mons 03:04:05.678"
    });
    expect(parseMutationDraft("", capability, "postgres")).toMatchObject({ valid: false });
  });

  it("validates PostgreSQL bit strings without numeric coercion", () => {
    const capability = mutationEditorCapability("bit varying", "postgres");
    expect(parseMutationDraft("00101", capability, "postgres")).toEqual({
      valid: true,
      value: "00101"
    });
    expect(parseMutationDraft("102", capability, "postgres")).toMatchObject({ valid: false });
  });

  it("preserves PostgreSQL network and XML text exactly", () => {
    const inet = "2001:db8::1/64";
    const xml = "<root>\n  <value>one</value>\n</root>";
    expect(
      parseMutationDraft(inet, mutationEditorCapability("inet", "postgres"), "postgres")
    ).toEqual({ valid: true, value: inet });
    expect(
      parseMutationDraft(xml, mutationEditorCapability("xml", "postgres"), "postgres")
    ).toEqual({ valid: true, value: xml });
  });
});
