export interface DocumentLoad {
  signal: AbortSignal;
  isCurrent: () => boolean;
}

/** Owns the document editor's one active load. Starting or cancelling a load invalidates every
 * older completion so stale text, errors, and loading state cannot overwrite the current drawer. */
export function createDocumentLoadCoordinator(): {
  begin: () => DocumentLoad;
  cancel: () => void;
} {
  let current: AbortController | undefined;

  return {
    begin: () => {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      return {
        signal: controller.signal,
        isCurrent: () => current === controller && !controller.signal.aborted
      };
    },
    cancel: () => {
      current?.abort();
      current = undefined;
    }
  };
}
