import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
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

// Padrinos (ADR-185): ADMIN le asigna a un nuevo del semestre un egresado con acceso (ADR-184), y el
// egresado ve a su ahijado en Mi OE.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const marca = randomBytes(4).toString("hex");
const CLAVE = "garza de humedal 63";
const [, , ahijado, padrino] = tList("T-5017");
const [titulo, , , tusAhijados, egresado] = tList("T-5016");
let ids: { nueva: string; egresado: string };

test.beforeEach(async () => {
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  const nueva = await seedPerson(`e2e-ahijada-${marca}@eafit.edu.co`, {
    firstName: "Ahijada",
    lastName: `Sintética ${marca}`,
    source: "E2E",
  });
  await seedMembership(nueva, current.id);
  const padrinoId = await seedPerson(`e2e-padrino-${marca}@eafit.edu.co`, {
    firstName: "Padrino",
    lastName: `Egresado ${marca}`,
    stage: "ALUMNI",
    source: "E2E",
  });
  await seedMembership(padrinoId, current.id, "INACTIVE", { endReason: "GRADUATION" });
  await seedConsent(padrinoId);
  ids = { nueva, egresado: padrinoId };
});

test.afterEach(async () => {
  await drenarOutbox();
  await getDb()
    .delete(person)
    .where(inArray(person.id, [ids.nueva, ids.egresado]));
  await closeDb();
});

test("ADMIN asigna un egresado como padrino y el egresado ve a su ahijada", async ({
  page,
  browser,
}) => {
  await page.goto("/admin/personas/padrinos?nuevo=1");
  const panel = page.getByRole("dialog");
  await panel
    .getByLabel(ahijado ?? "", { exact: true })
    .selectOption({ label: `Ahijada Sintética ${marca}` });
  await panel
    .getByLabel(padrino ?? "", { exact: true })
    .selectOption({ label: `Padrino Egresado ${marca} · ${egresado}` });
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByRole("cell", { name: `Ahijada Sintética ${marca}` })).toBeVisible();

  const { token } = await issueAccessGrantAs(SYSTEM_ACTOR, {
    personId: ids.egresado,
    kind: "ACTIVATION",
  });
  const contexto = await browser.newContext({
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const suya = await contexto.newPage();
  await suya.goto(`/activar/${token}`);
  await suya.getByLabel(t("T-2103")).fill(CLAVE);
  await suya.getByLabel(t("T-2104")).fill(CLAVE);
  await suya.getByRole("button", { name: t("T-2106") }).click();
  await expect(suya).toHaveURL(/\/app\/egresados$/);

  await suya.goto("/app/padrinos");
  await expect(suya.getByRole("heading", { level: 1 })).toHaveText(titulo ?? "");
  const lista = suya.getByRole("region", { name: tusAhijados });
  await expect(lista.getByText(`Ahijada Sintética ${marca}`)).toBeVisible();
  await sinViolaciones(suya);
  await contexto.close();
});
