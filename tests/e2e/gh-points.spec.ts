import { expect, test } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pointEntry } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// GH Points en Mi OE como miembro (ADR-035 reglas 9 y 10): saldo, nivel, movimientos y rankings.
test.use({ storageState: "tests/e2e/.auth/member.json" });

test.beforeAll(async () => {
  const db = getDb();
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!current || !member) throw new Error("sin término o miembro");
  // El worker puede reintentar la prueba; el ajuste sintético sigue siendo uno solo.
  await db
    .delete(pointEntry)
    .where(
      and(
        eq(pointEntry.personId, member.id),
        eq(pointEntry.termId, current.id),
        eq(pointEntry.reason, "e2e-Ajuste de prueba"),
      ),
    );
  await db.insert(pointEntry).values({
    personId: member.id,
    termId: current.id,
    kind: "ADJUSTMENT",
    points: 15,
    reason: "e2e-Ajuste de prueba",
  });
  await closeDb();
});

test("el miembro ve su saldo, su nivel, sus movimientos y los rankings", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText(/[0-9]+ GH Points este semestre/)).toBeVisible();
  await page.getByRole("link", { name: "Ver GH Points" }).click();
  await page.waitForURL(/\/app\/gh-points$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("GH Points");
  await expect(
    page.getByRole("heading", { name: /Tenés [0-9]+ puntos este semestre/ }),
  ).toBeVisible();
  await expect(page.getByText(/Nivel: /)).toBeVisible();
  await expect(page.getByText("e2e-Ajuste de prueba")).toBeVisible();
  await expect(page.getByText("Tu puesto")).toBeVisible();
  await sinViolaciones(page);
  const tableros = page.getByRole("navigation", { name: "Rankings del semestre" });
  await tableros.getByRole("link", { name: "Comités", exact: true }).click();
  await expect(page.getByText(/ajustada para que los comités chicos/)).toBeVisible();
  await tableros.getByRole("link", { name: "Veteranos", exact: true }).click();
  await expect(page.getByText(/Veteranos: todos los demás/)).toBeVisible();
});
