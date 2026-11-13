import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { person } from "@/modules/people/schema";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// El carnet universitario (ADR-150 regla 7, ADR-191 regla 5): mientras falte, «Hoy» lo pide en «Te
// toca»; se completa en Ajustes con cuatro pares hexadecimales y el pendiente desaparece.

test.use({ storageState: "tests/e2e/.auth/member.json" });

test.afterEach(async () => {
  await closeDb();
});

test("«Hoy» pide el carnet, Ajustes lo guarda normalizado y el pendiente desaparece", async ({
  page,
}) => {
  const vaciado = await getDb()
    .update(person)
    .set({ cardUid: null })
    .where(eq(person.email, E2E_MEMBER_EMAIL))
    .returning({ id: person.id });
  expect(vaciado).toHaveLength(1);

  const [, teToca] = tList("T-4890");
  const carnet = tList("T-4891")[6] ?? "";
  await page.goto("/app");
  const pendientes = page.getByRole("region", { name: teToca, exact: true });
  const enlace = pendientes.getByRole("link", { name: carnet, exact: true });
  await expect(enlace).toBeVisible();
  await enlace.click();
  await expect(page).toHaveURL(/\/app\/ajustes#mis-datos$/);

  const contacto = page.getByRole("group", { name: t("T-1630") });
  const guardar = contacto.getByRole("button", { name: t("T-253"), exact: true });
  const campo = contacto.getByRole("textbox", { name: t("T-4100"), exact: true });
  await campo.fill("zz");
  await guardar.click();
  await expect(page.getByText(t("T-4102")).first()).toBeVisible();
  await expect(campo).toHaveAttribute("aria-invalid", "true");

  await campo.fill("0a 1b 2c 3d");
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST"),
    guardar.click(),
  ]);
  await expect(page.getByText(t("T-259")).first()).toBeVisible();
  await expect(campo).toHaveValue("0A 1B 2C 3D");
  await sinViolaciones(page);

  const [guardado] = await getDb()
    .select({ cardUid: person.cardUid })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  expect(guardado?.cardUid).toBe("0A 1B 2C 3D");

  await page.goto("/app");
  await expect(
    page.getByRole("region", { name: teToca, exact: true }).getByRole("link", { name: carnet }),
  ).toHaveCount(0);
});
