import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { applyDecisions, recomputeSnapshots } from "@/modules/permanence";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_CLOSING_EMAIL, E2E_PERMANENCE_TERM } from "./global-setup";

// Cierre de permanencia como ADMIN (ADR-036 regla 9) sobre el término 2019-1 que el global-setup
// deja con los puntos cerrados y una persona desechable sin tabla: la propuesta es salir de la OE.
// El job no corre en el e2e (JOBS_ENABLED=false): la prueba llama `applyDecisions` como en medios.spec.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

let termId = "";
let nextTermId = "";
let personId = "";

test.beforeAll(async () => {
  const db = getDb();
  const [row] = await db
    .select({ id: term.id })
    .from(term)
    .where(eq(term.code, E2E_PERMANENCE_TERM));
  const [next] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2019-2"));
  const [disposable] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_CLOSING_EMAIL));
  if (!row || !next || !disposable) throw new Error("sin término o persona de pruebas");
  termId = row.id;
  nextTermId = next.id;
  personId = disposable.id;
  await recomputeSnapshots(termId);
  await closeDb();
});

test("GH cambia una propuesta con motivo, aplica el cierre con step-up y la decisión llega a la persona", async ({
  page,
}) => {
  await page.goto(`/admin/permanencia/cierre?termId=${termId}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Cierre de permanencia");
  const fila = page.getByRole("listitem").filter({ hasText: "Cierre E2E" }).first();
  await expect(fila.getByText(/Propuesta: Sale de la OE\. Motivo automático:/)).toBeVisible();
  await sinViolaciones(page);

  // Cambiar sin motivo se rechaza; con motivo queda confirmada y marcada por quién.
  await fila.getByRole("link", { name: "Cambiar" }).click();
  const panel = page.getByRole("complementary");
  await panel.getByLabel(/^Decisión · (?!Cierre E2E)/).selectOption("PROBATION");
  await panel.getByRole("button", { name: "Confirmar propuesta" }).click();
  await expect(page.getByText("Cambiar la propuesta exige un motivo.").first()).toBeVisible();
  await page.getByRole("complementary").getByLabel("Motivo").fill("e2e: se queda en prueba");
  await page
    .getByRole("complementary")
    .getByRole("button", { name: "Confirmar propuesta" })
    .click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByText(/Confirmada por .* el /)).toBeVisible();
  await expect(page.getByRole("link", { name: "Confirmar todas las propuestas" })).toHaveCount(0);

  // Aplicar: el panel resume las salidas y el cierre queda estampado; el job aplica las decisiones.
  await page.getByRole("link", { name: "Aplicar cierre" }).click();
  await expect(
    page.getByRole("complementary").getByText(/Vas a aplicar el cierre de 2019-1/),
  ).toBeVisible();
  await page.getByRole("complementary").getByRole("button", { name: "Aplicar cierre" }).click();
  await expect(page.getByText("Cierre aplicado.")).toBeVisible();
  await expect(page.getByText("0 de 2 decisiones aplicadas")).toBeVisible();
  expect(await applyDecisions(termId, nextTermId)).toBe(2);
  await closeDb();
  await page.reload();
  await expect(page.getByText("2 de 2 decisiones aplicadas")).toBeVisible();
  await expect(page.getByRole("link", { name: "Aplicar cierre" })).toHaveCount(0);
  await sinViolaciones(page);

  // La Persona 360 muestra la decisión confirmada y la baja por permanencia.
  await page.goto(`/admin/personas/${personId}?pestana=permanencia&semestre=${termId}`);
  await expect(page.getByRole("heading", { name: "Decisiones del cierre" })).toBeVisible();
  await expect(page.getByText(/Sale de la OE: e2e: se queda en prueba/)).toBeVisible();
  await page.goto(`/admin/personas/${personId}`);
  await expect(page.getByText("Retirado").first()).toBeVisible();
});
