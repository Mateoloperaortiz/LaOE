import { expect } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { runCommand } from "@/db/tx";
import { adjustPointsAs } from "@/modules/participation";
import { pointEntry } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { closeTermPoints } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedTerm, seedTermStanding } from "../factories";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { E2E_CALENDAR, E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// GH Points en Mi OE como miembro (ADR-035 reglas 9 y 10): saldo, nivel, movimientos y rankings.
test.use({ storageState: "tests/e2e/.auth/member.json" });

test.beforeEach(async () => {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  const [admin] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  if (!current || !member || !admin) throw new Error("sin término, miembro o admin");
  // El worker puede reintentar la prueba; el ajuste sintético sigue siendo uno solo. Lo escribe el
  // libro, que es el único escritor de los puntos (ADR-119 regla 8), y por eso no se borra y se
  // vuelve a escribir: si ya está, se deja.
  const [adjusted] = await db
    .select({ id: pointEntry.id })
    .from(pointEntry)
    .where(
      and(
        eq(pointEntry.personId, member.id),
        eq(pointEntry.termId, current.id),
        eq(pointEntry.reason, "e2e-Ajuste de prueba"),
      ),
    );
  if (!adjusted) {
    await adjustPointsAs(
      { personId: admin.id, ip: null },
      { personId: member.id, termId: current.id, points: 15, reason: "e2e-Ajuste de prueba" },
    );
  }
  await closeDb();
});

test("el miembro ve su saldo, su nivel, sus movimientos y los rankings", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText(copyPattern("T-065"))).toBeVisible();
  await page.getByRole("link", { name: t("T-555") }).click();
  await page.waitForURL(/\/app\/gh-points$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-080"));
  await expect(page.getByRole("heading", { name: copyPattern("T-081") })).toBeVisible();
  await expect(page.getByText(copyPattern("T-535"))).toBeVisible();
  await expect(page.getByText("e2e-Ajuste de prueba")).toBeVisible();
  await expect(page.getByText(t("T-559"))).toBeVisible();
  await sinViolaciones(page);
  const tableros = page.getByRole("navigation", { name: t("T-539") });
  await tableros.getByRole("link", { name: tList("T-083")[2], exact: true }).click();
  await expect(page).toHaveURL(/tablero=comites/);
  await tableros.getByRole("link", { name: tList("T-083")[1], exact: true }).click();
  await expect(page.getByText(copyPattern("T-551"))).toBeVisible();
});

test("el semestre histórico conserva Pilar con 500 GH y distingue un cierre sin foto de constancia", async ({
  page,
}) => {
  const historicalId = await seedTerm(E2E_CALENDAR.previous.code, E2E_CALENDAR.previous);
  const [member] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  const [admin] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  if (!member || !admin) throw new Error("Faltan identidades sintéticas de la historia");
  await adjustPointsAs(
    { personId: admin.id, ip: null },
    { personId: member.id, termId: historicalId, points: 500, reason: "Saldo histórico sintético" },
  );
  await page.goto(`/app/gh-points?semestre=${historicalId}`);
  await expect(
    page.getByText(t("T-535", { nivel: tList("T-082")[3] ?? "" }), { exact: false }),
  ).toBeVisible();
  await page.getByText(t("T-3435"), { exact: true }).click();
  await expect(page.getByText(t("T-3436", { n: 1000 }), { exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3436", { n: 75 }), { exact: true })).toHaveCount(0);

  // Formato de cierre previo a ADR-131: mantiene su saldo y no inventa reconocimiento presencial.
  await runCommand({ personId: admin.id, ip: null }, (ctx) => closeTermPoints(ctx, historicalId));
  await seedTermStanding({
    termId: historicalId,
    topNew: [],
    topVeteran: [],
    topCommittees: [],
    stats: { activeMembers: 1, newMembers: 0, occasions: 0, checkIns: 0, pointsAwarded: 500 },
  });
  await page.reload();
  await expect(page.getByRole("heading", { name: t("T-081", { n: 500 }) })).toBeVisible();
  await expect(page.getByText(t("T-3469"), { exact: true })).toBeVisible();
  await expect(page.getByText(t("T-3462"), { exact: true })).toHaveCount(0);
  await expect(page.getByText(t("T-3447", { n: 0 }), { exact: true })).toHaveCount(0);
  await sinViolaciones(page);
  await closeDb();
});
