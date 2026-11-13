import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { appointment, person } from "@/modules/people/schema";
import {
  capCompanion,
  followUpEntry,
  followUpTemplate,
  workGroup,
  workGroupMembership,
} from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import {
  seedAppointment,
  seedCommittee,
  seedWorkGroup,
  seedWorkGroupMembership,
} from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// La bitácora del CAP (ADR-197 regla 4): la Presidencia asigna el acompañante de un comité, escribe el
// plan del mes y cambia las preguntas de la nota de reunión. El miembro de pruebas es Presidencia y está
// en el CAP solo durante la prueba.

const marca = randomBytes(3).toString("hex");
const cargos: string[] = [];
const membresias: string[] = [];

test.afterEach(async () => {
  const db = getDb();
  if (cargos.length > 0)
    await db.delete(appointment).where(inArray(appointment.id, cargos.splice(0)));
  if (membresias.length > 0)
    await db
      .delete(workGroupMembership)
      .where(inArray(workGroupMembership.id, membresias.splice(0)));
  await db.delete(followUpTemplate).where(eq(followUpTemplate.kind, "CAP_MEETING"));
  await closeDb();
});

test.describe("la Presidencia", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("asigna el acompañante, escribe el plan del mes y cambia las preguntas de la reunión", async ({
    page,
  }) => {
    const db = getDb();
    const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
    const [member] = await db.select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!current || !member) throw new Error("Faltan el semestre y el miembro sintéticos");
    cargos.push(await seedAppointment(member.id, current.id, "PRESIDENT"));
    const [existing] = await db
      .select()
      .from(workGroup)
      .where(and(eq(workGroup.termId, current.id), eq(workGroup.code, "CAP")));
    const cap =
      existing?.id ??
      (await seedWorkGroup(current.id, "CAP", { kind: "WORK_COMMITTEE", code: "CAP" }));
    membresias.push(await seedWorkGroupMembership(cap, member.id));
    const nombre = `Comité Bitácora ${marca}`;
    const comite = await seedCommittee(`e2e-bitacora-${marca}`, nombre);
    await closeDb();

    const [titulo, , , asignar, plantillas, , volver] = tList("T-5130");
    const [, acompanante] = tList("T-5131");
    await page.goto("/admin/cap");
    await expect(page.getByRole("heading", { level: 1, name: titulo ?? "" })).toBeVisible();
    await page
      .getByLabel(`${acompanante ?? ""}: ${nombre}`, { exact: true })
      .selectOption(member.id);
    await page
      .getByRole("row", { name: new RegExp(nombre) })
      .getByRole("button", { name: asignar ?? "", exact: true })
      .click();
    await expect(page.getByText(tList("T-4302")[0] ?? "", { exact: true })).toBeVisible();
    await sinViolaciones(page);

    await page.getByRole("link", { name: nombre, exact: true }).click();
    const [primera] = tList("T-5124");
    const [, guardarPlan] = tList("T-5132");
    await page
      .getByLabel(primera ?? "", { exact: true })
      .fill("Cerrar la convocatoria del semestre");
    await page.getByRole("button", { name: guardarPlan ?? "", exact: true }).click();
    await expect(page.getByText("Cerrar la convocatoria del semestre").last()).toBeVisible();
    await sinViolaciones(page);
    const [plan] = await getDb()
      .select()
      .from(followUpEntry)
      .where(eq(followUpEntry.committeeId, comite));
    const [asignado] = await getDb()
      .select()
      .from(capCompanion)
      .where(eq(capCompanion.committeeId, comite));
    expect(plan).toMatchObject({ kind: "CAP_PLAN", authorId: member.id });
    expect(asignado?.personId).toBe(member.id);
    await closeDb();

    await page.getByRole("link", { name: volver ?? "", exact: true }).click();
    await page.getByRole("link", { name: plantillas ?? "", exact: true }).click();
    const formatos = tList("T-5123");
    const [, , unaPorLinea, guardarPreguntas] = tList("T-5134");
    await page
      .getByLabel(`${formatos[1] ?? ""}: ${unaPorLinea ?? ""}`, { exact: true })
      .fill("¿Qué avanzó la mesa?\n¿Qué hay que reconocer?");
    await page
      .getByRole("button", { name: guardarPreguntas ?? "", exact: true })
      .nth(1)
      .click();
    await expect(page.getByText(tList("T-4302")[0] ?? "", { exact: true })).toBeVisible();
    await sinViolaciones(page);

    await page.goto(`/admin/cap/e2e-bitacora-${marca}`);
    await expect(page.getByLabel("¿Qué avanzó la mesa?", { exact: true })).toBeVisible();
  });
});
