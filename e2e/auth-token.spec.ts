import { expect, test } from "./support/test.js";

test("@smoke a tokenless request to /api is rejected, but the UI works via its own injected token", async ({
  page,
  request
}) => {
  const tokenlessResponse = await request.get("/api/health");
  expect(tokenlessResponse.status()).toBe(401);

  const invalidTokenResponse = await request.get("/api/health", {
    headers: { authorization: "Bearer not-the-real-token" }
  });
  expect(invalidTokenResponse.status()).toBe(401);

  await page.goto("/");
  await expect(page.getByTestId("status-badge")).toHaveAttribute(
    "data-status",
    /connected|disconnected|unconfigured/
  );
});
