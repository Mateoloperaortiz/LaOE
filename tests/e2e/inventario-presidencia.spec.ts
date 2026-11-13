import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { changeMembershipStatusAs } from "@/modules/people";
import { appointment, membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { leaveUntilSoon, seedAppointment, seedMembership, seedPerson } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// La Presidencia suple a la VP en el inventario (ADR-193, Reglamento art. 54). El miembro de pruebas es
// Presidencia solo durante la prueba. La semilla compartida ya trae una VP Administrativa en el semestre:
// la prueba la pasa a licencia con el comando de siempre, que es una de las ausencias de la ADR, y al
// final la devuelve a su estado. Sin VP activa, la Presidencia administra el inventario y lo ve dicho;
// en cuanto hay una VP, el inventario vuelve a ella.

test.use({ storageState: "tests/e2e/.auth/member.json" });

const marca = randomBytes(3).toString("hex");
const limpiar = {
  appointments: [] as string[],
  leaves: [] as Array<{ personId: string; status: "ACTIVE" | "HONORARY" }>,
  admin: null as string | null,
};

test.afterEach(async () => {
  const admin = limpiar.admin;
  for (const { personId, status } of limpiar.leaves.splice(0))
    if (admin)
      await changeMembershipStatusAs({ personId: admin, ip: null }, personId, {
        to: status,
        reason: "Vuelve de la licencia de la prueba de la Presidencia",
      });
  if (limpiar.appointments.length > 0)
    await getDb()
      .delete(appointment)
      .where(inArray(appointment.id, limpiar.appointments.splice(0)));
  await closeDb();
});

test("la Presidencia administra el inventario mientras no hay VP activa", async ({ page }) => {
  const [member] = await getDb().select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
  const [admin] = await getDb().select().from(person).where(eq(person.email, E2E_EMAIL));
  const [current] = await getDb().select().from(term).where(eq(term.code, E2E_TERM.code));
  if (!member || !admin || !current)
    throw new Error("Faltan las personas y el semestre sintéticos");
  limpiar.admin = admin.id;
  const vps = await getDb()
    .select({ personId: membership.personId, status: membership.status })
    .from(appointment)
    .innerJoin(membership, eq(membership.personId, appointment.personId))
    .where(
      and(
        eq(appointment.termId, current.id),
        eq(appointment.kind, "VP_ADMIN"),
        inArray(membership.status, ["ACTIVE", "HONORARY"]),
      ),
    );
  expect(vps.map((row) => row.personId)).not.toContain(member.id);
  for (const vp of vps) {
    await changeMembershipStatusAs({ personId: admin.id, ip: null }, vp.personId, {
      to: "ON_LEAVE",
      reason: "Licencia para la prueba de la Presidencia",
      leaveUntil: leaveUntilSoon(),
    });
    if (vp.status === "ACTIVE" || vp.status === "HONORARY")
      limpiar.leaves.push({ personId: vp.personId, status: vp.status });
  }
  limpiar.appointments.push(await seedAppointment(member.id, current.id, "PRESIDENT"));
  await closeDb();

  await page.goto("/admin/inventario");
  await expect(page.getByRole("heading", { level: 1, name: t("T-4303") })).toBeVisible();
  const [suple] = tList("T-5077");
  await expect(page.getByRole("main").getByText(suple ?? "", { exact: true })).toBeVisible();
  await sinViolaciones(page);

  // Llega una VP activa: el inventario vuelve a ella y la Presidencia ya no lo administra. Sigue en
  // la Operación por sus avales (ADR-195), así que el inventario la manda a su vista de Mi OE.
  const vp = await seedPerson(`e2e-vp-presidencia-${marca}@eafit.edu.co`, {
    firstName: "Vicepresidencia",
    lastName: `Sintética ${marca}`,
    source: "E2E",
  });
  await seedMembership(vp, current.id);
  limpiar.appointments.push(await seedAppointment(vp, current.id, "VP_ADMIN"));
  await closeDb();
  await page.goto("/admin/inventario");
  await expect(page).toHaveURL(/\/app\/inventario$/);
  await expect(page.getByText(suple ?? "", { exact: true })).toHaveCount(0);
});
