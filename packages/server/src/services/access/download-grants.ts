import { randomBytes } from "node:crypto";

/**
 * Single-use, short-lived credentials for streamed downloads (PLAN.md P3).
 *
 * An export is a real browser navigation - it has to be, so the response streams to disk instead of
 * buffering a whole table into a JS Blob - and a navigation cannot carry an `Authorization` header.
 * The session bearer token therefore travelled in the query string, which put a working credential
 * into browser history and into any proxy log on the way. F154 stopped it reaching Qyre's own logs;
 * this stops it being in the URL at all.
 *
 * A grant is worth far less than the session token: it survives one request, expires in a minute,
 * and authorises nothing but the download it was minted for. In-memory by design - grants must not
 * outlive the process any more than the session token does.
 */
const TTL_MS = 60_000;

/** grant id -> expiry timestamp. */
const grants = new Map<string, number>();

function pruneExpired(now: number): void {
  for (const [id, expiresAt] of grants) {
    if (expiresAt <= now) grants.delete(id);
  }
}

/** Mints a grant valid for one download within {@link TTL_MS}. */
export function issueDownloadGrant(): string {
  const now = Date.now();
  // Pruning here rather than on a timer keeps this free of process-lifetime state: the map only
  // grows when downloads are being started, which is exactly when it gets cleaned.
  pruneExpired(now);
  const id = randomBytes(32).toString("hex");
  grants.set(id, now + TTL_MS);
  return id;
}

/**
 * Spends a grant. Returns true only for one that exists and has not expired; either way the id is
 * removed, so a replayed URL never works twice even inside the TTL.
 */
export function consumeDownloadGrant(id: string): boolean {
  const expiresAt = grants.get(id);
  if (expiresAt === undefined) return false;
  grants.delete(id);
  return expiresAt > Date.now();
}
