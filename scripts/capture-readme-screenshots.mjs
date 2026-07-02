#!/usr/bin/env node
/**
 * Captures real screenshots of the live app for README.md - actual product screens, not mockups.
 * Requires a real Postgres database (HUMB_TEST_DATABASE_URL) since Humb has no fixture data of its
 * own to show. Run manually when the UI changes enough to need new screenshots; not part of any
 * CI or check gate.
 *
 * Usage:
 *   HUMB_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres \
 *     node scripts/capture-readme-screenshots.mjs
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConnectionTarget } from "@humbdb/core";
import { resolveAdapter } from "@humbdb/driver-contract";
import { postgresAdapterFactory } from "@humbdb/postgres";
import { startServer } from "@humbdb/server";
import { FIXTURE, requireTestDatabaseUrl, runStatements, setupFixture } from "@humbdb/testing";
import { chromium } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
// Not docs/generated/ - that's gitignored for build-time ephemera. These screenshots are a
// versioned marketing asset embedded directly in README.md and must be committed to render on
// GitHub/npm.
const outDir = join(repoRoot, "docs/screenshots");
mkdirSync(outDir, { recursive: true });

async function main() {
  const databaseUrl = requireTestDatabaseUrl();
  await setupFixture(databaseUrl);
  await runStatements(databaseUrl, [
    "DROP TABLE IF EXISTS humb_readme_orders",
    `CREATE TABLE humb_readme_orders (
       id serial PRIMARY KEY,
       user_id integer NOT NULL REFERENCES ${FIXTURE.table}(id),
       status varchar(20) NOT NULL,
       total numeric(10,2) NOT NULL
     )`,
    `INSERT INTO humb_readme_orders (user_id, status, total) VALUES
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

    // SQL Editor: a real query, run, with results below the editor.
    await page.getByRole("tab", { name: "SQL Editor" }).click();
    await page.locator("textarea").fill(
      `SELECT o.id, u.name, o.status, o.total
FROM humb_readme_orders o
JOIN ${FIXTURE.table} u ON u.id = o.user_id
ORDER BY o.id`
    );
    await page.getByRole("button", { name: "Run" }).click();
    await page.getByTestId("query-result").waitFor();
    await page.screenshot({ path: join(outDir, "sql-editor.png") });

    // Schema tab: the full-database grid, including the FK badge on user_id.
    await page.getByRole("tab", { name: "Schema" }).click();
    await page.getByTestId("schema-grid").waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outDir, "schema.png") });

    // Tables tab: the paginated row browser for the fixture table.
    await page.getByRole("button", { name: FIXTURE.table }).click();
    await page.getByTestId("rows-table").waitFor();
    await page.waitForTimeout(200);
    await page.screenshot({ path: join(outDir, "tables.png") });
  } finally {
    await browser.close();
    await server.close();
    await adapter.disconnect();
    await runStatements(databaseUrl, ["DROP TABLE IF EXISTS humb_readme_orders"]);
  }

  console.log(`Screenshots written to ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
