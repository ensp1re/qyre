export const QUERY_RETRY = {
  retry: 2,
  retryDelay: (attempt: number) => Math.min(500 * 2 ** attempt, 2000)
} as const;
