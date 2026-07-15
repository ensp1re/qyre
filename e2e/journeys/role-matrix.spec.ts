import { randomUUID } from "node:crypto";
import {
  FIXTURE,
  requireTestDatabaseUrl,
  requireTestMongoUrl,
  requireTestMysqlUrl,
  requireTestSqlitePath,
  setupFixture,
  setupMongoFixture,
  setupMysqlFixture,
  setupSqliteFixture
} from "@qyre/testing";
import { expect, test } from "../support/test.js";

const READ_ONLY_PROJECTS = new Set([
  "readonly",
  "postgres-restricted",
  "mysql-restricted",
  "sqlite-restricted",
  "mongodb-readonly"
]);
const WRITABLE_PROJECTS = new Set(["postgres", "mysql", "sqlite", "mongodb"]);

const WRITE_CONTROL_PATTERN =
  /add row|new row|edit row|delete row|save changes|edit document|delete document|insert|import csv|new table|add column|edit column|drop column|create index|drop index|rename table|truncate table|drop table|new database|drop database|new schema|drop schema/i;

interface MutatingRequest {
  readonly method: "POST" | "PATCH" | "DELETE";
  readonly path: string;
  readonly body?: Record<string, unknown>;
  readonly queryRoute?: boolean;
}

const MUTATING_REQUESTS: readonly MutatingRequest[] = [
  { method: "POST", path: "/api/tables/public/qyre_demo_users/rows" },
  { method: "PATCH", path: "/api/tables/public/qyre_demo_users/rows" },
  { method: "DELETE", path: "/api/tables/public/qyre_demo_users/rows" },
  { method: "POST", path: "/api/mutations/commit" },
  { method: "POST", path: "/api/tables/public/qyre_demo_users/import.csv" },
  { method: "POST", path: "/api/schemas/public/tables" },
  { method: "POST", path: "/api/tables/public/qyre_demo_users/ddl/rename" },
  { method: "POST", path: "/api/tables/public/qyre_demo_users/ddl/truncate" },
  { method: "DELETE", path: "/api/tables/public/qyre_demo_users" },
  { method: "POST", path: "/api/tables/public/qyre_demo_users/ddl/columns" },
  { method: "PATCH", path: "/api/tables/public/qyre_demo_users/ddl/columns/name" },
  { method: "DELETE", path: "/api/tables/public/qyre_demo_users/ddl/columns/name" },
  { method: "POST", path: "/api/tables/public/qyre_demo_users/ddl/indexes" },
  {
    method: "DELETE",
    path: "/api/tables/public/qyre_demo_users/ddl/indexes/qyre_demo_users_name_idx"
  },
  { method: "POST", path: "/api/databases" },
  { method: "DELETE", path: "/api/databases/qyre_test" },
  { method: "POST", path: "/api/schemas" },
  { method: "DELETE", path: "/api/schemas/public" },
  {
    method: "POST",
    path: "/api/query",
    body: { sql: `DELETE FROM ${FIXTURE.table}` },
    queryRoute: true
  }
];

async function setupProjectFixture(project: string): Promise<void> {
  if (project === "sqlite") {
    setupSqliteFixture(requireTestSqlitePath());
  } else if (project === "mongodb" || project === "mongodb-readonly") {
    await setupMongoFixture(requireTestMongoUrl());
  } else if (project === "mysql" || project === "mysql-restricted") {
    await setupMysqlFixture(requireTestMysqlUrl());
  } else {
    await setupFixture(requireTestDatabaseUrl());
  }
}

function schemaForProject(project: string): string {
  if (project.startsWith("sqlite")) return "main";
  if (project.startsWith("mysql")) {
    return decodeURIComponent(new URL(requireTestMysqlUrl()).pathname.slice(1));
  }
  if (project.startsWith("mongodb")) {
    return decodeURIComponent(new URL(requireTestMongoUrl()).pathname.slice(1));
  }
  return "public";
}

test("@full @role-matrix every read-only role keeps reads and hides writes", async ({
  page,
  request
}, testInfo) => {
  const project = testInfo.project.name;
  test.skip(!READ_ONLY_PROJECTS.has(project), "Read-only matrix project only.");
  await setupProjectFixture(project);

  await page.goto("/");
  await expect(page.getByTestId("status-badge")).toHaveAttribute("data-status", "connected");
  await expect(page.getByTestId("access-badge")).toHaveAttribute("data-access", "read-only");
  await expect(page.getByRole("button", { name: WRITE_CONTROL_PATTERN })).toHaveCount(0);

  await page.getByRole("tab", { name: "Schema" }).click();
  await expect(page.locator(".react-flow__node").filter({ hasText: FIXTURE.table })).toBeVisible();
  await page.getByRole("tab", { name: "Tables" }).click();
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();
  await expect(page.getByTestId("rows-table").getByText("ada@example.com")).toBeVisible();
  await expect(page.getByRole("button", { name: WRITE_CONTROL_PATTERN })).toHaveCount(0);

  const token = await page.evaluate(
    () => (window as Window & { __QYRE_TOKEN__?: string }).__QYRE_TOKEN__
  );
  expect(token).toBeTruthy();
  const schema = schemaForProject(project);
  const denial = await request.post(`/api/tables/${schema}/${FIXTURE.table}/rows`, {
    headers: { authorization: `Bearer ${token}` },
    data: { values: { name: "Denied", email: "denied@example.com" } }
  });
  expect(denial.status()).toBe(403);
  const body = (await denial.json()) as Record<string, unknown>;
  if (project.endsWith("restricted")) {
    expect(body).toMatchObject({ code: "permission-denied", operation: "insert" });
  } else {
    expect(body).toMatchObject({ reason: "qyre-flag" });
  }
});

test("@full @role-matrix every mutating API rejects read-only and tokenless callers", async ({
  page,
  request
}, testInfo) => {
  test.skip(testInfo.project.name !== "readonly", "One central-guard instance covers all routes.");
  await setupFixture(requireTestDatabaseUrl());
  await page.goto("/");
  const token = await page.evaluate(
    () => (window as Window & { __QYRE_TOKEN__?: string }).__QYRE_TOKEN__
  );
  expect(token).toBeTruthy();

  for (const route of MUTATING_REQUESTS) {
    const authenticated = await request.fetch(route.path, {
      method: route.method,
      headers: { authorization: `Bearer ${token}` },
      data: route.body ?? {}
    });
    expect(authenticated.status(), `${route.method} ${route.path}`).toBe(
      route.queryRoute ? 400 : 403
    );
    await expect(authenticated.json()).resolves.toMatchObject(
      route.queryRoute ? { reason: "read-only" } : { reason: "qyre-flag" }
    );

    const tokenless = await request.fetch(route.path, {
      method: route.method,
      data: route.body ?? {}
    });
    expect(tokenless.status(), `tokenless ${route.method} ${route.path}`).toBe(401);
    await expect(tokenless.json()).resolves.toMatchObject({
      error: "Unauthorized: missing or invalid session token."
    });
  }
});

test("@full @role-matrix writable engines create and drop a table or collection", async ({
  page
}, testInfo) => {
  const project = testInfo.project.name;
  test.skip(!WRITABLE_PROJECTS.has(project), "Writable engine project only.");
  await setupProjectFixture(project);
  const scratch = `qyre_e2e_matrix_${randomUUID().replaceAll("-", "").slice(0, 10)}`;
  const isMongo = project === "mongodb";

  await page.goto("/");
  await expect(page.getByTestId("access-badge")).toHaveAttribute("data-access", "read-write");
  await page.getByRole("tab", { name: "Schema" }).click();
  await page.getByRole("button", { name: "New table" }).click();

  const dialog = page.getByTestId("create-table-dialog");
  await dialog.getByLabel(isMongo ? "Collection name" : "Table name").fill(scratch);
  if (!isMongo) await dialog.getByLabel("Column name").fill("id");
  await dialog
    .getByRole("button", { name: isMongo ? "Create collection" : "Create table" })
    .click();
  await expect(dialog).toHaveCount(0);

  const treeItem = page.getByRole("treeitem", { name: scratch });
  await expect(treeItem).toBeVisible();
  await treeItem.click();
  await page.getByRole("button", { name: "Structure" }).click();
  await page.getByRole("button", { name: "Drop table" }).click();

  const confirmation = page.getByTestId("confirm-typed-name-dialog");
  await confirmation.getByLabel(`Type "${scratch}" to confirm`).fill(scratch);
  await confirmation.getByRole("button", { name: "Drop table" }).click();
  await expect(confirmation).toHaveCount(0);
  await expect(treeItem).toHaveCount(0);
});
