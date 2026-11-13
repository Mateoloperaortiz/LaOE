import { expect } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { adjustPointsAs, giveApplauseAs } from "@/modules/participation";
import { createGoal, createReward } from "@/modules/participation/domain/goals";
import {
  applause,
  collectiveGoal,
  leagueStanding,
  thresholdReward,
} from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { seedCommittee, seedCommitteeMembership, seedMember } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// La capa social (ADR-175 a ADR-178) en Mi OE: prender la actividad, aplaudir en el muro del comité,
// ver un aplauso recibido en «Yo», la meta del parche en «Hoy», reclamar una recompensa y la liga.

test.use({ storageState: "tests/e2e/.auth/member.json" });
test.describe.configure({ mode: "serial" });

const [, casilla, , guardarComunidad] = tList("T-4965");
const [aplaudir, aQuien, mensaje] = tList("T-4972");
const [, reclamar, reclamada] = tList("T-4978");

async function ids() {
  const db = getDb();
  const [termRow] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!termRow || !member) throw new Error("Falta el semestre o el miembro sintético");
  return { termId: termRow.id, memberId: member.id };
}

test.afterAll(async () => {
  const db = getDb();
  const { memberId } = await ids();
  await db.update(person).set({ socialVisible: false }).where(eq(person.id, memberId));
  await db.delete(applause).where(eq(applause.toPersonId, memberId));
  await db.delete(applause).where(eq(applause.fromPersonId, memberId));
  await db.delete(leagueStanding).where(eq(leagueStanding.personId, memberId));
  await db.delete(collectiveGoal).where(like(collectiveGoal.title, "e2e-Social%"));
  await db.delete(thresholdReward).where(like(thresholdReward.title, "e2e-Social%"));
  await closeDb();
});

test("prender la actividad abre la liga, que empieza en Bronce", async ({ page }) => {
  await page.goto("/app/ajustes#notificaciones");
  await page.getByRole("checkbox", { name: casilla, exact: true }).check();
  await page.getByRole("button", { name: guardarComunidad, exact: true }).click();
  await expect(page.getByText(tList("T-4966")[0] ?? "", { exact: true })).toBeVisible();

  await page.goto("/app/juegos/liga");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(tList("T-4983")[0] ?? "");
  await sinViolaciones(page);
});

test("se aplaude en el muro del comité y un aplauso recibido sale en «Yo»", async ({ page }) => {
  const { termId, memberId } = await ids();
  const committeeId = await seedCommittee("e2e-social-muro", "Comité Social E2E");
  const mate = await seedMember("companera.social@eafit.edu.co");
  await seedCommitteeMembership(memberId, committeeId, termId);
  await seedCommitteeMembership(mate, committeeId, termId);

  await page.goto("/app/comites/e2e-social-muro/muro");
  await page.getByLabel(aQuien ?? "", { exact: true }).selectOption({ index: 0 });
  await page.getByLabel(mensaje ?? "", { exact: true }).fill("Gracias por la logística de ayer");
  await page.getByRole("button", { name: aplaudir, exact: true }).click();
  await expect(page).toHaveURL(/aplauso=1/);
  await sinViolaciones(page);

  await giveApplauseAs(
    { personId: mate, ip: null },
    { toPersonId: memberId, committeeId, message: "Qué berraca la presentación" },
  );
  await page.goto("/app/yo");
  await expect(page.getByText("Qué berraca la presentación")).toBeVisible();
});

test("la meta del parche sale en «Hoy» y una recompensa alcanzada se reclama", async ({ page }) => {
  const { termId, memberId } = await ids();
  await runCommand({ personId: memberId, ip: null }, (ctx) =>
    createGoal(ctx, {
      title: "e2e-Social cien asistencias",
      metric: "CHECKINS",
      target: 100_000,
      startsOn: "2020-01-01",
      endsOn: "2099-12-31",
    }),
  );
  await runCommand({ personId: memberId, ip: null }, (ctx) =>
    createReward(ctx, { termId, points: 1, title: "e2e-Social sticker" }),
  );
  await adjustPointsAs(
    { personId: memberId, ip: null },
    { personId: memberId, termId, points: 1, reason: "E2E capa social" },
  );

  await page.goto("/app");
  await expect(page.getByRole("region", { name: tList("T-4975")[0], exact: true })).toContainText(
    "e2e-Social cien asistencias",
  );

  await page.goto("/app/gh-points");
  const recompensa = page.locator("#recompensas li").filter({ hasText: "e2e-Social sticker" });
  await recompensa.getByRole("button", { name: reclamar, exact: true }).click();
  await expect(
    page.locator("#recompensas li").filter({ hasText: "e2e-Social sticker" }),
  ).toContainText(reclamada ?? "");
});
