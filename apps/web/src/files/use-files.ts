import { useQuery } from "@tanstack/react-query";
import { fetchFileContent, fetchFilesOverview } from "./api/files.js";
import { QUERY_RETRY } from "../shared/query/query-retry.js";

/** React Query hook for the Files tab's tree of `.sql` files. */
export function useFilesOverview(options: { enabled: boolean }) {
  return useQuery({
    queryKey: ["files"],
    queryFn: fetchFilesOverview,
    enabled: options.enabled,
    ...QUERY_RETRY
  });
}

/** React Query hook for a single selected file's content. */
export function useFileContent(path: string | undefined) {
  return useQuery({
    queryKey: ["file-content", path],
    queryFn: () => fetchFileContent(path as string),
    enabled: Boolean(path),
    ...QUERY_RETRY
  });
}
