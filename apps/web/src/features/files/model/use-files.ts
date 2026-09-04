import { useQuery } from "@tanstack/react-query";
import { fetchFileContent, fetchFilesOverview } from "../api/files.js";
import { QUERY_RETRY } from "../../../shared/lib/query/retry.js";
import type { EnabledQueryOptions } from "../../../shared/lib/query/types.js";

export function useFilesOverview(options: EnabledQueryOptions) {
  return useQuery({
    queryKey: ["files"],
    queryFn: fetchFilesOverview,
    enabled: options.enabled,
    ...QUERY_RETRY
  });
}

export function useFileContent(path: string | undefined) {
  return useQuery({
    queryKey: ["file-content", path],
    queryFn: () => fetchFileContent(path as string),
    enabled: Boolean(path),
    ...QUERY_RETRY
  });
}
