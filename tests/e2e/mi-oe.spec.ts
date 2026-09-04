import { expect, test } from "@playwright/test";
import { sinViolaciones } from "./axe";
import { E2E_MEMBER_EMAIL } from "./global-setup";

// Mi OE como miembro sin permisos (ADR-034): inicio, directorio sin correos, comités internos y
// ajustes con datos propios, consentimientos y el paquete de mis datos.
test.use({ storageState: "tests/e2e/.auth/member.json" });

test("el inicio saluda, muestra tus comités y el admin lo devuelve a Mi OE", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Hola, Miembro");
  await expect(page.getByRole("heading", { name: "Tus comités" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tu semana" })).toBeVisible();
  await sinViolaciones(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
});

test("el directorio encuentra por nombre y nunca muestra correos", async ({ page }) => {
  await page.goto("/app/personas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Personas");
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await page.getByLabel("Buscá por nombre o comité").fill("Miembro E2E");
  await page.getByRole("button", { name: "Buscar" }).click();
  await expect(page.getByRole("heading", { name: "Miembro E2E" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(E2E_MEMBER_EMAIL);
  await sinViolaciones(page);
});

test("los comités internos llevan al roster del semestre", async ({ page }) => {
  await page.goto("/app/comites");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Comités");
  const propios = page.getByRole("region", { name: "Tus comités" });
  await expect(propios.getByRole("link").first()).toBeVisible();
  await propios.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/app\/comites\/[a-z0-9-]+$/);
  await expect(page.getByRole("heading", { name: "Quiénes están este semestre" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Miembro E2E" })).toBeVisible();
  await expect(page.locator("main")).not.toContainText("@eafit.edu.co");
  await sinViolaciones(page);
});

test("ajustes: edita el celular, autoriza la foto y descarga sus datos", async ({ page }) => {
  await page.goto("/app/ajustes");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ajustes");
  await sinViolaciones(page);

  await page.getByLabel("Celular").fill("300 555 1234");
  await page.getByRole("button", { name: "Guardar" }).click();
  await expect(page.getByText("Guardado.")).toBeVisible();
  await expect(page.getByLabel("Celular")).toHaveValue("+573005551234");

  const foto = page.locator("li", { hasText: "Foto en el directorio" });
  await foto.getByRole("button", { name: "Autorizar", exact: true }).click();
  await expect(foto.getByText(/Autorizado el/)).toBeVisible();

  const response = await page.request.get("/api/mis-datos");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toContain("mis-datos-");
  const body = (await response.json()) as {
    person: { email: string };
    consents: Array<{ purpose: string; live: unknown }>;
  };
  expect(body.person.email).toBe(E2E_MEMBER_EMAIL);
  expect(body.consents.find((item) => item.purpose === "DIRECTORY_PHOTO")?.live).not.toBeNull();

  await page.getByRole("link", { name: /Pedir que borren mis datos/ }).click();
  await expect(page.getByText(/GH revisa tu solicitud/)).toBeVisible();
  await page.getByRole("button", { name: "Sí, pedir la eliminación" }).click();
  await expect(page.getByText(/Tu solicitud quedó registrada/)).toBeVisible();
});
