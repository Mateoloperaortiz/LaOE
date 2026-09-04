import { expect, test } from "@playwright/test";
import { verifyCarnet } from "@/modules/identity/domain/carnet-pure";
import { sinViolaciones } from "./axe";

// Carnet (ADR-034 regla 10): el QR lleva un token firmado que `verifyCarnet` acepta.
test.use({ storageState: "tests/e2e/.auth/member.json" });

test("el carnet muestra un QR con un token firmado de 24 horas", async ({ page }) => {
  await page.goto("/app/carnet");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tu carnet OE");
  await expect(page.getByRole("heading", { level: 2 })).toHaveText("Miembro E2E");
  const figura = page.locator("figure[data-token]");
  await expect(figura.locator("svg")).toBeVisible();
  await expect(figura.getByText(/Vence el/)).toBeVisible();
  const token = (await figura.getAttribute("data-token")) ?? "";
  const result = verifyCarnet(token, { secret: process.env.SESSION_SECRET ?? "" });
  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.expiresAt.getTime() - Date.now()).toBeGreaterThan(23 * 60 * 60 * 1000);
  }
  await sinViolaciones(page);
});
