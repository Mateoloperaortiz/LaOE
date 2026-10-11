import { randomBytes } from "node:crypto";
import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { campaign, emailTemplate } from "@/modules/comms/schema";
import { document as documentTable } from "@/modules/content/schema";
import { card, organization, pipeline } from "@/modules/crm/schema";
import { event } from "@/modules/events/schema";
import { form } from "@/modules/forms/schema";
import { occasion } from "@/modules/participation/schema";
import { committee, person, segment } from "@/modules/people/schema";
import { workGroup } from "@/modules/permanence/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedCall,
  seedCampaign,
  seedCard,
  seedDocument,
  seedEdition,
  seedEmailTemplate,
  seedEvent,
  seedForm,
  seedOrganization,
  seedPipeline,
  seedSegment,
} from "../factories";
import { sinViolaciones } from "./axe";
import { E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL } from "./global-setup";
import { drenarOutbox } from "./outbox";

test.use({ storageState: "tests/e2e/.auth/admin.json" });

// Los 16 detalles completan las 38 rutas estáticas de admin-responsive. Datos independientes de
// otras suites; no se publican documentos, se envían campañas ni se alteran personas existentes.
function first<T>(rows: T[]): T {
  const row = rows[0];
  if (!row) throw new Error("No se creó el dato sintético");
  return row;
}

let routes: string[];
let removeFixtures: () => Promise<void>;

test.beforeEach(async () => {
  const db = getDb();
  const prefix = `e2e-ui-${randomBytes(4).toString("hex")}`;
  const [current] = await db.select().from(term).where(eq(term.code, E2E_TERM.code));
  const [admin] = await db.select().from(person).where(eq(person.email, E2E_EMAIL));
  const [pixel] = await db.select().from(committee).where(eq(committee.slug, "pixel"));
  if (!current || !admin || !pixel) throw new Error("Faltan las referencias sintéticas del E2E");
  const template = {
    id: await seedEmailTemplate(prefix, {
      name: prefix,
      subject: "Prueba de diseño",
      body: "Texto sintético de la plantilla.",
    }),
  };
  const audience = { id: await seedSegment(prefix) };
  const mail = { id: await seedCampaign(prefix, template.id, audience.id) };
  const org = { id: await seedOrganization(prefix, "OTHER") };
  const flow = await seedPipeline(
    prefix,
    "CUSTOM",
    ["Pendiente de revisar", "En conversación", "Confirmación", "Finalizado"].map((name) => ({
      name,
    })),
  );
  await seedCard(
    flow.id,
    first(flow.stages).id,
    { organizationId: org.id },
    { title: "Tarjeta de prueba con un título largo para revisar el ajuste de líneas" },
  );
  const group = await db
    .insert(workGroup)
    .values({ termId: current.id, kind: "GAP", name: prefix })
    .returning()
    .then(first);
  const call = {
    id: await seedCall(current.id, group.id, {
      title: prefix,
      opensAt: new Date(Date.now() - 86_400_000),
      closesAt: new Date(Date.now() + 7 * 86_400_000),
      status: "DRAFT",
    }),
  };
  const questionnaire = {
    id: await seedForm(prefix, {
      title: prefix,
      status: "DRAFT",
      actions: {},
      fields: [
        {
          key: "motivacion",
          type: "TEXT",
          label:
            "Una pregunta con un texto extenso para revisar la disposición de sus acciones en celular",
          required: true,
        },
        { key: "comentario", type: "TEXTAREA", label: "Comentario adicional", required: false },
      ],
    }),
  };
  const permanent = { id: await seedEvent(prefix, prefix) };
  const edition = {
    id: await seedEdition(permanent.id, prefix, prefix, {
      startsAt: new Date(Date.now() + 86_400_000),
    }),
  };
  const activity = await db
    .insert(occasion)
    .values({
      publicId: randomBytes(5).toString("hex"),
      termId: current.id,
      title: prefix,
      startsAt: new Date(),
      checkInOpensAt: new Date(Date.now() - 60_000),
      checkInClosesAt: new Date(Date.now() + 3_600_000),
      status: "OPEN",
    })
    .returning()
    .then(first);
  const pdf = { id: await seedDocument(prefix, { version: "Versión de prueba, texto libre" }) };
  routes = [
    `/admin/campanas/${mail.id}`,
    `/admin/comites/${pixel.slug}`,
    `/admin/comites/${pixel.slug}/permanencia`,
    `/admin/convocatorias/${call.id}`,
    `/admin/documentos/${pdf.id}`,
    `/admin/eventos/${permanent.id}/ediciones`,
    `/admin/eventos/${permanent.id}/ediciones/${edition.id}/inscritos`,
    `/admin/formularios/${questionnaire.id}`,
    `/admin/formularios/${questionnaire.id}/respuestas`,
    `/admin/ocasiones/${activity.id}`,
    `/admin/ocasiones/${activity.id}/anfitrion`,
    `/admin/organizaciones/${org.id}`,
    `/admin/permanencia/grupos/${group.id}`,
    `/admin/personas/${admin.id}`,
    `/admin/pipelines/${flow.id}`,
    `/admin/plantillas/${template.id}`,
  ];
  removeFixtures = async () => {
    const db = getDb();
    await db.delete(campaign).where(eq(campaign.id, mail.id));
    await db.delete(emailTemplate).where(eq(emailTemplate.id, template.id));
    await db.delete(segment).where(eq(segment.id, audience.id));
    await db.delete(card).where(eq(card.pipelineId, flow.id));
    await db.delete(pipeline).where(eq(pipeline.id, flow.id));
    await db.delete(organization).where(eq(organization.id, org.id));
    await db.delete(workGroup).where(eq(workGroup.id, group.id));
    await db.delete(form).where(eq(form.id, questionnaire.id));
    await db.delete(occasion).where(eq(occasion.id, activity.id));
    await db.delete(event).where(eq(event.id, permanent.id));
    await db.delete(documentTable).where(eq(documentTable.id, pdf.id));
  };
});

test.afterEach(async () => {
  await drenarOutbox();
  await removeFixtures?.();
  await closeDb();
});

test("la edición conserva el tipo bloqueado, los filtros y una página válida", async ({ page }) => {
  const id = routes
    .find((href) => href.startsWith("/admin/pipelines/"))
    ?.split("/")
    .at(-1);
  if (!id) throw new Error("Falta el pipeline sintético");
  const record = first(await getDb().select().from(pipeline).where(eq(pipeline.id, id)));
  await page.goto(`/admin/pipelines?q=${record.name}&editar=${id}`);
  const panel = page.getByRole("dialog");
  await expect(panel.getByLabel(tList("T-963")[1], { exact: true })).toBeDisabled();
  await expect(panel.getByLabel(tList("T-963")[1], { exact: true })).toHaveValue("CUSTOM");
  await panel.getByLabel(tList("T-963")[0], { exact: true }).fill(`${record.name} editado`);
  await panel.getByRole("button", { name: t("T-253"), exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("q") === record.name && url.searchParams.get("guardado") === "1",
  );
  expect(first(await getDb().select().from(pipeline).where(eq(pipeline.id, id))).kind).toBe(
    "CUSTOM",
  );
  await page.goto(`/admin/pipelines?q=${record.name}&pagina=999`);
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("q") === record.name && !url.searchParams.has("pagina"),
  );
  await expect(
    page.getByRole("link", { name: `${record.name} editado`, exact: true }),
  ).toBeVisible();
});

for (const width of [360, 390, 768, 1440]) {
  for (const colorScheme of ["light", "dark"] as const) {
    test(`detalles administrativos ${width}px ${colorScheme}`, async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      for (const href of routes) {
        await test.step(href, async () => {
          const response = await page.goto(href);
          expect(response?.status()).toBeLessThan(400);
          await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
          expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
            href,
          ).toBe(true);
          await sinViolaciones(page);
          if (/\/(pipelines|formularios|ocasiones)\/[^/]+$/.test(href)) {
            await page.screenshot({
              path: testInfo.outputPath(`${href.split("/")[2]}-${width}-${colorScheme}.png`),
              fullPage: true,
            });
          }
        });
      }
    });
  }
}
