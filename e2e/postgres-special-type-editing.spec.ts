import { requireTestDatabaseUrl, runStatements, setupFixture } from "@qyre/testing";
import { expect, test } from "./support/test.js";

test("@full PostgreSQL temporal, interval, bytea, bit, network, and XML cells edit and persist", async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== "postgres", "These are PostgreSQL-native type contracts.");
  const databaseUrl = requireTestDatabaseUrl();
  await setupFixture(databaseUrl);
  await runStatements(databaseUrl, [
    "DROP TABLE IF EXISTS qyre_e2e_special_edits",
    `CREATE TABLE qyre_e2e_special_edits (
       id integer PRIMARY KEY,
       bytes bytea NOT NULL,
       calendar_day date NOT NULL,
       local_time time NOT NULL,
       zoned_time time with time zone NOT NULL,
       duration interval NOT NULL,
       fixed_bits bit(4) NOT NULL,
       variable_bits bit varying(8) NOT NULL,
       address inet NOT NULL,
       document xml NOT NULL
     )`,
    `INSERT INTO qyre_e2e_special_edits
       (id, bytes, calendar_day, local_time, zoned_time, duration,
        fixed_bits, variable_bits, address, document)
     VALUES (1, '\\x00', '2026-07-16', '01:30:45.123456', '01:30:45.123456+02',
       '1 day 02:03:04.5', B'0000', B'0', '127.0.0.1', '<root/>')`
  ]);

  try {
    await page.goto("/");
    await page.getByRole("tab", { name: "Tables" }).click();
    await page.getByRole("treeitem", { name: "qyre_e2e_special_edits" }).click();
    const table = page.getByTestId("rows-table");

    await table.getByRole("button", { name: "Edit bytes" }).click();
    const bytesEditor = page.getByRole("textbox", { name: "Edit cell value" });
    await expect(bytesEditor).toHaveValue("00");
    await bytesEditor.fill("00cafeff");
    await page.getByRole("button", { name: "Apply" }).click();

    await table.getByRole("button", { name: "Edit calendar_day" }).click();
    await table.getByRole("textbox", { name: "calendar_day" }).fill("2026-07-17");
    await table.getByRole("textbox", { name: "calendar_day" }).press("Enter");

    await table.getByRole("button", { name: "01:30:45.123456", exact: true }).dblclick();
    await table.getByRole("textbox", { name: "local_time" }).fill("01:30:46.123456");
    await table.getByRole("textbox", { name: "local_time" }).press("Enter");

    await table.getByRole("button", { name: "01:30:45.123456+02", exact: true }).dblclick();
    await table.getByRole("textbox", { name: "zoned_time" }).fill("01:30:46.123456+02");
    await table.getByRole("textbox", { name: "zoned_time" }).press("Enter");

    await table.getByRole("button", { name: "1 day 02:03:04.5", exact: true }).dblclick();
    const intervalEditor = page.getByRole("textbox", { name: "Edit cell value" });
    await intervalEditor.fill("2 days 03:04:05.75");
    await page.getByRole("button", { name: "Apply" }).click();

    await table.getByRole("button", { name: "0000" }).dblclick();
    await table.getByRole("textbox", { name: "fixed_bits" }).fill("1010");
    await table.getByRole("textbox", { name: "fixed_bits" }).press("Enter");

    await table.getByRole("button", { name: "0", exact: true }).dblclick();
    await table.getByRole("textbox", { name: "variable_bits" }).fill("00101");
    await table.getByRole("textbox", { name: "variable_bits" }).press("Enter");

    await table.getByRole("button", { name: "127.0.0.1" }).dblclick();
    await table.getByRole("textbox", { name: "address" }).fill("2001:db8::1/64");
    await table.getByRole("textbox", { name: "address" }).press("Enter");

    await table.getByRole("button", { name: "<root/>" }).dblclick();
    const xmlEditor = page.getByRole("textbox", { name: "Edit cell value" });
    await xmlEditor.fill("<root>\n  <value>two</value>\n</root>");
    await page.getByRole("button", { name: "Apply" }).click();

    await page.getByRole("button", { name: "Commit", exact: true }).click();
    await expect(table.getByRole("button", { name: "binary · 4 bytes" })).toBeVisible();
    await expect(table.getByRole("button", { name: "2026-07-17", exact: true })).toBeVisible();
    await expect(table.getByRole("button", { name: "01:30:46.123456", exact: true })).toBeVisible();
    await expect(
      table.getByRole("button", { name: "01:30:46.123456+02", exact: true })
    ).toBeVisible();
    await expect(
      table.getByRole("button", { name: "2 days 03:04:05.75", exact: true })
    ).toBeVisible();
    await expect(table.getByRole("button", { name: "1010" })).toBeVisible();
    await expect(table.getByRole("button", { name: "00101" })).toBeVisible();
    await expect(table.getByRole("button", { name: "2001:db8::1/64" })).toBeVisible();
    await expect(table.getByRole("button", { name: /<value>two<\/value>/ })).toBeVisible();

    await table.getByRole("button", { name: "Edit bytes" }).click();
    await expect(page.getByRole("textbox", { name: "Edit cell value" })).toHaveValue("00 ca fe ff");
  } finally {
    await runStatements(databaseUrl, ["DROP TABLE IF EXISTS qyre_e2e_special_edits"]);
  }
});
