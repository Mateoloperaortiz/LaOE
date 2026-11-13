import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { issueAccessGrantAs } from "@/modules/identity/domain/access-grant";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedConsent, seedMembership, seedPerson } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

// Egresados con acceso (ADR-184): quien egresó entra con el enlace de la junta a su red, con su propia
// barra, y lo demás de Mi OE y la operación lo devuelven a la red.

const marca = randomBytes(4).toString("hex");
const CLAVE = "colibrí de páramo 52";
let personId: string;

test.beforeEach(async () => {
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  personId = await seedPerson(`e2e-egresada-${marca}@eafit.edu.co`, {
    firstName: "Egresada",
    lastName: "Sintética",
    stage: "ALUMNI",
    source: "E2E",
  });
  await seedMembership(personId, current.id, "INACTIVE", { endReason: "GRADUATION" });
  await seedConsent(personId);
});

test.afterEach(async () => {
  await drenarOutbox();
  await getDb().delete(person).where(eq(person.id, personId));
  await closeDb();
});

test("quien egresó entra con su enlace a la red y no a lo de quien participa", async ({
  browser,
}) => {
  const { token } = await issueAccessGrantAs(SYSTEM_ACTOR, { personId, kind: "ACTIVATION" });
  const contexto = await browser.newContext({
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const page = await contexto.newPage();
  await page.goto(`/activar/${token}`);
  await page.getByLabel(t("T-2103")).fill(CLAVE);
  await page.getByLabel(t("T-2104")).fill(CLAVE);
  await page.getByRole("button", { name: t("T-2106") }).click();

  await expect(page).toHaveURL(/\/app\/egresados$/);
  await expect(page.getByText(t("T-5009"))).toBeVisible();
  const barra = page.getByRole("navigation", { name: t("T-1663") });
  for (const label of tList("T-5008")) {
    await expect(barra.getByRole("link", { name: label, exact: true })).toBeVisible();
  }
  await sinViolaciones(page);

  for (const ruta of ["/app/agenda", "/app/asistencia", "/app/yo", "/admin"]) {
    await page.goto(ruta);
    await expect(page).toHaveURL(/\/app\/egresados$/);
  }
  await page.goto("/app/ajustes");
  await expect(page).toHaveURL(/\/app\/ajustes$/);
  await contexto.close();
});
