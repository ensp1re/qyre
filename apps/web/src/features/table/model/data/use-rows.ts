import type { RowFilter, RowPage, RowSort } from "@qyre/core";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { fetchRows } from "../../api/rows.js";
import { QUERY_RETRY } from "../../../../shared/lib/query/retry.js";
import { cancelOperation } from "../../../../shared/api/operations.js";

interface RowsResult {
  rowPage: RowPage;
  hasMore: boolean;
}

const UI_PAGE_SIZE = 25;

export function useRows(
  schema: string | undefined,
  table: string | undefined,
  page: number,
  sort?: RowSort,
  filters?: RowFilter[],
  search?: string
) {
  const operationIdRef = useRef<string | undefined>(undefined);
  const query = useQuery({
    queryKey: ["rows", schema, table, page, sort?.column, sort?.direction, filters, search],
    queryFn: async (): Promise<RowsResult> => {
      const operationId = crypto.randomUUID();
      operationIdRef.current = operationId;
      const rowPage = await fetchRows(
        schema as string,
        table as string,
        page,
        UI_PAGE_SIZE,
        sort,
        filters,
        search,
        operationId
      );
      const hasMore =
        rowPage.total !== undefined
          ? (page + 1) * UI_PAGE_SIZE < rowPage.total
          : (
              await fetchRows(
                schema as string,
                table as string,
                (page + 1) * UI_PAGE_SIZE,
                1,
                sort,
                filters,
                search
              )
            ).rows.length > 0;
      operationIdRef.current = undefined;
      return { rowPage, hasMore };
    },
    enabled: Boolean(schema && table),
    ...QUERY_RETRY,
    placeholderData: (previousData, previousQuery) => {
      const previousKey = previousQuery?.queryKey as
        [string, string, string, ...unknown[]] | undefined;
      return previousKey?.[1] === schema && previousKey?.[2] === table ? previousData : undefined;
    }
  });
  return {
    ...query,
    cancel: () => {
      const operationId = operationIdRef.current;
      if (operationId) void cancelOperation(operationId);
    }
  };
}
