import { expect } from "@playwright/test";
import { and, eq, inArray } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { campaign, campaignRecipient, emailTemplate } from "@/modules/comms/schema";
import { person, segment } from "@/modules/people/schema";
import { appConfig, auditLog } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { seedSegment } from "../factories";
import { copyPattern } from "../helpers/copy";
import { sinViolaciones } from "./axe";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// El cupo de correo (ADR-116 reglas 19 y 20, DT-115): una campaña en curso con un destinatario
// pendiente y un corte por cuota vigente. La campaña dice cuántos faltan, por qué esperan y hasta
// cuándo; la pantalla del cupo muestra el corte con su causa, guarda el margen y levanta el corte, y la
// campaña deja de decir que espera.
//
// La suite corre con el mailer de consola, que no lleva cupo del día: el corte se siembra a nombre de
// ese transporte, que es el que detiene los lotes de este servidor. La cuenta del cupo del día de
// Resend se prueba en `tests/integration/campaigns-quota-status.test.ts`.

test.use({ storageState: "tests/e2e/.auth/admin.json" });

const NOMBRE = `e2e-cupo-${Date.now().toString(36)}`;
const CUT_KEY = "campaigns.quotaCut";
const RESERVE_KEY = "campaigns.transactionalReserve";

interface Sembrado {
  campaignId: string;
  templateId: string;
  segmentId: string;
  adminId: string;
  /** La hora del lote que recibió el rechazo y el final del corte. */
  at: Date;
  until: Date;
}

async function sembrar(): Promise<Sembrado> {
  const db = getDb();
  const people = await db
    .select({ id: person.id, email: person.email })
    .from(person)
    .where(inArray(person.email, [E2E_EMAIL, E2E_MEMBER_EMAIL]));
  const adminId = people.find((row) => row.email === E2E_EMAIL)?.id;
  const memberId = people.find((row) => row.email === E2E_MEMBER_EMAIL)?.id;
  if (!adminId || !memberId) throw new Error("Faltan las personas de la suite");
  const [template] = await db
    .insert(emailTemplate)
    .values({ slug: NOMBRE, name: NOMBRE, subject: "Prueba del cupo", body: "Texto sintético." })
    .returning({ id: emailTemplate.id });
  const audience = { id: await seedSegment(NOMBRE) };
  if (!template) throw new Error("No se sembró la plantilla");
  const at = new Date(Date.now() - 10 * 60_000);
  at.setUTCSeconds(0, 0);
  const until = new Date(at.getTime() + 6 * 3_600_000);
  const [row] = await db
    .insert(campaign)
    .values({
      name: NOMBRE,
      templateId: template.id,
      segmentId: audience.id,
      status: "SENDING",
      scheduledAt: at,
      startedAt: at,
      totalCount: 2,
      sentCount: 1,
    })
    .returning({ id: campaign.id });
  if (!row) throw new Error("No se sembró la campaña");
  await db.insert(campaignRecipient).values([
    { campaignId: row.id, personId: adminId, status: "SENT", sentAt: at },
    { campaignId: row.id, personId: memberId, status: "PENDING" },
  ]);
  const cut = {
    provider: "console",
    reason: "DAILY",
    at: at.toISOString(),
    until: until.toISOString(),
  };
  await db.delete(appConfig).where(eq(appConfig.key, RESERVE_KEY));
  await db
    .insert(appConfig)
    .values({ key: CUT_KEY, value: cut })
    .onConflictDoUpdate({ target: appConfig.key, set: { value: cut } });
  return {
    campaignId: row.id,
    templateId: template.id,
    segmentId: audience.id,
    adminId,
    at,
    until,
  };
}

async function limpiar(sembrado: Sembrado): Promise<void> {
  const db = getDb();
  await db.delete(appConfig).where(inArray(appConfig.key, [CUT_KEY, RESERVE_KEY]));
  await db.delete(campaign).where(eq(campaign.id, sembrado.campaignId));
  await db.delete(emailTemplate).where(eq(emailTemplate.id, sembrado.templateId));
  await db.delete(segment).where(eq(segment.id, sembrado.segmentId));
}

test("una campaña que espera cupo lo dice, y el ADMIN ve el cupo, cambia el margen y levanta el corte", async ({
  page,
}) => {
  const sembrado = await sembrar();
  const proveedor = tList("T-3226")[0] ?? "";
  const causa = tList("T-3225")[1] ?? "";
  const [campoMargen = "", guardarMargen = ""] = tList("T-3232");
  const ruta = `/admin/campanas/${sembrado.campaignId}`;
  try {
    await test.step("la campaña dice cuántos faltan, por qué esperan y hasta cuándo", async () => {
      await page.goto(ruta);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(NOMBRE);
      await expect(page.getByText(copyPattern("T-1124"))).toBeVisible();
      await expect(page.getByText(t("T-3219", { n: 1 }))).toBeVisible();
      await expect(
        page.getByText(t("T-3220", { proveedor, causa, fecha: formatDateTime(sembrado.until) })),
      ).toBeVisible();
      await sinViolaciones(page);
    });

    await test.step("el cupo de correo muestra el corte con su causa y de cuándo a cuándo va", async () => {
      await page.getByRole("link", { name: t("T-3224") }).click();
      await expect(page).toHaveURL(/\/admin\/campanas\/cupo$/);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t("T-3224"));
      await expect(
        page.getByText(
          t("T-3237", {
            proveedor,
            causa,
            desde: formatDateTime(sembrado.at),
            hasta: formatDateTime(sembrado.until),
          }),
        ),
      ).toBeVisible();
      await expect(page.getByText(t("T-3230", { proveedor }))).toBeVisible();
      await sinViolaciones(page);
    });

    await test.step("el margen se guarda desde la pantalla", async () => {
      await page.getByLabel(campoMargen).fill("40");
      await page.getByRole("button", { name: guardarMargen }).click();
      await expect(page.getByText(t("T-3234", { n: 40 }))).toBeVisible();
      await expect(page.getByLabel(campoMargen)).toHaveValue("40");
      const [reserve] = await getDb()
        .select({ value: appConfig.value })
        .from(appConfig)
        .where(eq(appConfig.key, RESERVE_KEY));
      expect(reserve?.value).toBe(40);
    });

    await test.step("levantar el corte lo quita de la pantalla y deja las dos acciones en la auditoría", async () => {
      await page.getByRole("button", { name: t("T-3238") }).click();
      await expect(page.getByText(t("T-3240"))).toBeVisible();
      await expect(page.getByText(t("T-3236"))).toBeVisible();
      await expect(page.getByRole("button", { name: t("T-3238") })).toHaveCount(0);
      const audits = await getDb()
        .select({ entityId: auditLog.entityId })
        .from(auditLog)
        .where(
          and(
            eq(auditLog.action, "config.updated"),
            eq(auditLog.actorId, sembrado.adminId),
            inArray(auditLog.entityId, [CUT_KEY, RESERVE_KEY]),
          ),
        );
      expect(audits.map((row) => row.entityId).sort()).toEqual([CUT_KEY, RESERVE_KEY].sort());
    });

    await test.step("la campaña ya no dice que espera, y se puede cancelar", async () => {
      await page.goto(ruta);
      await expect(page.getByText(t("T-3219", { n: 1 }))).toBeVisible();
      await expect(page.getByText(t("T-3223"))).toBeVisible();
      await expect(page.getByText(copyPattern("T-3220"))).toHaveCount(0);
      await page.getByRole("button", { name: t("T-1132") }).click();
      await expect(page.getByText(t("T-1141"))).toBeVisible();
    });
  } finally {
    try {
      await limpiar(sembrado);
    } finally {
      await closeDb();
    }
  }
});
