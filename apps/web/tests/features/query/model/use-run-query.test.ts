import { describe, expect, it, vi } from "vitest";
import { refreshQueriesAfterSqlWrite } from "../../../../src/features/query/model/use-run-query.js";

describe("refreshQueriesAfterSqlWrite", () => {
  it.each(["mutation", "ddl", "destructive"] as const)(
    "invalidates catalog and row caches after a successful %s statement",
    async (classification) => {
      const invalidateQueries = vi.fn(async (_filters: { queryKey: string[] }) => undefined);

      await refreshQueriesAfterSqlWrite({ invalidateQueries } as never, classification);

      expect(invalidateQueries.mock.calls.map(([filters]) => filters)).toEqual([
        { queryKey: ["overview"] },
        { queryKey: ["allTables"] },
        { queryKey: ["table"] },
        { queryKey: ["rows"] }
      ]);
    }
  );

  it.each([undefined, "read"] as const)(
    "keeps caches untouched after classification %s",
    async (classification) => {
      const invalidateQueries = vi.fn();
      await refreshQueriesAfterSqlWrite({ invalidateQueries } as never, classification);
      expect(invalidateQueries).not.toHaveBeenCalled();
    }
  );
});
