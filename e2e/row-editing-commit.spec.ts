import { FIXTURE, requireTestDatabaseUrl, setupFixture } from "@qyre/testing";
import { expect, test } from "@playwright/test";

/**
 * F105: the SQL pending-changes workflow completes end to end - a cell edit, an inserted row
 * (Add row), and a row staged for deletion all commit together through F102's batch endpoint, and
 * the grid reflects the committed state once it refetches. Runs on Postgres only - F099-F102's own
 * conformance tests already cover every engine at the adapter/route layer; this is a UI roundtrip
 * proof, not another adapter-parity check.
 */
test("@full editing, inserting, and deleting rows commits together and persists", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "postgres", "One representative SQL engine is enough here.");
  await setupFixture(requireTestDatabaseUrl());

  await page.goto("/");
  await page.getByRole("tab", { name: "Tables" }).click();
  await page.getByRole("treeitem", { name: FIXTURE.table }).click();

  const table = page.getByTestId("rows-table");
  await expect(table.getByText("Ada Lovelace")).toBeVisible();

  // Edit an existing row's name.
  await table.getByText("Grace Hopper").dblclick();
  const editInput = page.getByLabel("Edit cell value");
  await editInput.fill("Grace Hopper-Murray");
  await editInput.press("Enter");
  await expect(table.getByText("Grace Hopper-Murray")).toBeVisible();

  // Insert a new row (name/email are NOT NULL with no default, so both must be filled).
  await page.getByRole("button", { name: "Add row" }).click();
  const newRowInputs = page.getByLabel("New row value");
  await newRowInputs.nth(1).fill("Marie Curie");
  await newRowInputs.nth(1).blur();
  await newRowInputs.nth(2).fill("marie@example.com");
  await newRowInputs.nth(2).blur();

  // Stage a row for deletion via selection - Alan Turing is row 2.
  await page.getByLabel("Select row 2").check();
  await page.getByRole("button", { name: "Delete 1 selected" }).click();

  const commitSummary = page.getByText("1 to insert, 1 to update, 1 to delete");
  await expect(commitSummary).toBeVisible();
  await page.getByRole("button", { name: "Commit", exact: true }).click();

  // Buffer cleared and rows refetched from the server - committed changes persisted.
  await expect(commitSummary).not.toBeVisible();
  await expect(table.getByText("Grace Hopper-Murray")).toBeVisible();
  await expect(table.getByText("Marie Curie")).toBeVisible();
  await expect(table.getByText("Alan Turing")).not.toBeVisible();
});
