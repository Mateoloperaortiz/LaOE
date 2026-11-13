import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { task } from "@/modules/crm/schema";
import { person } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedPerson, seedTask, seedWorkGroup, seedWorkGroupMembership } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// La Mesa (ADR-159 regla 3, tramo O2): junta lo que le toca a cada actor, lleva cada elemento a su
// pantalla de origen y suma sus pendientes en el contador de la barra superior.

const [tusTareas, , , , evaluacionesTitulo] = tList("T-4866");
const [, vencio] = tList("T-4871");
const contador = /^Mesa: \d+ pendientes?$/;

async function personId(email: string): Promise<string> {
  const [row] = await getDb().select({ id: person.id }).from(person).where(eq(person.email, email));
  if (!row) throw new Error("Falta una identidad sintética");
  return row.id;
}

test.afterAll(async () => {
  await closeDb();
});

test.describe("ADMIN", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("ve su tarea vencida arriba, con su fecha, y la abre en su pantalla", async ({ page }) => {
    const db = getDb();
    const tarea = await seedTask("e2e-Mesa: tarea vencida", {
      assigneeId: await personId(E2E_EMAIL),
      dueAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });
    try {
      await page.goto("/admin/mesa");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-4864"));
      await expect(
        page.locator(".admin-sidebar nav").getByRole("link", { name: t("T-4864"), exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect(page.locator(".admin-topbar a[href='/admin/mesa']")).toHaveAccessibleName(
        contador,
      );
      const tareas = page.getByRole("region", { name: new RegExp(`^${tusTareas}`) });
      const fila = tareas.getByRole("link", { name: /e2e-Mesa: tarea vencida/ });
      await expect(fila).toContainText(vencio?.split(" {fecha}")[0] ?? "");
      await sinViolaciones(page);
      await fila.click();
      await expect(page).toHaveURL(/\/admin\/tareas$/);
    } finally {
      await db.delete(task).where(eq(task.id, tarea));
    }
  });
});

test.describe("evaluador de un grupo", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("ve solo sus evaluaciones pendientes, que llevan a su bandeja", async ({ page }) => {
    const db = getDb();
    const [current] = await db
      .select({ id: term.id })
      .from(term)
      .where(eq(term.code, E2E_TERM.code));
    if (!current) throw new Error("Falta el término sintético");
    const evaluado = await seedPerson("e2e-mesa-evaluado@eafit.edu.co");
    const group = await seedWorkGroup(current.id, "e2e-Mesa del evaluador", {
      evaluatorIds: [await personId(E2E_MEMBER_EMAIL)],
    });
    await seedWorkGroupMembership(group, evaluado);
    try {
      await page.goto("/admin/mesa");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-4864"));
      await expect(page.getByRole("region", { name: new RegExp(`^${tusTareas}`) })).toHaveCount(0);
      const evaluaciones = page.getByRole("region", {
        name: new RegExp(`^${evaluacionesTitulo}`),
      });
      await expect(
        evaluaciones.getByRole("link", { name: tList("T-4870")[0].replace("{n}", "1") }),
      ).toHaveAttribute("href", "/admin/permanencia/evaluaciones");
      await expect(page.locator(".admin-topbar a[href='/admin/mesa']")).toHaveAccessibleName(
        contador,
      );
      await sinViolaciones(page);
    } finally {
      await db.delete(workGroup).where(eq(workGroup.id, group));
      await db.delete(person).where(eq(person.id, evaluado));
    }
  });
});
