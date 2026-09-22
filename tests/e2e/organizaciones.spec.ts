import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// Organizaciones y contactos (ADR-037 regla 6): ADMIN crea una organización e2e-, le agrega un contacto
// externo y una nota, y la encuentra en la paleta ⌘K.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const NAME = "e2e-Bancolombia";

test("ADMIN crea una organización con un contacto externo y una nota y la busca en la paleta", async ({
  page,
}) => {
  await page.goto("/admin/organizaciones?nuevo=1");
  const panel = page.getByRole("dialog");
  await panel.getByLabel(tList("T-948")[0]).fill(NAME);
  await panel.getByLabel(tList("T-948")[1]).selectOption("COMPANY");
  await panel.getByLabel(tList("T-948")[2]).fill("https://www.bancolombia.com");
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await sinViolaciones(page);

  await page.getByRole("link", { name: NAME }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
  await expect(page.getByText(t("T-955"))).toBeVisible();

  // Contacto externo nuevo, principal.
  await page.getByRole("link", { name: tList("T-954")[0] }).click();
  const contacto = page.getByRole("dialog");
  await contacto.getByLabel(tList("T-953")[0]).fill("Clara");
  await contacto.getByLabel(tList("T-953")[1]).fill("Ruiz");
  await contacto.getByLabel(tList("T-953")[2]).fill("e2e-clara@bancolombia.test");
  await contacto.getByLabel(tList("T-953")[4]).fill("Gerente de marca");
  await contacto.getByLabel(tList("T-953")[5]).check();
  await contacto.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByRole("link", { name: "Clara Ruiz" })).toBeVisible();
  await expect(page.getByText(t("T-958"), { exact: true })).toBeVisible();
  await expect(page.getByText(/Gerente de marca/)).toBeVisible();

  // Una nota sobre la organización queda en su línea de tiempo.
  await page.getByRole("link", { name: tList("T-456")[0] }).click();
  await page
    .getByRole("dialog")
    .getByLabel(tList("T-456")[0])
    .fill("Reunión el martes con la gerencia.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: tList("T-456")[0] })
    .click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByText("Reunión el martes con la gerencia.").first()).toBeVisible();
  await sinViolaciones(page);

  // La paleta ⌘K la encuentra (el botón responde después de hidratar: se reintenta hasta que abra).
  const input = page.getByRole("searchbox", { name: t("T-264") });
  await expect(async () => {
    await page.getByRole("button", { name: t("T-299") }).click();
    await expect(input).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 10_000 });
  await input.fill("e2e-Banco");
  const resultado = page.getByRole("link", { name: new RegExp(`${NAME}.*${tList("T-290")[3]}`) });
  await expect(resultado).toBeVisible();
  await resultado.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(NAME);
});
