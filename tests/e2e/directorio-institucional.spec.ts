import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { organization } from "@/modules/crm/schema";
import { appointment, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { seedAppointment } from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El directorio institucional (ADR-197 regla 3): la Presidencia crea una dependencia, suma a una
// persona con su cargo y la publica; en Mi OE se ve con sus funciones y sin su correo. El miembro de
// pruebas es Presidencia solo durante la prueba.

const marca = randomBytes(3).toString("hex");
const unidad = `e2e-Dependencia ${marca}`;
const correo = `e2e-funcionaria-${marca}@example.org`;
const cargos: string[] = [];

test.afterEach(async () => {
  const db = getDb();
  if (cargos.length > 0)
    await db.delete(appointment).where(inArray(appointment.id, cargos.splice(0)));
  await db.delete(organization).where(eq(organization.name, unidad));
  await db.delete(person).where(eq(person.email, correo));
  await closeDb();
});

test.describe("la Presidencia", () => {
  test.use({ storageState: "tests/e2e/.auth/member.json" });

  test("arma el directorio y la OE lo ve en Mi OE, sin el correo", async ({ page }) => {
    const db = getDb();
    const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
    const [member] = await db.select().from(person).where(eq(person.email, E2E_MEMBER_EMAIL));
    if (!current || !member) throw new Error("Faltan el semestre y el miembro sintéticos");
    cargos.push(await seedAppointment(member.id, current.id, "PRESIDENT"));
    await closeDb();

    const [titulo, , , nombreUnidad, crearUnidad] = tList("T-5142");
    const [nombre, apellido, correoCampo, cargo, sumar] = tList("T-5144");
    const [funciones, , publicar, , , , guardar] = tList("T-5145");
    const listo = tList("T-4302")[0] ?? "";

    await page.goto("/admin/directorio-institucional");
    await expect(page.getByRole("heading", { level: 1, name: titulo ?? "" })).toBeVisible();
    await page.getByLabel(nombreUnidad ?? "", { exact: true }).fill(unidad);
    await page.getByRole("button", { name: crearUnidad ?? "", exact: true }).click();
    const seccion = page.getByRole("region", { name: unidad });
    await expect(seccion).toBeVisible();

    await seccion.getByLabel(nombre ?? "", { exact: true }).fill("Ana");
    await seccion.getByLabel(apellido ?? "", { exact: true }).fill(`Sintética ${marca}`);
    await seccion.getByLabel(correoCampo ?? "", { exact: true }).fill(correo);
    await seccion.getByLabel(cargo ?? "", { exact: true }).fill("Coordinadora de grupos");
    await seccion.getByRole("button", { name: sumar ?? "", exact: true }).click();
    await expect(
      seccion.getByText(`Ana Sintética ${marca} · Coordinadora de grupos`),
    ).toBeVisible();

    await seccion
      .getByLabel(funciones ?? "", { exact: true })
      .fill("Acompaña a los grupos estudiantiles");
    await seccion.getByLabel(publicar ?? "", { exact: true }).check();
    await seccion.getByRole("button", { name: guardar ?? "", exact: true }).click();
    await expect(page.getByText(listo, { exact: true })).toBeVisible();
    await sinViolaciones(page);

    await page.goto(`/app/directorio-institucional?q=${marca}`);
    const enMiOe = page.getByRole("region", { name: unidad });
    await expect(enMiOe.getByText(`Ana Sintética ${marca}`)).toBeVisible();
    await expect(enMiOe.getByText("Acompaña a los grupos estudiantiles")).toBeVisible();
    await expect(page.getByText(correo)).toHaveCount(0);
    await sinViolaciones(page);
  });
});
