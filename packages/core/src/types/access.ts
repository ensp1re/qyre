/** A database role visible to the connected identity. */
export interface AccessRole {
  readonly name: string;
  readonly isCurrent: boolean;
  readonly attributes: readonly string[];
}

/** One engine-specific, non-secret access fact. */
export interface AccessFact {
  readonly label: string;
  readonly value: string;
}

/** Read-only, secret-safe access summary for the current connection (F119). */
export interface AccessOverview {
  readonly identity: string;
  readonly roles: readonly AccessRole[];
  readonly grants: readonly string[];
  readonly facts: readonly AccessFact[];
  readonly notices: readonly string[];
}

export const MAX_ACCESS_ROLES = 500;
export const MAX_ACCESS_GRANTS = 1000;
