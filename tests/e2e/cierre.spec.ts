import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { termStanding } from "@/modules/participation/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_CLOSING_TERM } from "./global-setup";

// Cierre de puntos como ADMIN (ADR-035 regla 13) sobre el término de pruebas que el global-setup
// reinicia en cada corrida; nunca sobre el término actual.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

let termId = "";

test.beforeEach(async () => {
  const db = getDb();
  const [row] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_CLOSING_TERM));
  if (!row) throw new Error("sin término de pruebas");
  termId = row.id;
  await closeDb();
});

test.beforeEach(async () => {
  // Un fallo posterior al cierre no puede dejar cerrado el término al reintentar.
  await getDb().transaction(async (tx) => {
    await tx.update(term).set({ pointsClosedAt: null }).where(eq(term.id, termId));
    await tx.delete(termStanding).where(eq(termStanding.termId, termId));
  });
  await closeDb();
});

test("GH ve las asambleas del término y cierra los puntos con el standing congelado", async ({
  page,
}) => {
  await page.goto("/admin/asambleas");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    t("T-637", { término: E2E_TERM.code }),
  );
  await expect(page.getByRole("link", { name: tList("T-639")[1], exact: true })).toBeVisible();
  await sinViolaciones(page);

  await page.goto(`/admin/cierre?termId=${termId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    t("T-644", { término: E2E_CLOSING_TERM }),
  );
  await page.getByRole("link", { name: t("T-647") }).click();
  const panel = page.getByRole("dialog");
  await expect(panel.getByText(copyPattern("T-163", { término: "2019-2" }))).toBeVisible();
  await panel.getByRole("button", { name: t("T-647") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByText(copyPattern("T-648"))).toBeVisible();
  await expect(page.getByRole("heading", { name: tList("T-649")[0] })).toBeVisible();
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
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(tList("T-658")[0]);
});
