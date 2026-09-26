// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useGraphPositions } from "../../../../src/features/schema/model/use-graph-positions.js";

function seed(databaseKey: string, positions: Record<string, { x: number; y: number }>): void {
  localStorage.setItem(
    `qyre-schema-graph-positions:${databaseKey}`,
    JSON.stringify({ version: 1, value: positions })
  );
}

function stored(databaseKey: string): unknown {
  const raw = localStorage.getItem(`qyre-schema-graph-positions:${databaseKey}`);
  return raw ? (JSON.parse(raw) as { value: unknown }).value : undefined;
}

describe("useGraphPositions", () => {
  beforeEach(() => localStorage.clear());

  it("re-reads saved positions when the database key changes", () => {
    seed("db-a", { "public.users": { x: 1, y: 2 } });
    seed("db-b", { "public.orders": { x: 3, y: 4 } });
    const { result, rerender } = renderHook(({ key }) => useGraphPositions(key), {
      initialProps: { key: "db-a" }
    });
    expect(result.current.positions).toEqual({ "public.users": { x: 1, y: 2 } });

    rerender({ key: "db-b" });
    expect(result.current.positions).toEqual({ "public.orders": { x: 3, y: 4 } });
  });

  it("does not merge the previous database's positions into the new database's storage", () => {
    seed("db-a", { "public.users": { x: 1, y: 2 } });
    const { result, rerender } = renderHook(({ key }) => useGraphPositions(key), {
      initialProps: { key: "db-a" }
    });

    rerender({ key: "db-b" });
    act(() => result.current.savePositions({ "public.orders": { x: 5, y: 6 } }));

    expect(stored("db-b")).toEqual({ "public.orders": { x: 5, y: 6 } });
    expect(stored("db-a")).toEqual({ "public.users": { x: 1, y: 2 } });
  });
});
