import type { ConnectionCapabilities, TablePermissions } from "@qyre/core";
import type { MongoClient } from "mongodb";
import { isSystemCollection, SYSTEM_DATABASES } from "./catalog.js";

export const READ_ONLY_TABLE_PERMISSIONS: TablePermissions = {
  select: true,
  insert: false,
  update: false,
  delete: false
};

interface PrivilegeResource {
  db?: string;
  collection?: string;
  anyResource?: boolean;
  cluster?: boolean;
}

interface Privilege {
  resource: PrivilegeResource;
  actions: string[];
}

/** The subset of `db.runCommand({ connectionStatus: 1, showPrivileges: true })`'s response shape
 * this module reads. */
export interface ConnectionStatusResult {
  authInfo: {
    authenticatedUsers: Array<{ user: string; db: string }>;
    authenticatedUserPrivileges?: Privilege[];
  };
}

const FULL_ACCESS_CAPABILITIES: ConnectionCapabilities = {
  supportsSql: false,
  supportsRowMutations: true,
  supportsDdl: true,
  supportsIndexManagement: true,
  supportsDatabaseManagement: false,
  supportsTransactions: false,
  readOnlyReason: null
};

const FULL_ACCESS_TABLE_PERMISSIONS: TablePermissions = {
  select: true,
  insert: true,
  update: true,
  delete: true
};

/** A resource pattern (exact db+collection, a db-wide or cross-db wildcard `""`, or `anyResource`)
 * matches the given database/collection - see MongoDB's resource-document reference. */
function resourceApplies(
  resource: PrivilegeResource,
  dbName: string,
  collectionName: string
): boolean {
  if (resource.anyResource) return true;
  if (resource.db === undefined || resource.collection === undefined) return false;
  const dbMatches = resource.db === "" || resource.db === dbName;
  const collectionMatches = resource.collection === "" || resource.collection === collectionName;
  return dbMatches && collectionMatches;
}

function actionsFor(privileges: Privilege[], dbName: string, collectionName: string): Set<string> {
  const actions = new Set<string>();
  for (const privilege of privileges) {
    if (resourceApplies(privilege.resource, dbName, collectionName)) {
      for (const action of privilege.actions) actions.add(action);
    }
  }
  return actions;
}

function isNonSystemResource(resource: PrivilegeResource): boolean {
  if (resource.anyResource) return true;
  if (resource.db !== undefined && resource.db !== "" && SYSTEM_DATABASES.has(resource.db)) {
    return false;
  }
  if (resource.collection !== undefined && isSystemCollection(resource.collection)) return false;
  return true;
}

function anyNonSystemResourceGrants(privileges: Privilege[], actionNames: string[]): boolean {
  return privileges.some(
    (privilege) =>
      isNonSystemResource(privilege.resource) &&
      privilege.actions.some((action) => actionNames.includes(action))
  );
}

const ROW_MUTATION_ACTIONS = ["insert", "update", "remove"];
const DDL_ACTIONS = ["createCollection", "dropCollection"];
const INDEX_ACTIONS = ["createIndex", "dropIndex"];

function capabilitiesFromPrivileges(privileges: Privilege[]): ConnectionCapabilities {
  const supportsRowMutations = anyNonSystemResourceGrants(privileges, ROW_MUTATION_ACTIONS);
  const supportsDdl = anyNonSystemResourceGrants(privileges, DDL_ACTIONS);
  const supportsIndexManagement = anyNonSystemResourceGrants(privileges, INDEX_ACTIONS);
  const canWrite = supportsRowMutations || supportsDdl || supportsIndexManagement;

  return {
    supportsSql: false,
    supportsRowMutations,
    supportsDdl,
    supportsIndexManagement,
    // MongoDB has no explicit "create database" privilege (databases come into existence
    // implicitly on first write) and only a loose "dropDatabase" action with no matching create
    // counterpart to pair it with - not modeled by this slice, same as SQLite's always-false.
    supportsDatabaseManagement: false,
    // Real multi-document transactions additionally require replica-set topology, not privileges
    // alone (a standalone mongod - Qyre's common local-dev target - can't run them regardless of
    // grants) - topology detection is out of scope for a permission-introspection slice.
    supportsTransactions: false,
    readOnlyReason: canWrite ? null : "grants"
  };
}

/** An unauthenticated connection has no access control applied at all - mongod's own default
 * behavior when authorization isn't enabled, matching a real unrestricted local connection. */
function isUnauthenticated(status: ConnectionStatusResult): boolean {
  return status.authInfo.authenticatedUsers.length === 0;
}

export function capabilitiesFromConnectionStatus(
  status: ConnectionStatusResult
): ConnectionCapabilities {
  if (isUnauthenticated(status)) return FULL_ACCESS_CAPABILITIES;
  return capabilitiesFromPrivileges(status.authInfo.authenticatedUserPrivileges ?? []);
}

export function tablePermissionsFromConnectionStatus(
  status: ConnectionStatusResult,
  dbName: string,
  collectionName: string
): TablePermissions {
  if (isUnauthenticated(status)) return FULL_ACCESS_TABLE_PERMISSIONS;
  const actions = actionsFor(
    status.authInfo.authenticatedUserPrivileges ?? [],
    dbName,
    collectionName
  );
  return {
    select: actions.has("find"),
    insert: actions.has("insert"),
    update: actions.has("update"),
    delete: actions.has("remove")
  };
}

export async function fetchConnectionStatus(client: MongoClient): Promise<ConnectionStatusResult> {
  return client
    .db()
    .command({ connectionStatus: 1, showPrivileges: true }) as Promise<ConnectionStatusResult>;
}

export async function fetchConnectionCapabilities(
  client: MongoClient
): Promise<ConnectionCapabilities> {
  return capabilitiesFromConnectionStatus(await fetchConnectionStatus(client));
}

export async function fetchTablePermissions(
  client: MongoClient,
  dbName: string,
  collectionName: string
): Promise<TablePermissions> {
  return tablePermissionsFromConnectionStatus(
    await fetchConnectionStatus(client),
    dbName,
    collectionName
  );
}
