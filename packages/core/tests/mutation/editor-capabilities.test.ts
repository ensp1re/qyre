import { describe, expect, it } from "vitest";
import { mutationEditorCapability } from "../../src/mutation/editor-capabilities.js";

describe("mutationEditorCapability", () => {
  it.each([
    ["postgres", "timestamp without time zone", "timestamp-local"],
    ["postgres", "timestamp with time zone", "timestamp-time-zone"],
    ["postgres", "timestamptz", "timestamp-time-zone"],
    ["mysql", "datetime(6)", "timestamp-local"],
    ["mysql", "timestamp(6)", "timestamp-local"],
    ["sqlite", "TIMESTAMP", "timestamp-local"],
    ["postgres", "time with time zone", "time"],
    ["mysql", "time(6)", "time"]
  ] as const)("fails closed for %s %s", (engine, dataType, kind) => {
    expect(mutationEditorCapability(dataType, engine)).toEqual({
      kind,
      editable: false,
      widget: null,
      unavailableReason: expect.stringMatching(/seconds.*precision.*timezone/i)
    });
  });

  it.each([
    ["postgres", "date", "date", "date"],
    ["mysql", "DATE", "date", "date"],
    ["sqlite", "DATE", "date", "date"],
    ["postgres", "uuid", "identifier", "text"],
    ["postgres", "numeric(20, 4)", "numeric", "number"],
    ["mysql", "boolean", "boolean", "boolean"],
    ["sqlite", "TEXT", "text", "text"],
    ["mysql", "enum('draft','live')", "enum", "text"],
    ["mysql", "set('a','b')", "set", "text"]
  ] as const)("provides the safe %s %s editor", (engine, dataType, kind, widget) => {
    expect(mutationEditorCapability(dataType, engine)).toEqual({
      kind,
      editable: true,
      widget
    });
  });

  it.each([
    ["jsonb", "structured"],
    ["text[]", "structured"],
    ["bytea", "binary"],
    ["geography", "unknown"]
  ] as const)("fails closed for unsupported %s values", (dataType, kind) => {
    const capability = mutationEditorCapability(dataType, "postgres");
    expect(capability.kind).toBe(kind);
    expect(capability.editable).toBe(false);
    expect(capability.unavailableReason).toBeTruthy();
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
