/** The session bearer token packages/server's static-web plugin injects into index.html (F122). */
export function getAuthToken(): string | undefined {
  return window.__QYRE_TOKEN__;
}
