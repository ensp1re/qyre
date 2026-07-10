import type { DatabaseOverview } from "@qyre/core";
import { fetchJson } from "../../../shared/api/fetch-json.js";

/** Fetch the database overview (schemas/capabilities). Only `capabilities` is read here - see
 * `use-capabilities.ts`. Shares `GET /api/overview` with `features/schema`'s `fetchOverview`
 * rather than importing it (features may not import other features - `apps/web/STRUCTURE.md`);
 * both hooks use the same React Query `queryKey` so this doesn't cost a duplicate network fetch. */
export function fetchOverviewForCapabilities(): Promise<DatabaseOverview> {
  return fetchJson<DatabaseOverview>("/api/overview");
}
