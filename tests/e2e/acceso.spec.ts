import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { committee, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedConsent,
  seedMembership,
  seedPerson,
} from "../factories";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";
import { pasarStepUpSiHaceFalta } from "./stepup";

// Acceso sin correo (ADR-051): la junta emite el enlace, la persona elige su contraseña, entra y
// después la cambia desde Ajustes. Todo con una persona desechable que se borra al terminar.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const marca = randomBytes(4).toString("hex");
const prefix = `e2e-acceso-${marca}`;
const CLAVE = "caracol de tinta 91";
const OTRA = "bulevar sin nombre 77";
let personId: string;
let committeeId: string;
let fuera: string[] = [];

test.beforeEach(async () => {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  committeeId = await seedCommittee(prefix, `${prefix} comité`, { publicationStatus: "DRAFT" });
  personId = await seedPerson(`${prefix}@eafit.edu.co`, {
    firstName: "Acceso",
    lastName: "Sintético",
    source: "E2E",
  });

  await seedMembership(personId, current.id);
  // ADR-048: sin autorización viva no se llega a Mi OE, y esta suite prueba el acceso.
  await seedConsent(personId);
  await seedCommitteeMembership(personId, committeeId, current.id, "MIEMBRO", { joinedAt: null });

  // Dos pertenencias del término que la lista del comité no muestra: quien se cambió de comité y
  // quien salió de la OE con la pertenencia abierta. Tampoco pueden contar en su chip.
  const cambio = {
    id: await seedPerson(`${prefix}-cambio@eafit.edu.co`, {
      firstName: "Cambio",
      lastName: "Sintético",
      source: "E2E",
    }),
  };
  const baja = {
    id: await seedPerson(`${prefix}-baja@eafit.edu.co`, {
      firstName: "Baja",
      lastName: "Sintética",
      stage: "ALUMNI",
      source: "E2E",
    }),
  };
  fuera = [cambio.id, baja.id];
  await seedMembership(cambio.id, current.id);
  await seedMembership(baja.id, current.id, "INACTIVE", { endReason: "RESIGNATION" });
  await seedCommitteeMembership(cambio.id, committeeId, current.id, "MIEMBRO", {
    joinedAt: null,
    leftAt: new Date(),
  });
  await seedCommitteeMembership(baja.id, committeeId, current.id, "MIEMBRO", { joinedAt: null });
});

test.afterEach(async () => {
  await drenarOutbox();
  const db = getDb();
  await db.delete(person).where(inArray(person.id, [personId, ...fuera]));
  await db.delete(committee).where(eq(committee.id, committeeId));
  await closeDb();
});

test("la junta emite el enlace, la persona elige su contraseña y después la cambia", async ({
  page,
  browser,
}) => {
  await page.goto(`/admin/personas/activacion?comite=${prefix}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-2128"));
  const enLista = page.getByRole("listitem").filter({ hasText: "Acceso Sintético" });
  await expect(enLista.getByText(t("T-2137"))).toBeVisible();
  // El chip cuenta a las mismas personas que la lista, no las pertenencias cerradas ni las bajas.
  await expect(page.getByRole("listitem").filter({ hasText: "Sintétic" })).toHaveCount(1);
  await expect(page.locator(`#avance-${committeeId}`)).toHaveText("0/1");
  await enLista.getByRole("link").click();
  await sinViolaciones(page);

  await page.getByRole("button", { name: t("T-2119") }).click();
  await pasarStepUpSiHaceFalta(page);
  if (!page.url().includes("/activacion")) {
    await page.goto(`/admin/personas/activacion?comite=${prefix}&persona=${personId}`);
    await page.getByRole("button", { name: t("T-2119") }).click();
  }
  await expect(page.getByText(copyPattern("T-2122"))).toBeVisible();
  const enlace = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(enlace).toContain("/activar/");

  // Contexto nuevo: quien recibe el enlace no tiene sesión.
  const contexto = await browser.newContext({
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const suya = await contexto.newPage();
  await suya.goto(enlace);
  await expect(suya.getByRole("heading", { level: 1 })).toHaveText(t("T-2101"));
  await expect(suya.getByText(t("T-2102", { nombre: "Acceso" }))).toBeVisible();
  await sinViolaciones(suya);

  // Las reglas de contraseña se aplican antes de consumir el enlace.
  await suya.getByLabel(t("T-2103")).fill("corta");
  await suya.getByLabel(t("T-2104")).fill("corta");
  await suya.getByRole("button", { name: t("T-2106") }).click();
  await expect(suya.locator("#activar-error")).toContainText(t("T-2108"));

  await suya.getByLabel(t("T-2103")).fill(CLAVE);
  await suya.getByLabel(t("T-2104")).fill(CLAVE);
  await suya.getByRole("button", { name: t("T-2106") }).click();
  await expect(suya).toHaveURL(/\/app$/);
  await expect(suya.getByRole("heading", { level: 1 })).toContainText(
    t("T-060", { "nombre preferido": "Acceso" }),
  );

  // El enlace ya no sirve.
  const otra = await contexto.newPage();
  await otra.goto(enlace);
  await expect(otra.getByText(t("T-2107"))).toBeVisible();
  await otra.close();

  // Y la contraseña se cambia desde Ajustes, que cierra las demás sesiones.
  await suya.goto("/app/ajustes#sesiones");
  await suya.getByLabel(t("T-2114")).fill(CLAVE);
  await suya.getByLabel(t("T-2103")).fill(OTRA);
  await suya.getByLabel(t("T-2104")).fill(OTRA);
  await suya.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(suya.getByText(t("T-2116"))).toBeVisible();

  await contexto.close();

  // De vuelta en la jornada, la persona ya no lleva la insignia y su comité queda completo.
  await page.goto(`/admin/personas/activacion?comite=${prefix}`);
  await expect(page.locator(`#avance-${committeeId}`)).toHaveText("1/1");
  await expect(enLista.getByText(t("T-2137"))).toHaveCount(0);
});
