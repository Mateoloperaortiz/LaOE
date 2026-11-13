import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { organization } from "@/modules/crm/schema";
import { t, tList } from "@/shared/copy";
import { seedOrganization } from "../factories";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";

// Oportunidades de los aliados (ADR-186): ADMIN publica una oportunidad de un aliado y un miembro la
// ve en Mi OE con el enlace al sitio del aliado.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const marca = randomBytes(4).toString("hex");
const aliado = `e2e-Aliado ${marca}`;
const titulo = `e2e-Práctica ${marca}`;
const [, , campoOrganizacion, campoTipo, campoPublico, campoTitulo, , campoEnlace, , campoEstado] =
  tList("T-5023");
const [, publicada] = tList("T-288");
const [, empleo] = tList("T-5018");
const [miembros] = tList("T-5022");
const [tituloPagina, , , ver] = tList("T-5020");
let organizationId: string;

test.beforeEach(async () => {
  organizationId = await seedOrganization(aliado);
});

test.afterEach(async () => {
  await getDb().delete(organization).where(eq(organization.id, organizationId));
  await closeDb();
});

test("ADMIN publica una oportunidad y un miembro la ve en Mi OE", async ({ page, browser }) => {
  await page.goto("/admin/oportunidades?nuevo=1");
  const panel = page.getByRole("dialog");
  await panel.getByLabel(campoOrganizacion ?? "", { exact: true }).selectOption({ label: aliado });
  await panel.getByLabel(campoTipo ?? "", { exact: true }).selectOption({ label: empleo ?? "" });
  await panel
    .getByLabel(campoPublico ?? "", { exact: true })
    .selectOption({ label: miembros ?? "" });
  await panel.getByLabel(campoTitulo ?? "", { exact: true }).fill(titulo);
  await panel.getByLabel(campoEnlace ?? "", { exact: true }).fill("https://example.com/practica");
  await panel
    .getByLabel(campoEstado ?? "", { exact: true })
    .selectOption({ label: publicada ?? "" });
  await panel.getByRole("button", { name: t("T-253") }).click();
  await expect(page.getByText(t("T-259"))).toBeVisible();

  const contexto = await browser.newContext({ storageState: "tests/e2e/.auth/member.json" });
  const suya = await contexto.newPage();
  await suya.goto("/app/oportunidades");
  await expect(suya.getByRole("heading", { level: 1 })).toHaveText(tituloPagina ?? "");
  const tarjeta = suya.getByRole("article", { name: titulo });
  await expect(tarjeta).toContainText(aliado);
  await expect(tarjeta.getByRole("link", { name: ver })).toHaveAttribute(
    "href",
    "https://example.com/practica",
  );
  await sinViolaciones(suya);
  await contexto.close();
});
