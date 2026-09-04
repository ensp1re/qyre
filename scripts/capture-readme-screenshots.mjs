#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConnectionTarget } from "@qyre/core";
import { resolveAdapter } from "@qyre/driver-contract";
import { postgresAdapterFactory } from "@qyre/postgres";
import { startServer } from "@qyre/server";
import { FIXTURE, requireTestDatabaseUrl } from "@qyre/testing";
import { runStatements, setupFixture } from "@qyre/testing/postgres";
import { chromium } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
// These committed assets are embedded in README.md.
const outDir = join(repoRoot, "docs/screenshots");
mkdirSync(outDir, { recursive: true });

async function main() {
  const databaseUrl = requireTestDatabaseUrl();
  await setupFixture(databaseUrl);
  await runStatements(databaseUrl, [
    "DROP TABLE IF EXISTS qyre_readme_orders",
    `CREATE TABLE qyre_readme_orders (
       id serial PRIMARY KEY,
       user_id integer NOT NULL REFERENCES ${FIXTURE.table}(id),
       status varchar(20) NOT NULL,
       total numeric(10,2) NOT NULL
     )`,
    `INSERT INTO qyre_readme_orders (user_id, status, total) VALUES
       (1, 'paid', 42.50),
       (1, 'pending', 108.00)`
  ]);

  const target = parseConnectionTarget(databaseUrl);
  const adapter = resolveAdapter([postgresAdapterFactory], target);
  await adapter.connect();

  const webRoot = join(repoRoot, "apps/web/dist");
  const server = await startServer({
    adapter,
    target,
    port: 4174,
    host: "127.0.0.1",
    webRoot,
    logger: false
  });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  try {
    await page.goto(server.url);
    await page.getByTestId("status-badge").waitFor();
    await page.waitForTimeout(300);

    await page.getByRole("tab", { name: "SQL Editor" }).click();
    await page
      .getByTestId("query-editor")
      .locator(".cm-content")
      .fill(
        `SELECT o.id, u.name, o.status, o.total
FROM qyre_readme_orders o
JOIN ${FIXTURE.table} u ON u.id = o.user_id
ORDER BY o.id`
      );
    await page.getByRole("button", { name: "Run" }).click();
    await page.getByTestId("query-result").waitFor();
    await page.screenshot({ path: join(outDir, "sql-editor.png") });

    await page.getByRole("tab", { name: "Schema" }).click();
    await page.getByTestId("schema-graph").waitFor();
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(outDir, "schema.png") });

    await page.getByRole("treeitem", { name: FIXTURE.table }).click();
    await page.getByTestId("rows-table").waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outDir, "tables.png") });
  } finally {
    await browser.close();
    await server.close();
    await adapter.disconnect();
    await runStatements(databaseUrl, ["DROP TABLE IF EXISTS qyre_readme_orders"]);
  }

  console.log(`Screenshots written to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
