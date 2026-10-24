import { type APIResponse, expect, type Page } from "@playwright/test";
import { t } from "@/shared/copy";
import { pasarStepUp } from "./stepup";

/** La sesión guardada puede superar quince minutos: confirma por la UI y repite la descarga. */
export async function downloadOwnData(page: Page): Promise<APIResponse> {
  const screen = page.url();
  const first = await page.request.get("/api/mis-datos", { maxRedirects: 0 });
  if (first.status() !== 302) return first;
  const target = new URL(first.headers().location ?? "https://sin-destino.invalid");
  expect(target.pathname).toBe("/ingresar/paso");
  expect(target.searchParams.get("next")).toBe("/app/ajustes?descarga=1");
  await page.goto(target.href);
  await pasarStepUp(page);
  await expect(page).toHaveURL(
    (url) => url.pathname === "/app/ajustes" && url.searchParams.get("descarga") === "1",
  );
  await expect(page.getByText(t("T-3211"), { exact: true })).toBeVisible();
  const response = await page.request.get("/api/mis-datos", { maxRedirects: 0 });
  expect(response.status()).toBe(200);
  await page.goto(screen);
  return response;
}
