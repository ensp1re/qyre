import { randomBytes } from "node:crypto";

const TTL_MS = 60_000;

const grants = new Map<string, number>();

function pruneExpired(now: number): void {
  for (const [id, expiresAt] of grants) {
    if (expiresAt <= now) grants.delete(id);
  }
}

export function issueDownloadGrant(): string {
  const now = Date.now();
  pruneExpired(now);
  const id = randomBytes(32).toString("hex");
  grants.set(id, now + TTL_MS);
  return id;
}

export function consumeDownloadGrant(id: string): boolean {
  const expiresAt = grants.get(id);
  if (expiresAt === undefined) return false;
  grants.delete(id);
  return expiresAt > Date.now();
}
