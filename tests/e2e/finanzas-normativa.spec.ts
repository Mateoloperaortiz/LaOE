import { expect } from "@playwright/test";
import { asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { getBudgetSummary } from "@/modules/finance/domain/budgets";
import {
  approveBudgetAs,
  createBudgetAs,
  openBudgetAs,
  setBudgetLinesAs,
} from "@/modules/finance/domain/commands";
import { committee } from "@/modules/people/schema";
import { sinViolaciones } from "./axe";
import { E2E_CALENDAR } from "./calendar";
import { test } from "./fixtures";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("finanzas exige presolicitud, registra el gasto y pide aval para trasladar", async ({
  page,
}) => {
  const [home] = await getDb()
    .select()
    .from(committee)
    .where(eq(committee.status, "ACTIVE"))
    .orderBy(asc(committee.name))
    .limit(1);
  if (!home) throw new Error("Falta comité sintético");
  const actor = { personId: null };
  const { id } = await createBudgetAs(actor, {
    committeeId: home.id,
    year: Number(E2E_CALENDAR.day.slice(0, 4)),
  });
  await setBudgetLinesAs(actor, id, {
    lines: [
      { name: "Logística", assigned: 1000 },
      { name: "Alimentación", assigned: 500 },
    ],
  });
  for (const approver of ["STUDENT_DEVELOPMENT", "VP_FINANCE"] as const) {
    await approveBudgetAs(actor, id, { approver, on: E2E_CALENDAR.day });
  }
  await openBudgetAs(actor, id);
  await closeDb();
  await page.goto(`/admin/comites/${home.slug}?area=finanzas`);
  const expense = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Registrar gasto", exact: true }) });
  await expense.getByLabel("Monto", { exact: true }).fill("100");
  await expense.getByLabel("Descripción", { exact: true }).fill("Gasto operativo sintético");
  await expense.getByRole("button", { name: "Registrar gasto", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sin presolicitud" })).toBeVisible();
  await page.getByRole("button", { name: "Registrar presolicitud", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Presolicitud registrada");
  await expense.getByLabel("Monto", { exact: true }).fill("100");
  await expense.getByLabel("Descripción", { exact: true }).fill("Gasto operativo sintético");
  await expense.getByRole("button", { name: "Registrar gasto", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Gasto registrado");
  await expect(page.getByLabel("Aval aprobado del evento", { exact: true })).toHaveAttribute(
    "required",
    "",
  );
  await sinViolaciones(page);
  const summary = await getBudgetSummary(id);
  expect(summary?.expenses).toHaveLength(1);
  expect(summary?.totals).toEqual({ assigned: 1500, spent: 100, available: 1400 });
  expect(summary?.transfers).toHaveLength(0);
});
