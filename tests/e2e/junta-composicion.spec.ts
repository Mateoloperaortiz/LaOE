import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { permission } from "@/modules/identity/schema";
import { APPOINTMENT_KINDS } from "@/modules/people";
import { person } from "@/modules/people/schema";
import { tLabels, tList } from "@/shared/copy";
import { seedPermission } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// La junta del semestre y sus comités de trabajo (ADR-194): ADMIN ve los seis cargos de los Estatutos
// con su comité de trabajo; quien solo tiene BOARD sigue viendo el panel de agregados y no entra acá,
// porque esta vista lleva nombres (ADR-036 regla 12).

const [titulo] = tList("T-5078");
const SEATS = [
  "PRESIDENT",
  "VP_ADMIN",
  "VP_FINANCE",
  "VP_PUBLIC_RELATIONS",
  "VP_COMMUNICATIONS",
  "VP_GH",
] as const;

test.describe("como ADMIN", () => {
  test.use({ storageState: "tests/e2e/.auth/admin.json" });

  test("muestra los seis cargos de la junta con su comité de trabajo", async ({ page }) => {
    await page.goto("/admin/junta/composicion");
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible();
    const tabla = page.getByRole("region", { name: titulo });
    const kinds = tLabels("T-444", APPOINTMENT_KINDS);
    await expect(tabla.getByRole("rowheader")).toHaveText(SEATS.map((kind) => kinds[kind]));
    const ccm = tabla.getByRole("row", { name: new RegExp(kinds.VP_COMMUNICATIONS) });
    await expect(ccm).toContainText("(CCM)");
    await expect(
      tabla.getByRole("row", { name: new RegExp(kinds.VP_PUBLIC_RELATIONS) }),
    ).toContainText("(CAE)");
    await sinViolaciones(page);
  });
});

test.describe("con BOARD y sin ADMIN", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });
  let concedido: string | null = null;

  test.afterEach(async () => {
    if (concedido) await getDb().delete(permission).where(eq(permission.id, concedido));
    concedido = null;
    await closeDb();
  });

  test("no entra a la vista con nombres", async ({ page }) => {
    const [member] = await getDb()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!member) throw new Error("Falta el miembro de pruebas");
    concedido = await seedPermission(member.id, "BOARD");
    await closeDb();
    await page.goto("/admin/junta/composicion");
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: titulo })).toHaveCount(0);
  });
});
