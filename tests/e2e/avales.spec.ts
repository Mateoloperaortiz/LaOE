import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { DESK_SECTIONS } from "@/app/admin/_kit/desk-items";
import { closeDb, getDb } from "@/db/client";
import { requestEventApprovalAs } from "@/modules/finance";
import { eventApproval } from "@/modules/finance/schema";
import { appointment, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tLabels, tList } from "@/shared/copy";
import { seedAppointment, seedCommittee, seedMembership, seedPerson } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Los avales de la junta (ADR-195, tramos A0 y A1): el aval de evento lo decide la Presidencia por su
// cargo. El miembro de pruebas es Presidencia solo durante la prueba: ve el aval en su Mesa, lo abre y
// lo decide; rechazar exige el motivo. ADMIN ve la lista sin poder decidir.

const marca = randomBytes(3).toString("hex");
const enUnMes = () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const limpiar: string[] = [];

async function avalPedido(titulo: string) {
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  const comite = await seedCommittee(`e2e-avales-${marca}`, `Comité Avales ${marca}`);
  const pide = await seedPerson(`e2e-avales-${marca}-${titulo.length}@eafit.edu.co`, {
    firstName: "Dirección",
    lastName: `General ${marca}`,
    source: "E2E",
  });
  await seedMembership(pide, current.id);
  const { id } = await requestEventApprovalAs(
    { personId: pide, ip: null },
    { committeeId: comite, title: titulo, eventOn: enUnMes() },
  );
  return { id, termId: current.id };
}

test.afterEach(async () => {
  if (limpiar.length > 0)
    await getDb()
      .delete(appointment)
      .where(inArray(appointment.id, limpiar.splice(0)));
  await closeDb();
});

test.describe("la Presidencia", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("ve el aval en su Mesa, lo abre y lo rechaza con su motivo", async ({ page }) => {
    const titulo = `Feria de talentos ${marca}`;
    const aval = await avalPedido(titulo);
    const [member] = await getDb().select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!member) throw new Error("Falta el miembro de pruebas");
    limpiar.push(await seedAppointment(member.id, aval.termId, "PRESIDENT"));
    await closeDb();

    await page.goto("/admin/mesa");
    const porDecidir = tLabels("T-5046", DESK_SECTIONS).avales;
    const seccion = page.getByRole("region", { name: new RegExp(`^${porDecidir}`) });
    await seccion.getByRole("link", { name: new RegExp(titulo) }).click();
    await expect(page).toHaveURL(new RegExp(`/admin/avales\\?aval=${aval.id}`));
    await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    await sinViolaciones(page);

    const [, rechazar, motivo] = tList("T-5086");
    await page.getByRole("button", { name: rechazar, exact: true }).click();
    await expect(page.getByRole("main").getByText(t("T-5087"))).toBeVisible();

    await page.getByLabel(motivo ?? "", { exact: true }).fill("Se cruza con la asamblea");
    await page.getByRole("button", { name: rechazar, exact: true }).click();
    await expect(page.getByRole("main").getByText(t("T-4302"))).toBeVisible();
    const [decidido] = await getDb()
      .select()
      .from(eventApproval)
      .where(eq(eventApproval.id, aval.id));
    expect(decidido).toMatchObject({
      status: "REJECTED",
      decidedById: member.id,
      decisionNote: "Se cruza con la asamblea",
    });
  });
});

test.describe("ADMIN", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("ve los avales pendientes, pero no los decide: los decide la Presidencia", async ({
    page,
  }) => {
    const titulo = `Torneo de debate ${marca}`;
    const aval = await avalPedido(titulo);
    await closeDb();

    await page.goto(`/admin/avales?aval=${aval.id}`);
    await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
    const [aprobar, , , loDecide] = tList("T-5086");
    await expect(page.getByRole("button", { name: aprobar, exact: true })).toHaveCount(0);
    await expect(
      page.getByText((loDecide ?? "").replace("{cargo}", "Presidencia"), { exact: true }),
    ).toBeVisible();
  });
});
