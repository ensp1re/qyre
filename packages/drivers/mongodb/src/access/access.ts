import {
  MAX_ACCESS_GRANTS,
  MAX_ACCESS_ROLES,
  type AccessOverview,
  type AccessRole
} from "@qyre/core";
import type { MongoClient } from "mongodb";
import { fetchConnectionStatus } from "./permissions.js";

function resourceLabel(resource: {
  db?: string;
  collection?: string;
  anyResource?: boolean;
  cluster?: boolean;
}): string {
  if (resource.anyResource) return "all resources";
  if (resource.cluster) return "cluster";
  return `${resource.db || "*"}.${resource.collection || "*"}`;
}

export async function inspectAccess(client: MongoClient): Promise<AccessOverview> {
  const status = await fetchConnectionStatus(client);
  const users = status.authInfo.authenticatedUsers;
  const identity = users.length
    ? users.map(({ user, db }) => `${user}@${db}`).join(", ")
    : "Unauthenticated local connection";
  const notices: string[] = [];
  const roles: AccessRole[] = [];

  for (const user of users) {
    try {
      const result = (await client.db(user.db).command({
        usersInfo: { user: user.user, db: user.db },
        showCredentials: false,
        showPrivileges: false
      })) as { users?: Array<{ roles?: Array<{ role: string; db: string }> }> };
      for (const role of result.users?.[0]?.roles ?? []) {
        if (roles.length < MAX_ACCESS_ROLES) {
          let attributes = ["assigned role"];
          try {
            const roleResult = (await client.db(role.db).command({
              rolesInfo: { role: role.role, db: role.db },
              showPrivileges: false,
              showBuiltinRoles: false
            })) as { roles?: Array<{ inheritedRoles?: Array<{ role: string; db: string }> }> };
            attributes = attributes.concat(
              (roleResult.roles?.[0]?.inheritedRoles ?? []).map(
                (inherited) => `inherits ${inherited.role}@${inherited.db}`
              )
            );
          } catch {
            const notice = "Inherited role details are restricted for one or more roles.";
            if (!notices.includes(notice)) notices.push(notice);
          }
          roles.push({
            name: `${role.role}@${role.db}`,
            isCurrent: true,
            attributes
          });
        } else if (!notices.includes("Roles were truncated to 500 entries.")) {
          notices.push("Roles were truncated to 500 entries.");
        }
      }
    } catch {
      const notice = "Role details are restricted for one or more identities.";
      if (!notices.includes(notice)) notices.push(notice);
    }
  }

  const privilegeLines = (status.authInfo.authenticatedUserPrivileges ?? []).map(
    (privilege) => `${privilege.actions.join(", ")} on ${resourceLabel(privilege.resource)}`
  );
  if (privilegeLines.length > MAX_ACCESS_GRANTS)
    notices.push("Grants were truncated to 1000 entries.");
  return {
    identity,
    roles: roles.sort((left, right) => left.name.localeCompare(right.name)),
    grants: privilegeLines.sort().slice(0, MAX_ACCESS_GRANTS),
    facts: [
      { label: "Authentication", value: users.length ? "Authenticated" : "No authenticated user" }
    ],
    notices
  };
}
