import { FIXTURE, requireTestDatabaseUrl } from "@qyre/testing";
import { setupFixture } from "@qyre/testing/postgres";
import { expect, test } from "./support/test.js";

test("@full a --read-only session shows the read-only badge and renders zero write affordances", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "readonly", "Read-only-mode-specific behavior.");
  await setupFixture(requireTestDatabaseUrl());

  await page.goto("/");
  await expect(page.getByTestId("status-badge")).toHaveAttribute("data-status", "connected");

  const badge = page.getByTestId("access-badge");
  await expect(badge).toHaveAttribute("data-access", "read-only");
  await expect(badge).toHaveAttribute("title", "Read-only: qyre --read-only flag");

  // Switching databases remains available in read-only mode.
  const writeControlPattern =
    /add row|new row|edit row|delete row|save changes|insert|import csv|new table|add column|edit column|drop column|create index|drop index|rename table|truncate table|drop table|new database|drop database|new schema|drop schema/i;
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);

  await page.getByRole("tab", { name: "Schema" }).click();
  await expect(page.getByTestId("schema-graph")).toBeVisible();
  await expect(page.locator(".react-flow__node").filter({ hasText: FIXTURE.table })).toBeVisible();
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);

  await page.getByRole("tab", { name: "Tables" }).click();
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);
  await page.getByRole("button", { name: "Structure" }).click();
  await expect(page.getByTestId("table-detail")).toBeVisible();
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);

  await page.getByRole("button", { name: "Switch database connection" }).click();
  await expect(page.getByText("Databases on this server")).toBeVisible();
  await expect(page.getByRole("button", { name: writeControlPattern })).toHaveCount(0);
});
