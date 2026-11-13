import { expect } from "@playwright/test";
import { eq, like } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { request } from "@/modules/crm/schema";
import { checkIn, occasion } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { seedCheckIn, seedOccasion, seedRequest } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El modo de campo (ADR-168) en el ancho de un celular: la ocasión de hoy con lo registrado y lo
// pendiente, el camino al modo anfitrión y sus pendientes, y la excusa que se aprueba con un toque.

test.use({ storageState: "tests/e2e/.auth/admin.json", viewport: { width: 390, height: 844 } });

const [campoTitulo] = tList("T-4909");
const [, escanear] = tList("T-4910");
const [excusasTitulo, aprobarExcusa] = tList("T-4912");
const [aprobar] = tList("T-592");

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
  const seeded = await db
    .select({ id: occasion.id })
    .from(occasion)
    .where(like(occasion.title, "e2e-Campo%"));
  for (const row of seeded) {
    await db.delete(request).where(eq(request.occasionId, row.id));
    await db.delete(checkIn).where(eq(checkIn.occasionId, row.id));
    await db.delete(occasion).where(eq(occasion.id, row.id));
  }
  await closeDb();
});

test("la ocasión de hoy lleva al modo anfitrión, donde se aprueba lo pendiente", async ({
  page,
}) => {
  const { termId, memberId } = await ids();
  const seeded = await seedOccasion(termId, {
    title: "e2e-Campo ocasión de hoy",
    approval: "MANUAL",
  });
  await seedCheckIn(seeded.id, memberId, "PENDING");

  await page.goto("/admin/campo");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(campoTitulo ?? "");
  const tarjeta = page
    .locator(".admin-campo-tarjeta")
    .filter({ hasText: "e2e-Campo ocasión de hoy" });
  await expect(tarjeta).toContainText(t("T-4911", { n: 0, p: 1 }));
  await sinViolaciones(page);
  await tarjeta.getByRole("link", { name: escanear, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/ocasiones/${seeded.id}/anfitrion`));

  const pendientes = page.getByRole("region", { name: new RegExp(`^${t("T-591")}`) });
  await expect(pendientes).toBeVisible();
  await pendientes.getByRole("button", { name: aprobar, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/ocasiones/${seeded.id}/anfitrion`));
  await expect(pendientes).toBeHidden();
  const [row] = await getDb()
    .select({ status: checkIn.status })
    .from(checkIn)
    .where(eq(checkIn.occasionId, seeded.id));
  expect(row?.status).toBe("APPROVED");
});

test("una excusa a tiempo se aprueba con un toque y vuelve al campo", async ({ page }) => {
  const { termId, memberId } = await ids();
  const seeded = await seedOccasion(termId, {
    title: "e2e-Campo asamblea con excusa",
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    points: 0,
    status: "CLOSED",
  });
  const requestId = await seedRequest(memberId, termId, "EXCUSE", {
    occasionId: seeded.id,
    payload: { occasionId: seeded.id, cause: "ACADEMIC", reason: "Parcial a la misma hora" },
  });

  await page.goto("/admin/campo");
  const excusas = page.getByRole("region", { name: excusasTitulo, exact: true });
  const tarjeta = excusas
    .locator(".admin-campo-tarjeta")
    .filter({ hasText: "e2e-Campo asamblea con excusa" });
  await expect(tarjeta).toBeVisible();
  await tarjeta.getByRole("button", { name: aprobarExcusa, exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/campo\?.*decidida=APPROVED/);
  await expect
    .poll(async () => {
      const [row] = await getDb()
        .select({ status: request.status })
        .from(request)
        .where(eq(request.id, requestId));
      return row?.status;
    })
    .toBe("APPROVED");
});

test("la Mesa ofrece el modo de campo en el celular y el menú lo lleva", async ({ page }) => {
  await page.goto("/admin/mesa");
  await expect(page.getByRole("link", { name: t("T-4916"), exact: true })).toBeVisible();
  await page.getByRole("button", { name: t("T-1402") }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: campoTitulo, exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByRole("link", { name: t("T-4916"), exact: true })).toBeHidden();
});
