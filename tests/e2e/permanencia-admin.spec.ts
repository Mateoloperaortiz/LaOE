import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Grupos de trabajo (ADR-036 regla 6): GH crea un grupo, importa miembros desde un CSV y siembra los
// comités de trabajo; el líder del grupo entra al admin recortado y opera solo el suyo.

test.describe("GH", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("crea un grupo, importa un CSV con el correo del miembro y siembra los comités de trabajo", async ({
    page,
  }) => {
    await page.goto("/admin/permanencia/grupos?nuevo=1");
    const panel = page.getByRole("dialog");
    await panel.getByLabel("Semestre").selectOption({ label: E2E_TERM.code });
    await panel.getByLabel("Tipo").selectOption("GAP");
    await panel.getByLabel("Nombre").fill("e2e-GAP de prueba");
    await panel.getByRole("button", { name: "Guardar" }).click();
    await expect(page.getByText("Guardado.")).toBeVisible();
    await page.getByRole("link", { name: "e2e-GAP de prueba" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e-GAP de prueba");
    await expect(
      page.getByText("Sin evaluador: GH debe asignar al director del frente."),
    ).toBeVisible();
    await sinViolaciones(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "grupo.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(`CORREO\n${E2E_MEMBER_EMAIL}\nnadie-e2e@eafit.edu.co\n`),
    });
    await page.getByRole("button", { name: "Cargar archivo" }).click();
    await expect(
      page.getByText(
        /1 para agregar · 0 ya estaban · 0 sin membresía activa · 1 correos desconocidos/,
      ),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirmar importación" }).click();
    await expect(page.getByText("1 personas agregadas al grupo.")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: /Miembros · 1/ })).toBeVisible();

    await page.goto("/admin/permanencia/grupos");
    await page.getByRole("button", { name: /Sembrar comités de trabajo/ }).click();
    await expect(page.getByText(`comités de trabajo creados para ${E2E_TERM.code}`)).toBeVisible();
    await sinViolaciones(page);
  });
});

test.describe("líder de grupo", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  let groupId = "";

  test.beforeEach(async () => {
    const db = getDb();
    const [member] = await db
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    const [current] = await db
      .select({ id: term.id })
      .from(term)
      .where(eq(term.code, E2E_TERM.code));
    if (!member || !current) throw new Error("sin miembro o término");
    const [row] = await db
      .insert(workGroup)
      .values({
        termId: current.id,
        kind: "GT_MACROEVENT",
        name: "e2e-GT que lidero",
        leaderPersonId: member.id,
      })
      .returning({ id: workGroup.id });
    if (!row) throw new Error("sin grupo");
    groupId = row.id;
    await closeDb();
  });

  test("entra derecho a su grupo y no ve el resto del admin", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(new RegExp(`/admin/permanencia/grupos/${groupId}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("e2e-GT que lidero");
    await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
    await expect(page.getByRole("button", { name: "Guardar evaluadores" })).toHaveCount(0);
    await sinViolaciones(page);

    await page.goto("/admin/permanencia/grupos");
    await expect(page).toHaveURL(/\/app$/);
  });
});
