/**
 * Shared bounded-retry policy for the query hooks that hit the Qyre server (F041). `retry: false`
 * meant a single transient blip (a momentary connection hiccup, not a real failure) immediately
 * surfaced as a user-visible error panel needing a manual Retry click. Two retries with a short
 * backoff absorb that without masking a genuine, persistent failure for long.
 */
export const QUERY_RETRY = {
  retry: 2,
  retryDelay: (attempt: number) => Math.min(500 * 2 ** attempt, 2000)
} as const;
