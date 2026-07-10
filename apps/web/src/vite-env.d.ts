/// <reference types="vite/client" />

interface Window {
  /** Session bearer token injected into index.html by packages/server's static-web plugin (F122) -
   * absent only if the page was somehow loaded outside a Qyre-served response. */
  __QYRE_TOKEN__?: string;
}
