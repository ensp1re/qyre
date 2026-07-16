import type { ColumnMetadata, DatabaseEngine } from "./index.js";
import { describe, expect, it } from "vitest";
import { filterCapabilityForColumn } from "./filter-capabilities.js";

function column(
  dataType: string,
  nullable = true,
  engine?: DatabaseEngine
): [ColumnMetadata, DatabaseEngine | undefined] {
  return [
    {
      name: "value",
      dataType,
      nullable,
      isPrimaryKey: false,
      isForeignKey: false
    },
    engine
  ];
}

describe("filterCapabilityForColumn", () => {
  it("keeps text operators scalar and omits null checks for non-null columns", () => {
    const [metadata, engine] = column("character varying", false, "postgres");
    expect(filterCapabilityForColumn(metadata, engine).operators).toEqual([
      "contains",
      "eq",
      "neq"
    ]);
  });

  it("does not offer contains for numeric columns", () => {
    const [metadata, engine] = column("bigint", true, "postgres");
    expect(filterCapabilityForColumn(metadata, engine).operators).toEqual([
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "isNull",
      "isNotNull"
    ]);
  });

  it("keeps SQL identifiers such as UUID equality-only", () => {
    const [metadata, engine] = column("uuid", true, "postgres");
    expect(filterCapabilityForColumn(metadata, engine)).toMatchObject({
      kind: "identifier",
      operators: ["eq", "neq", "isNull", "isNotNull"],
      valueInput: "text"
    });
  });

  it("uses native date/time input kinds for temporal columns", () => {
    expect(filterCapabilityForColumn(column("date", true, "mysql")[0], "mysql").valueInput).toBe(
      "date"
    );
    expect(
      filterCapabilityForColumn(column("time without time zone", true, "postgres")[0], "postgres")
        .valueInput
    ).toBe("time");
    expect(
      filterCapabilityForColumn(column("datetime", true, "mysql")[0], "mysql").valueInput
    ).toBe("datetime-local");
  });

  it("treats MongoDB ObjectId as equality-only text input", () => {
    const [metadata, engine] = column("objectId", false, "mongodb");
    expect(filterCapabilityForColumn(metadata, engine)).toMatchObject({
      kind: "objectId",
      operators: ["eq", "neq"],
      valueInput: "text"
    });
  });

  it("does not expose MongoDB MinKey/MaxKey as scalar filter types", () => {
    for (const type of ["minKey", "maxKey"]) {
      const [metadata, engine] = column(type, false, "mongodb");
      expect(filterCapabilityForColumn(metadata, engine)).toMatchObject({
        kind: "structured",
        operators: [],
        valueInput: null
      });
    }
  });

  it("offers plain-text contains for SQL JSON and PostgreSQL arrays", () => {
    const [metadata, engine] = column("jsonb", true, "postgres");
    expect(filterCapabilityForColumn(metadata, engine)).toMatchObject({
      operators: ["contains", "isNull", "isNotNull"],
      valueInput: "text"
    });
    expect(
      filterCapabilityForColumn(column("ARRAY", false, "postgres")[0], "postgres")
    ).toMatchObject({
      operators: ["contains"],
      valueInput: "text"
    });
    expect(filterCapabilityForColumn(column("json", false, "sqlite")[0], "sqlite")).toMatchObject({
      operators: ["contains"],
      valueInput: "text"
    });
  });

  it("keeps native MongoDB containment on its JSON candidate editor", () => {
    const [metadata, engine] = column("object", false, "mongodb");
    expect(filterCapabilityForColumn(metadata, engine)).toMatchObject({
      operators: ["contains"],
      valueInput: "json"
    });
  });
});
