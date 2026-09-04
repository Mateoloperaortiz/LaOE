import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_CLOSING_TERM } from "./global-setup";

// Cierre de puntos como ADMIN (ADR-035 regla 13) sobre el término de pruebas que el global-setup
// reinicia en cada corrida; nunca sobre el término actual.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

let termId = "";

test.beforeAll(async () => {
  const db = getDb();
  const [row] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_CLOSING_TERM));
  if (!row) throw new Error("sin término de pruebas");
  termId = row.id;
  await closeDb();
});

test("GH ve las asambleas del término y cierra los puntos con el standing congelado", async ({
  page,
}) => {
  await page.goto("/admin/asambleas");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Asambleas de 2026-2");
  await expect(page.getByRole("link", { name: "Cumplen", exact: true })).toBeVisible();
  await sinViolaciones(page);

  await page.goto(`/admin/cierre?termId=${termId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Cierre de ${E2E_CLOSING_TERM}`);
  await page.getByRole("link", { name: "Cerrar puntos del semestre" }).click();
  const panel = page.getByRole("complementary");
  await expect(panel.getByText(/Vas a cerrar 2019-2/)).toBeVisible();
  await panel.getByRole("button", { name: "Cerrar puntos del semestre" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByText(/Puntos cerrados el/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Top nuevos" })).toBeVisible();
  await sinViolaciones(page);

  // Los exportes de participación salen en CSV; los personales quedan auditados con el step-up del ingreso.
  const ocasiones = await page.request.get("/api/export/ocasiones");
  expect(ocasiones.status()).toBe(200);
  expect(ocasiones.headers()["content-type"]).toContain("text/csv");
  expect(await ocasiones.text()).toContain("titulo");
  for (const tipo of ["check-ins", "ledger", "rankings", "asambleas"]) {
    const csv = await page.request.get(`/api/export/${tipo}`);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-disposition"]).toContain(`${tipo}-`);
  }
  await page.goto("/admin/sistema/alias");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Alias legados");
});
