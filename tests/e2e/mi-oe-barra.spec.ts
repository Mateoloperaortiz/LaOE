import { expect } from "@playwright/test";
import { t, tList } from "@/shared/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// La barra nueva de Mi OE (ADR-160 reglas 1, 4 y 6): Hoy · Agenda · Asistencia · Juegos · Yo, con
// Asistencia en el centro, «Yo» con lo que estaba en «Más» y una bienvenida en «Hoy» que sale una sola
// vez y no tapa la barra.

test.use({ storageState: "tests/e2e/.auth/member.json" });

const [hoy, , asistencia, , yo] = tList("T-4872");
const [welcomeTitle, , welcomeButton] = tList("T-4878");

test.describe("la primera vez", () => {
  test.use({ newBarWelcomeSeen: false });

  test("la bienvenida dice dónde quedó cada cosa y no vuelve a salir", async ({ page }) => {
    await page.goto("/app");
    const welcome = page.getByRole("region", { name: welcomeTitle, exact: true });
    await expect(welcome).toBeVisible();
    // No es modal: la barra que explica sigue a la mano.
    await expect(
      page
        .getByRole("navigation", { name: t("T-1663"), exact: true })
        .getByRole("link")
        .first(),
    ).toBeVisible();
    await sinViolaciones(page);
    await welcome.getByRole("button", { name: welcomeButton, exact: true }).click();
    await expect(welcome).toBeHidden();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(welcome).toBeHidden();
  });
});

test("Asistencia es el centro de la barra y lleva al carnet, que la deja activa", async ({
  page,
}) => {
  await page.goto("/app");
  const nav = page.getByRole("navigation", { name: t("T-1663"), exact: true });
  await expect(nav.getByRole("link", { name: hoy, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const central = nav.getByRole("link", { name: asistencia, exact: true });
  await expect(central).toHaveAttribute("data-central", "true");
  await central.click();
  await expect(page).toHaveURL(/\/app\/asistencia$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(asistencia);
  await expect(page.getByRole("button", { name: tList("T-4879")[0], exact: true })).toBeVisible();
  await sinViolaciones(page);
  await page.getByRole("link", { name: tList("T-4876")[2], exact: true }).click();
  await expect(page).toHaveURL(/\/app\/carnet$/);
  await expect(central).toHaveAttribute("aria-current", "page");
});

test("«Yo» reúne GH Points, la comunidad y la cuenta, y queda activa en sus destinos", async ({
  page,
}) => {
  await page.goto("/app/yo");
  const nav = page.getByRole("navigation", { name: t("T-1663"), exact: true });
  await expect(nav.getByRole("link", { name: yo, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const main = page.getByRole("main");
  for (const name of [t("T-1664"), t("T-1665"), t("T-1666")]) {
    await expect(main.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  await sinViolaciones(page);
  await main.getByRole("link", { name: new RegExp(`^${t("T-080")}`) }).click();
  await expect(page).toHaveURL(/\/app\/gh-points$/);
  await expect(nav.getByRole("link", { name: yo, exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});
