import { randomBytes } from "node:crypto";

const TTL_MS = 60_000;

export const TABLE_EXPORT_ROUTE = "/api/tables/:schema/:table/export.:format";

/** The one table export a grant may download. */
export interface DownloadGrantTarget {
  readonly schema: string;
  readonly table: string;
  readonly format: string;
}

interface DownloadGrant {
  readonly expiresAt: number;
  readonly target: DownloadGrantTarget;
}

const grants = new Map<string, DownloadGrant>();

function pruneExpired(now: number): void {
  for (const [id, grant] of grants) {
    if (grant.expiresAt <= now) grants.delete(id);
  }
}

export function issueDownloadGrant(target: DownloadGrantTarget): string {
  const now = Date.now();
  pruneExpired(now);
  const id = randomBytes(32).toString("hex");
  grants.set(id, { expiresAt: now + TTL_MS, target });
  return id;
}

/** Spend a grant on the export it was issued for; any presentation burns it. */
export function consumeDownloadGrant(id: string, requested: DownloadGrantTarget): boolean {
  const grant = grants.get(id);
  if (grant === undefined) return false;
  grants.delete(id);
  return (
    grant.expiresAt > Date.now() &&
    grant.target.schema === requested.schema &&
    grant.target.table === requested.table &&
    grant.target.format === requested.format
  );
}
