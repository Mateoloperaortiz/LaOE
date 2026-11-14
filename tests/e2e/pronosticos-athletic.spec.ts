import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { adjustPointsAs } from "@/modules/participation";
import { occasion } from "@/modules/participation/schema";
import { appointment, person } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { seedAppointment, seedCheckIn, seedOccasion, seedWorkGroup } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Los pronósticos del Athletic (ADR-197 regla 7): Gestión Humana fija el tope, quien lidera el
// Athletic crea y abre el pronóstico de un partido, y quien registró su asistencia pronostica desde
// Mi OE con sus GH Points. El miembro de pruebas tiene los tres papeles solo durante la prueba.

const marca = randomBytes(3).toString("hex");
const partido = `e2e-Partido ${marca}`;
const cargos: string[] = [];
let grupo: { id: string; created: boolean; leader: string | null } | null = null;

test.afterEach(async () => {
  const db = getDb();
  if (cargos.length > 0)
    await db.delete(appointment).where(inArray(appointment.id, cargos.splice(0)));
  await db.delete(occasion).where(eq(occasion.title, partido));
  if (grupo?.created) await db.delete(workGroup).where(eq(workGroup.id, grupo.id));
  else if (grupo) {
    await db
      .update(workGroup)
      .set({ leaderPersonId: grupo.leader })
      .where(eq(workGroup.id, grupo.id));
  }
  grupo = null;
  await closeDb();
});

test.describe("el Athletic, Gestión Humana y quien asiste", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("fijan el tope, abren un pronóstico y pronostican con GH Points", async ({ page }) => {
    const db = getDb();
    const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
    const [member] = await db.select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!current || !member) throw new Error("Faltan el semestre y el miembro sintéticos");
    cargos.push(await seedAppointment(member.id, current.id, "VP_GH"));
    const [athletic] = await db
      .select()
      .from(workGroup)
      .where(and(eq(workGroup.termId, current.id), eq(workGroup.code, "ATHLETIC")));
    if (athletic) {
      grupo = { id: athletic.id, created: false, leader: athletic.leaderPersonId };
      await db
        .update(workGroup)
        .set({ leaderPersonId: member.id })
        .where(eq(workGroup.id, athletic.id));
    } else {
      const id = await seedWorkGroup(current.id, "Athletic", {
        kind: "WORK_COMMITTEE",
        code: "ATHLETIC",
        leaderPersonId: member.id,
      });
      grupo = { id, created: true, leader: null };
    }
    const match = await seedOccasion(current.id, {
      title: partido,
      category: "ATHLETIC_MATCH",
      startsAt: new Date(Date.now() + 2 * 3_600_000),
    });
    await seedCheckIn(match.id, member.id, "PENDING");
    await adjustPointsAs(
      { personId: member.id, ip: null },
      { personId: member.id, termId: current.id, points: 5, reason: "e2e-Saldo para pronosticar" },
    );
    await closeDb();

    const [titulo, , , topeCampo, guardarTope] = tList("T-5146");
    const [, queCampo, opcionesCampo, crear, abrir] = tList("T-5147");
    const listo = tList("T-4302")[0] ?? "";

    await page.goto("/admin/pronosticos");
    await expect(page.getByRole("heading", { level: 1, name: titulo ?? "" })).toBeVisible();
    await page.getByLabel(topeCampo ?? "", { exact: true }).fill("20");
    await page.getByRole("button", { name: guardarTope ?? "", exact: true }).click();
    await expect(page.getByText(listo, { exact: true })).toBeVisible();

    const seccion = page.getByRole("region", { name: partido });
    await seccion.getByLabel(queCampo ?? "", { exact: true }).fill("Resultado");
    await seccion
      .getByLabel(opcionesCampo ?? "", { exact: true })
      .fill("Gana la OE\nEmpate\nPierde la OE");
    await seccion.getByRole("button", { name: crear ?? "", exact: true }).click();
    const pronostico = page
      .getByRole("region", { name: partido })
      .getByRole("article", { name: "Resultado" });
    await pronostico.getByRole("button", { name: abrir ?? "", exact: true }).click();
    await expect(
      page.getByRole("region", { name: partido }).getByRole("article", { name: "Resultado" }),
    ).toContainText(tList("T-5148")[1] ?? "");
    await sinViolaciones(page);

    const [, , , , sencillo, , cuanto, pronosticar, , , , , hecho] = tList("T-5150");
    await page.goto("/app/pronosticos");
    const enMiOe = page.getByRole("region", { name: partido });
    await enMiOe.getByLabel(sencillo ?? "", { exact: true }).selectOption({ label: "Empate" });
    await enMiOe
      .getByLabel(cuanto ?? "", { exact: true })
      .first()
      .fill("5");
    await enMiOe
      .getByRole("button", { name: pronosticar ?? "", exact: true })
      .first()
      .click();
    await expect(page.getByText(hecho ?? "", { exact: true })).toBeVisible();
    await expect(page.getByText(`${tList("T-5151")[0] ?? ""} · 5`)).toBeVisible();
    await sinViolaciones(page);
  });
});
