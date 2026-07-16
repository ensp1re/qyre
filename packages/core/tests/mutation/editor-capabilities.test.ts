import { describe, expect, it } from "vitest";
import { mutationEditorCapability } from "../../src/mutation/editor-capabilities.js";

describe("mutationEditorCapability", () => {
  it.each([
    ["postgres", "timestamp without time zone", "timestamp-local", "timestamp"],
    ["postgres", "timestamp with time zone", "timestamp-time-zone", "timestamp"],
    ["postgres", "timestamptz", "timestamp-time-zone", "timestamp"],
    ["mysql", "datetime(6)", "timestamp-local", "timestamp"],
    ["mysql", "timestamp(6)", "timestamp-local", "timestamp"],
    ["sqlite", "TIMESTAMP", "timestamp-local", "timestamp"],
    ["postgres", "time with time zone", "time", "time"],
    ["mysql", "time(6)", "time", "time"]
  ] as const)("provides the exact %s %s editor", (engine, dataType, kind, widget) => {
    expect(mutationEditorCapability(dataType, engine)).toEqual({ kind, editable: true, widget });
  });

  it.each([
    ["postgres", "date", "date", "date"],
    ["mysql", "DATE", "date", "date"],
    ["sqlite", "DATE", "date", "date"],
    ["postgres", "uuid", "identifier", "text"],
    ["postgres", "numeric(20, 4)", "numeric", "decimal"],
    ["mysql", "boolean", "boolean", "boolean"],
    ["sqlite", "TEXT", "text", "multiline"]
  ] as const)("provides the safe %s %s editor", (engine, dataType, kind, widget) => {
    expect(mutationEditorCapability(dataType, engine)).toEqual({
      kind,
      editable: true,
      widget
    });
  });

  it.each([
    ["postgres", "bytea", "binary", "binary"],
    ["mysql", "longblob", "binary", "binary"],
    ["sqlite", "BLOB", "binary", "binary"],
    ["postgres", "bit", "bit-string", "text"],
    ["postgres", "bit varying(16)", "bit-string", "text"],
    ["postgres", "inet", "network", "text"],
    ["postgres", "xml", "xml", "xml"],
    ["postgres", "interval", "interval", "interval"]
  ] as const)("provides the lossless %s %s editor", (engine, dataType, kind, widget) => {
    expect(mutationEditorCapability(dataType, engine)).toEqual({
      kind,
      editable: true,
      widget
    });
  });

  it("uses authoritative enum and set metadata", () => {
    expect(
      mutationEditorCapability("mood", "postgres", { allowedValues: ["happy", "sad"] })
    ).toMatchObject({ kind: "enum", editable: true, widget: "enum" });
    expect(
      mutationEditorCapability("set('a','b')", "mysql", { allowedValues: ["a", "b"] })
    ).toMatchObject({ kind: "set", editable: true, widget: "set" });
  });

  it("fails closed when enum options are missing", () => {
    expect(mutationEditorCapability("enum", "mysql")).toMatchObject({
      kind: "enum",
      editable: false,
      widget: null
    });
  });

  it.each([["geography", "unknown"]] as const)(
    "fails closed for unsupported %s values",
    (dataType, kind) => {
      const capability = mutationEditorCapability(dataType, "postgres");
      expect(capability.kind).toBe(kind);
      expect(capability.editable).toBe(false);
      expect(capability.unavailableReason).toBeTruthy();
    }
  );

  it("does not guess at MySQL BIT decoding without bit-length metadata", () => {
    expect(mutationEditorCapability("bit(8)", "mysql")).toMatchObject({ editable: false });
  });

  it("provides dedicated JSON and PostgreSQL array editors", () => {
    expect(mutationEditorCapability("jsonb", "postgres")).toMatchObject({
      editable: true,
      widget: "json"
    });
    expect(
      mutationEditorCapability("ARRAY", "postgres", { elementDataType: "text" })
    ).toMatchObject({ editable: true, widget: "array" });
    expect(mutationEditorCapability("ARRAY", "sqlite")).toMatchObject({ editable: false });
  });

  it("keeps MongoDB on its whole-document editing surface", () => {
    expect(mutationEditorCapability("objectId", "mongodb")).toMatchObject({
      kind: "object-id",
      editable: false,
      widget: null,
      unavailableReason: expect.stringMatching(/document editor/i)
    });
  });
});
