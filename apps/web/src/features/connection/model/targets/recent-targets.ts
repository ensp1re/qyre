import type { RecentTarget } from "@qyre/ui";

// Match by substring so compound credential keys are rejected.
const SENSITIVE_PARAMETER = /pass(?:word)?|pwd|token|secret|api[-_]?key|credential/i;

export function parseRecentTargets(value: unknown): RecentTarget[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter(
    (entry): entry is RecentTarget =>
      typeof entry === "object" &&
      entry !== null &&
      "raw" in entry &&
      typeof entry.raw === "string" &&
      "display" in entry &&
      typeof entry.display === "string"
  );
  return entries.filter((entry) => canPersistTarget(entry.raw)).slice(0, 5);
}

export function canPersistTarget(raw: string): boolean {
  if (!raw.includes("://")) return true;

  try {
    const target = new URL(raw);
    if (target.username || target.password) return false;
    for (const key of target.searchParams.keys()) {
      if (SENSITIVE_PARAMETER.test(key)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function nextRecentTargets(
  current: readonly RecentTarget[],
  entry: RecentTarget
): RecentTarget[] {
  return [entry, ...current.filter((candidate) => candidate.raw !== entry.raw)].slice(0, 5);
}
