import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { appointment, person, sanction } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedPerson,
} from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_CALENDAR, E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Las sanciones las registra y las anula quien decide por la VP de Gestión Humana, desde «Faltas»
// (ADR-196 regla 5); la Persona 360 solo las muestra (regla 6). El miembro de pruebas es VP de GH solo
// durante la prueba.

const marca = randomBytes(3).toString("hex");
const CAUSE = "e2e-Incumplió un compromiso con un aliado y presentó descargos por escrito";
const REASON = "e2e-La junta revisó los descargos y levantó la sanción";
const limpiar: string[] = [];

async function sancionable() {
  const [current] = await getDb()
    .select({ id: term.id })
    .from(term)
    .where(eq(term.code, E2E_TERM.code));
  if (!current) throw new Error("Falta el semestre sintético");
  const comite = await seedCommittee(`e2e-faltas-${marca}`, `Comité Faltas ${marca}`);
  const target = await seedPerson(`e2e-sancionable-${marca}@eafit.edu.co`, {
    firstName: "Persona",
    lastName: `Sancionable ${marca}`,
    source: "E2E",
  });
  await seedMembership(target, current.id);
  await seedCommitteeMembership(target, comite, current.id);
  return { termId: current.id, target, name: `Persona Sancionable ${marca}` };
}

test.afterEach(async () => {
  if (limpiar.length > 0)
    await getDb()
      .delete(appointment)
      .where(inArray(appointment.id, limpiar.splice(0)));
  await closeDb();
});

test.describe("la VP de Gestión Humana", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("registra una falta grave en «Faltas» y después la anula con su motivo", async ({
    page,
  }) => {
    const f = await sancionable();
    const [member] = await getDb()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!member) throw new Error("Falta el miembro de pruebas");
    limpiar.push(await seedAppointment(member.id, f.termId, "VP_GH"));
    await closeDb();

    const [recordLabel = "", revokeLabel = ""] = tList("T-2232");
    const [personField = ""] = tList("T-5098");
    const [kindField = "", causeField = "", , dateField = ""] = tList("T-2230");
    const today = E2E_CALENDAR.day;

    await page.goto("/admin/faltas");
    await page.getByRole("link", { name: recordLabel, exact: true }).click();
    await page.getByLabel(personField, { exact: true }).selectOption(f.target);
    await page.getByLabel(kindField, { exact: true }).selectOption("MAJOR");
    await page.getByLabel(causeField, { exact: true }).fill(CAUSE);
    await page.getByLabel(dateField, { exact: true }).fill(today);
    await page.getByRole("button", { name: recordLabel, exact: true }).click();
    await expect(page.getByRole("main").getByText(t("T-4302"))).toBeVisible();

    // Lo que registra la VP de GH queda avalado de una vez, a su nombre y por su cargo.
    const [recorded] = await getDb().select().from(sanction).where(eq(sanction.personId, f.target));
    await closeDb();
    expect(recorded).toMatchObject({
      kind: "MAJOR",
      cause: CAUSE,
      occurredOn: today,
      committeeId: null,
      status: "APPROVED",
      issuedById: member.id,
      decidedById: member.id,
      decidedAs: "HOLDER",
      revokedAt: null,
    });

    await page.getByRole("link", { name: f.name }).click();
    await sinViolaciones(page);
    await page.getByLabel(t("T-2240"), { exact: true }).fill(REASON);
    await page.getByRole("button", { name: revokeLabel, exact: true }).click();
    await expect(page.getByRole("main").getByText(t("T-4302"))).toBeVisible();

    const [revoked] = await getDb().select().from(sanction).where(eq(sanction.personId, f.target));
    expect(revoked).toMatchObject({
      id: recorded?.id,
      revokedById: member.id,
      revokeReason: REASON,
    });
    expect(revoked?.revokedAt).toBeInstanceOf(Date);
  });
});

test.describe("ADMIN", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("ve las sanciones en la Persona 360 sin poder registrarlas ni anularlas", async ({
    page,
  }) => {
    const f = await sancionable();
    await closeDb();

    await page.goto(`/admin/personas/${f.target}?pestana=membresia`);
    const [recordLabel = "", revokeLabel = ""] = tList("T-2232");
    await expect(page.getByText(t("T-5100"), { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: recordLabel, exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: revokeLabel, exact: true })).toHaveCount(0);
  });
});
