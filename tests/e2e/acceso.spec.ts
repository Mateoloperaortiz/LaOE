import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  committee,
  committeeMembership,
  consent,
  membership,
  person,
} from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
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

test.beforeAll(async () => {
  const db = getDb();
  const [current] = await db.select().from(term).where(eq(term.code, "2026-2"));
  if (!current) throw new Error("Falta el semestre sintético");
  const [comite] = await db
    .insert(committee)
    .values({ name: `${prefix} comité`, slug: prefix, status: "ACTIVE" })
    .returning();
  const [who] = await db
    .insert(person)
    .values({
      email: `${prefix}@eafit.edu.co`,
      firstName: "Acceso",
      lastName: "Sintético",
      stage: "MEMBER",
      source: "E2E",
    })
    .returning();
  if (!who || !comite) throw new Error("No se creó la persona sintética");
  personId = who.id;
  committeeId = comite.id;
  await db.insert(membership).values({ personId, status: "ACTIVE", firstTermId: current.id });
  // ADR-048: sin autorización viva no se llega a Mi OE, y esta suite prueba el acceso.
  await db
    .insert(consent)
    .values({ personId, purpose: "MEMBERSHIP", source: "SELF", policyVersion: "prueba-v1" });
  await db
    .insert(committeeMembership)
    .values({ personId, committeeId, termId: current.id, roleCode: "MIEMBRO" });
});

test.afterAll(async () => {
  const db = getDb();
  await db.delete(person).where(eq(person.id, personId));
  await db.delete(committee).where(eq(committee.id, committeeId));
  await closeDb();
});

test("la junta emite el enlace, la persona elige su contraseña y después la cambia", async ({
  page,
  browser,
}) => {
  await page.goto(`/admin/personas/activacion?comite=${prefix}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Jornada de activación");
  const enLista = page.getByRole("listitem").filter({ hasText: "Acceso Sintético" });
  await expect(enLista.getByText("Sin contraseña")).toBeVisible();
  await enLista.getByRole("link").click();
  await sinViolaciones(page);

  await page.getByRole("button", { name: "Emitir enlace de acceso" }).click();
  await pasarStepUpSiHaceFalta(page);
  if (!page.url().includes("/activacion")) {
    await page.goto(`/admin/personas/activacion?comite=${prefix}&persona=${personId}`);
    await page.getByRole("button", { name: "Emitir enlace de acceso" }).click();
  }
  await expect(page.getByText("Copialo ahora")).toBeVisible();
  const enlace = (await page.locator("code").first().textContent())?.trim() ?? "";
  expect(enlace).toContain("/activar/");

  // Contexto nuevo: quien recibe el enlace no tiene sesión.
  const contexto = await browser.newContext({
    baseURL: process.env.APP_URL ?? "http://localhost:3000",
    storageState: { cookies: [], origins: [] },
  });
  const suya = await contexto.newPage();
  await suya.goto(enlace);
  await expect(suya.getByRole("heading", { level: 1 })).toHaveText("Elegí tu contraseña");
  await expect(suya.getByText("Hola, Acceso.")).toBeVisible();
  await sinViolaciones(suya);

  // Las reglas de contraseña se aplican antes de consumir el enlace.
  await suya.getByLabel("Contraseña nueva").fill("corta");
  await suya.getByLabel("Repetí la contraseña").fill("corta");
  await suya.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(suya.locator("#activar-error")).toContainText("al menos 10 caracteres");

  await suya.getByLabel("Contraseña nueva").fill(CLAVE);
  await suya.getByLabel("Repetí la contraseña").fill(CLAVE);
  await suya.getByRole("button", { name: "Guardar y entrar" }).click();
  await expect(suya).toHaveURL(/\/app$/);
  await expect(suya.getByRole("heading", { level: 1 })).toContainText("Hola, Acceso");

  // El enlace ya no sirve.
  const otra = await contexto.newPage();
  await otra.goto(enlace);
  await expect(otra.getByText("Este enlace ya no sirve")).toBeVisible();
  await otra.close();

  // Y la contraseña se cambia desde Ajustes, que cierra las demás sesiones.
  await suya.goto("/app/ajustes#sesiones");
  await suya.getByLabel("Contraseña actual").fill(CLAVE);
  await suya.getByLabel("Contraseña nueva").fill(OTRA);
  await suya.getByLabel("Repetí la contraseña").fill(OTRA);
  await suya.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(suya.getByText("guardamos tu contraseña")).toBeVisible();

  await contexto.close();
});
