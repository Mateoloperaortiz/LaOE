import { expect, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { getBudgetSummary, listContracts } from "@/modules/finance";
import {
  approveBudgetAs,
  createBudgetAs,
  openBudgetAs,
  setBudgetLinesAs,
} from "@/modules/finance/domain/commands";
import { person } from "@/modules/people/schema";
import { deleteObject } from "@/shared/adapters/storage";
import { t, tList } from "@/shared/copy";
import { seedAppointment, seedApprovedBudgetEvent, seedCommittee, seedTerm } from "../factories";
import { E2E_CALENDAR } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

test("el comité adjunta el contrato y los dos respaldos y la VP registra su firma desde la Mesa", async ({
  page,
  browser,
}) => {
  await appointVp();
  const committeeId = await seedCommittee("teatro-contratos", "Teatro de contratos");
  const fields = tList("T-5171");
  const fileLabels = tList("T-5172");
  const slots = ["contract", "legal", "coordinator"] as const;
  const title = "Contrato de escenario sintético";
  await page.goto("/admin/comites/teatro-contratos?area=finanzas");
  const section = page.getByRole("region", { name: fields[0], exact: true });
  await section.getByLabel(fields[1], { exact: true }).fill(title);
  await section.getByLabel(fields[2], { exact: true }).fill("Proveedor sintético");
  await section.getByLabel(fields[3], { exact: true }).fill("10800");
  for (const [index, slot] of slots.entries()) {
    await section.getByLabel(fileLabels[index] ?? "", { exact: true }).setInputFiles({
      name: `${slot}.pdf`,
      mimeType: "application/pdf",
      buffer: Buffer.from(`%PDF-1.4\nRespaldo sintético de ${slot}\n%%EOF`),
    });
  }
  const scope = { committeeId };
  try {
    await section.getByRole("button", { name: fields[4], exact: true }).click();
    await expect(page.getByRole("status")).toContainText(tList("T-5175")[2]);
    const context = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
    const vp = await context.newPage();
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await vp.goto(new URL("/admin/mesa", page.url()).href);
    await vp.getByRole("link").filter({ hasText: title }).click();
    for (const [index, slot] of slots.entries()) {
      const href = await vp
        .getByRole("link", { name: `${fileLabels[index]} · ${slot}.pdf`, exact: true })
        .getAttribute("href");
      if (!href) throw new Error("Falta el enlace al archivo");
      const url = new URL(href, page.url()).href;
      const response = await vp.request.get(url);
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain(`Respaldo sintético de ${slot}`);
      expect(response.headers()["content-disposition"]).toContain("attachment");
      expect((await visitor.request.get(url, { maxRedirects: 0 })).status()).toBe(401);
    }
    await visitor.close();
    await vp.getByRole("button", { name: fields[5], exact: true }).click();
    await expect(vp).toHaveURL(/guardado=1/);
    await page.reload();
    await expect(section).toContainText(tList("T-5173")[1]);
    expect((await listContracts(scope))[0]).toMatchObject({
      title,
      status: "APPROVED",
      decidedSeat: "VP_FINANCE",
    });
    await context.close();
  } finally {
    for (const row of await listContracts(scope)) {
      await Promise.all(
        slots.map((slot) =>
          deleteObject(`contracts/files/${row.id}/${slot}/${row.files[slot].digest}`),
        ),
      );
    }
  }
});

const year = Number(E2E_CALENDAR.day.slice(0, 4));
const operator = { personId: null, ip: null };
async function appointVp() {
  const [vp] = await getDb()
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  if (!vp) throw new Error("Falta la identidad de la VP");
  await seedAppointment(vp.id, await seedTerm(), "VP_FINANCE");
}
async function approveFromDesk(vp: Page, origin: string, name: string) {
  await vp.goto(new URL("/admin/mesa", origin).href);
  await vp.getByRole("link").filter({ hasText: name }).click();
  await vp.getByRole("button", { name: tList("T-5086")[0], exact: true }).click();
  await expect(vp).toHaveURL(/guardado=1/);
}

test("el comité solicita la reasignación y los saldos cambian cuando la VP la aprueba en su Mesa", async ({
  page,
  browser,
}) => {
  await appointVp();
  const committeeId = await seedCommittee("teatro-finanzas", "Teatro financiero");
  const { id } = await createBudgetAs(operator, { committeeId, year });
  await setBudgetLinesAs(operator, id, {
    lines: [
      { name: "Luces", assigned: 100 },
      { name: "Sonido", assigned: 25 },
    ],
  });
  for (const approver of ["STUDENT_DEVELOPMENT", "VP_FINANCE"] as const)
    await approveBudgetAs(operator, id, { approver, on: E2E_CALENDAR.day });
  await openBudgetAs(operator, id);
  const eventOn = `${year}-12-31`;
  const event = await seedApprovedBudgetEvent({
    committeeId,
    budgetId: id,
    title: "Cierre teatral",
    eventOn,
    decidedAt: new Date(),
  });
  await page.goto("/admin/comites/teatro-finanzas?area=finanzas");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: t("T-2193"), exact: true }) });
  const [from, to, amount, reason] = tList("T-2195");
  const eventSelector = form.getByLabel(t("T-2334"), { exact: true });
  if (E2E_CALENDAR.day === eventOn) {
    // Al cierre del año ya no queda un evento futuro de este presupuesto por seleccionar.
    await expect(eventSelector.locator("option")).toHaveCount(1);
    return;
  }
  await form.getByLabel(from, { exact: true }).selectOption({ label: "Luces" });
  await form.getByLabel(to, { exact: true }).selectOption({ label: "Sonido" });
  await form.getByLabel(amount, { exact: true }).fill("40");
  await form.getByLabel(reason, { exact: true }).fill("Cubrir el sonido de la obra");
  await eventSelector.selectOption(event.id);
  await form.getByRole("button", { name: t("T-2193"), exact: true }).click();
  await expect(page.getByRole("status")).toContainText(t("T-2199"));
  expect((await getBudgetSummary(id))?.transfers).toHaveLength(0);
  const context = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
  await approveFromDesk(await context.newPage(), page.url(), "Luces → Sonido");
  await page.reload();
  await expect(page.getByRole("region", { name: tList("T-5159")[0] })).toContainText("Aprobado");
  expect((await getBudgetSummary(id))?.lines.map((line) => line.available)).toEqual([60, 65]);
  await context.close();
});

test("el presupuesto extraordinario recibe el aval de la VP y la aprobación de Desarrollo Estudiantil antes de abrir", async ({
  page,
  browser,
}) => {
  await appointVp();
  const committeeId = await seedCommittee("musica-finanzas", "Música");
  const { id } = await createBudgetAs(operator, {
    committeeId,
    year,
    kind: "EXTRAORDINARY",
    title: "Función adicional",
    submittedOn: E2E_CALENDAR.day,
  });
  await setBudgetLinesAs(operator, id, { lines: [{ name: "Escenario", assigned: 800 }] });
  await page.goto(`/admin/presupuestos/${id}`);
  const [heading, ask] = tList("T-5159");
  await page.getByRole("button", { name: ask, exact: true }).click();
  const history = page.getByRole("region", { name: heading, exact: true });
  await expect(history).toContainText("Pendiente");
  const context = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
  await approveFromDesk(await context.newPage(), page.url(), "Función adicional");
  await page.reload();
  await expect(history).toContainText("Aprobado");
  const [register, open] = tList("T-2303");
  await page.getByRole("button", { name: open, exact: true }).click();
  expect((await getBudgetSummary(id))?.budget.status).toBe("DRAFT");
  await page.getByRole("button", { name: register, exact: true }).click();
  await page.getByRole("button", { name: open, exact: true }).click();
  await expect(page.getByRole("button", { name: tList("T-2303")[2], exact: true })).toBeVisible();
  expect((await getBudgetSummary(id))?.budget.status).toBe("OPEN");
  await context.close();
});
