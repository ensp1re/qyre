import { FIXTURE, requireTestDatabaseUrl, runStatements, setupFixture } from "@qyre/testing";
import { replaceInputAndPressEnterSynchronously } from "./support/live-input.js";
import { expect, test } from "./support/test.js";

const KEYBOARD_EDIT_TABLE = "qyre_keyboard_edit";

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
  const graceCell = table.getByRole("button", { name: "Grace Hopper" });
  await graceCell.click();
  await graceCell.press("Enter");
  const editInput = table.getByRole("textbox", { name: "name", exact: true });
  await editInput.fill("Grace Hopper-Murray");
  await editInput.press("ControlOrMeta+Enter");
  await expect(table.getByText("Grace Hopper-Murray")).toBeVisible();

  // Insert a new row (name/email are NOT NULL with no default, so both must be filled).
  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByRole("button", { name: "Set name" }).click();
  await page.getByRole("textbox", { name: "name", exact: true }).fill("Marie Curie");
  await page.getByRole("textbox", { name: "name", exact: true }).press("ControlOrMeta+Enter");
  await page.getByRole("button", { name: "Set email" }).click();
  await page.getByRole("textbox", { name: "email", exact: true }).fill("marie@example.com");
  await page.getByRole("textbox", { name: "email", exact: true }).press("ControlOrMeta+Enter");

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

test("@full immediate Enter stages the live inline scalar value", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "postgres", "One shared-UI browser proof is sufficient.");
  const databaseUrl = requireTestDatabaseUrl();
  await setupFixture(databaseUrl);
  await runStatements(databaseUrl, [
    `DROP TABLE IF EXISTS ${KEYBOARD_EDIT_TABLE}`,
    `CREATE TABLE ${KEYBOARD_EDIT_TABLE} (id integer PRIMARY KEY, score numeric NOT NULL)`,
    `INSERT INTO ${KEYBOARD_EDIT_TABLE} (id, score) VALUES (1, 10)`
  ]);

  try {
    await page.goto("/");
    await page.getByRole("tab", { name: "Tables" }).click();
    await page.getByRole("treeitem", { name: KEYBOARD_EDIT_TABLE }).click();

    const table = page.getByTestId("rows-table");
    await table.getByRole("button", { name: "10", exact: true }).dblclick();
    const scoreInput = table.getByRole("textbox", { name: "score" });
    await replaceInputAndPressEnterSynchronously(scoreInput, "42");

    await expect(scoreInput).not.toBeVisible();
    await expect(table.getByText("42", { exact: true })).toBeVisible();
    await expect(page.getByText("1 to update")).toBeVisible();

    await page.getByRole("button", { name: "Commit", exact: true }).click();
    await expect(page.getByText("1 to update")).not.toBeVisible();
    await expect(table.getByText("42", { exact: true })).toBeVisible();
  } finally {
    await runStatements(databaseUrl, [`DROP TABLE IF EXISTS ${KEYBOARD_EDIT_TABLE}`]);
  }
});
