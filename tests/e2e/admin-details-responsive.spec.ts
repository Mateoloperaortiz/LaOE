import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { pipeline } from "@/modules/crm/schema";
import { t, tList } from "@/shared/copy";
import { type AdminDetails, checkAdminDetails, seedAdminDetails } from "./admin-details-fixture";
import { test } from "./fixtures";
import { drenarOutbox } from "./outbox";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// Los detalles administrativos en anchos de celular; los amplios viven en admin-details-wide.
let details: AdminDetails;

test.beforeEach(async () => {
  details = await seedAdminDetails();
});

test.afterEach(async () => {
  await drenarOutbox();
  await details.remove();
  await closeDb();
});

test("la edición conserva el tipo bloqueado, los filtros y una página válida", async ({ page }) => {
  const id = details.pipelineId;
  const [record] = await getDb().select().from(pipeline).where(eq(pipeline.id, id));
  if (!record) throw new Error("Falta el pipeline sintético");
  await page.goto(`/admin/pipelines?q=${record.name}&editar=${id}`);
  const panel = page.getByRole("dialog");
  await expect(panel.getByLabel(tList("T-963")[1], { exact: true })).toBeDisabled();
  await expect(panel.getByLabel(tList("T-963")[1], { exact: true })).toHaveValue("CUSTOM");
  await panel.getByLabel(tList("T-963")[0], { exact: true }).fill(`${record.name} editado`);
  await panel.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("q") === record.name && url.searchParams.get("guardado") === "1",
  );
  const [after] = await getDb().select().from(pipeline).where(eq(pipeline.id, id));
  expect(after?.kind).toBe("CUSTOM");
  await page.goto(`/admin/pipelines?q=${record.name}&pagina=999`);
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("q") === record.name && !url.searchParams.has("pagina"),
  );
  await expect(
    page.getByRole("link", { name: `${record.name} editado`, exact: true }),
  ).toBeVisible();
});

for (const width of [360, 390]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`detalles administrativos ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await checkAdminDetails(page, testInfo, details.routes, width, colorScheme);
    });
  }
}
