import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_MEMBER_EMAIL } from "./global-setup";
import { downloadOwnData } from "./own-data";

// Mi OE como miembro sin permisos (ADR-034): inicio, directorio sin correos, comités internos y
// ajustes con datos propios, consentimientos y el paquete de mis datos.
test.use({ storageState: "tests/e2e/.auth/member.json" });

test("el inicio saluda, muestra tus comités y el admin lo devuelve a Mi OE", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    t("T-060", { "nombre preferido": "Miembro" }),
  );
  await expect(page.getByRole("heading", { name: t("T-375") })).toBeVisible();
  await expect(page.getByRole("heading", { name: t("T-062") })).toBeVisible();
  await sinViolaciones(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
});

test("el directorio encuentra por nombre y nunca muestra correos", async ({ page }) => {
  await page.goto("/app/personas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-070"));
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await page.getByLabel(t("T-071")).fill("Miembro E2E");
  await page.getByRole("button", { name: t("T-250") }).click();
  await expect(page.getByRole("heading", { name: "Miembro E2E" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(E2E_MEMBER_EMAIL);
  await sinViolaciones(page);
});

test("los comités internos llevan al roster del semestre", async ({ page }) => {
  await page.goto("/app/comites");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-309"));
  const propios = page.getByRole("region", { name: t("T-375") });
  await expect(propios.getByRole("link").first()).toBeVisible();
  await propios.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/app\/comites\/[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { name: t("T-383") })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Miembro E2E" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);
});

test("ajustes: edita el celular, autoriza la foto y descarga sus datos", async ({ page }) => {
  await page.goto("/app/ajustes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-418"));
  await sinViolaciones(page);

  await page.getByLabel(t("T-404")).fill("300 555 1234");
  await page.getByRole("textbox", { name: t("T-4100"), exact: true }).fill("00 11 22 33");
  await page.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();
  await expect(page.getByLabel(t("T-404"))).toHaveValue("+573005551234");

  await page
    .getByRole("navigation", { name: t("T-418"), exact: true })
    .getByRole("link", { name: tList("T-133")[4], exact: true })
    .click();
  const foto = page.locator("li", { hasText: tList("T-516")[2] });
  await foto.getByRole("button", { name: tList("T-413")[0], exact: true }).click();
  await expect(foto.getByText(copyPattern("T-411"))).toBeVisible();

  const response = await downloadOwnData(page);
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("mis-datos-");
  const body = (await response.json()) as {
    person: { email: string };
    consents: Array<{ purpose: string; live: unknown }>;
  };
  expect(body.person.email).toBe(E2E_MEMBER_EMAIL);
  expect(body.consents.find((item) => item.purpose === "DIRECTORY_PHOTO")?.live).toEqual(
    expect.anything(),
  );

  await page
    .getByRole("navigation", { name: t("T-418"), exact: true })
    .getByRole("link", { name: tList("T-133")[5], exact: true })
    .click();
  await page.getByRole("link", { name: copyPattern("T-136") }).click();
  await expect(page.getByText(copyPattern("T-415"))).toBeVisible();
  await page.getByRole("button", { name: t("T-417") }).click();
  await expect(page.getByText(copyPattern("T-416"))).toBeVisible();
});
