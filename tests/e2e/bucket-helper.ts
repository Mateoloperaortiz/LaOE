import type { Page } from "@playwright/test";

/**
 * El presign responde de verdad y el bucket rechaza la subida con su XML de error, como cuando la
 * política firmada no admite el archivo. Devuelve la cuenta de las subidas que le llegaron.
 */
export async function rejectBucketUploads(
  page: Page,
  presignPath: string,
): Promise<{ uploads: number }> {
  const seen = { uploads: 0 };
  let bucket: string | null = null;
  await page.route(`**${presignPath}`, async (route) => {
    const response = await route.fetch();
    if (response.ok()) bucket = ((await response.json()) as { url: string }).url;
    await route.fulfill({ response });
  });
  await page.route(
    (url) => bucket !== null && url.href.startsWith(bucket),
    async (route) => {
      if (route.request().method() !== "POST") {
        await route.fallback();
        return;
      }
      seen.uploads += 1;
      await route.fulfill({
        status: 403,
        contentType: "application/xml",
        // Sin esta cabecera el navegador no entrega la respuesta y el fallo sería de red.
        headers: { "access-control-allow-origin": "*" },
        body: '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code><Message>Access Denied.</Message></Error>',
      });
    },
  );
  return seen;
}

/** La confirmación falla dos veces: primero con el mensaje del servidor y después sin cuerpo JSON. */
export async function failConfirmations(
  page: Page,
  confirmPath: string,
  serverMessage: string,
): Promise<{ confirmations: number }> {
  const seen = { confirmations: 0 };
  await page.route(`**${confirmPath}`, async (route) => {
    seen.confirmations += 1;
    if (seen.confirmations === 1) {
      await route.fulfill({ status: 400, json: { error: serverMessage } });
      return;
    }
    await route.fulfill({ status: 502, contentType: "text/html", body: "<h1>Bad Gateway</h1>" });
  });
  return seen;
}
