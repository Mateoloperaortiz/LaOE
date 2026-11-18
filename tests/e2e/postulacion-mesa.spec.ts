import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { appointment, person } from "@/modules/people/schema";
import { getCurrentTerm } from "@/modules/terms";
import { tList } from "@/shared/copy";
import { seedAppointment, seedCommittee } from "../factories";
import { test } from "./fixtures";
import { E2E_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/member.json" });
test("el miembro pide el aval en Comités y la VP de Gestión Humana lo decide desde la Mesa", async ({
  page,
  browser,
}) => {
  const term = await getCurrentTerm();
  const [vp] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  if (!term || !vp) throw new Error("Faltan la junta y el semestre de pruebas");
  const key = randomBytes(4).toString("hex");
  const name = `Comité de postulación ${key}`;
  const committee = await seedCommittee(`candidatura-${key}`, name);
  const seat = await seedAppointment(vp.id, term.id, "VP_GH");
  const operations = await browser.newContext({
    storageState: "tests/e2e/.auth/admin.json",
  });
  try {
    await page.goto("/app/comites");
    const area = page.locator("#postulaciones");
    const [, , committeeLabel, roleLabel, submit] = tList("T-5154");
    await area.getByLabel(committeeLabel, { exact: true }).selectOption(committee);
    await area.getByLabel(roleLabel, { exact: true }).selectOption("LOGISTICA");
    await area.getByRole("button", { name: submit }).click();
    await expect(area.getByRole("listitem").filter({ hasText: name })).toContainText("Pendiente");
    const board = await operations.newPage();
    await board.goto(new URL("/admin/mesa", page.url()).href);
    await board.getByRole("link").filter({ hasText: name }).click();
    const [approve] = tList("T-5086");
    await board.getByRole("button", { name: approve, exact: true }).click();
    await expect(board.getByRole("button", { name: approve, exact: true })).toHaveCount(0);
    await page.reload();
    await expect(area.getByRole("listitem").filter({ hasText: name })).toContainText("Aprobado");
  } finally {
    await operations.close();
    await getDb().delete(appointment).where(eq(appointment.id, seat));
    await closeDb();
  }
});
