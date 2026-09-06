import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { and, eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import { message, pushSubscription } from "@/modules/comms/schema";
import { announcement } from "@/modules/content/schema";
import { form } from "@/modules/forms/schema";
import { closeOccasionAs } from "@/modules/participation";
import { checkIn, occasion, occasionSurveyInvite } from "@/modules/participation/schema";
import { person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { logger } from "@/shared/log";

// "Listo cuando" de la fase 6 con push real (10-verificacion): con `next dev` arriba, claves VAPID en
// `.env` y `JOBS_ENABLED=true`, Google Chrome de escritorio (perfil temporal persistente: en incógnito
// no hay Push API) entra como el miembro sintético, activa las notificaciones en Ajustes, ADMIN avisa
// por push el anuncio de prueba desde la cartelera y se cierra una ocasión con encuesta a la que ese
// miembro asistió; mide cuánto tarda cada notificación en llegar al service worker y abre la URL del
// push de la encuesta. Solo local: usa el seed y el código fijo de desarrollo.

const BASE = "http://localhost:3000";
const CODE = "123456";
const MEMBER = "oe.demo.01@eafit.edu.co";
const ADMIN = "oe.demo.admin@eafit.edu.co";

interface Shown {
  title: string;
  body: string;
  tag: string;
  data: { url?: string } | null;
}

async function login(page: Page, email: string): Promise<void> {
  await page.goto(`${BASE}/ingresar`);
  await page.getByLabel("Correo @eafit.edu.co").fill(email);
  await page.getByRole("button", { name: "Enviame el código" }).click();
  await page.getByLabel("Código de seis dígitos").fill(CODE);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(app|admin)/);
}

async function shownNotifications(page: Page): Promise<Shown[]> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const list = await registration.getNotifications();
    return list.map((n) => ({ title: n.title, body: n.body, tag: n.tag, data: n.data }));
  });
}

async function waitForNotification(
  page: Page,
  matches: (n: Shown) => boolean,
  timeoutMs: number,
): Promise<{ notification: Shown; seconds: number }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = (await shownNotifications(page)).find(matches);
    if (found) return { notification: found, seconds: (Date.now() - start) / 1000 };
    await page.waitForTimeout(1000);
  }
  throw new Error(
    `sin notificación tras ${timeoutMs / 1000}s: ${JSON.stringify(await shownNotifications(page))}`,
  );
}

async function main(): Promise<void> {
  const db = getDb();
  const [member] = await db.select({ id: person.id }).from(person).where(eq(person.email, MEMBER));
  if (!member) throw new Error("falta oe.demo.01");
  await db.delete(pushSubscription).where(eq(pushSubscription.personId, member.id));

  const profile = mkdtempSync(join(tmpdir(), "casa-digital-push-"));
  const memberContext = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: false,
    permissions: ["notifications"],
  });
  const memberPage = memberContext.pages()[0] ?? (await memberContext.newPage());
  await login(memberPage, MEMBER);
  await memberPage.goto(`${BASE}/app/ajustes`);
  await memberPage.evaluate(() => navigator.serviceWorker.ready);
  logger.info({ permission: await memberPage.evaluate(() => Notification.permission) }, "permiso");
  memberPage.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      logger.warn({ text: msg.text().slice(0, 300) }, "consola del navegador");
    }
  });
  memberPage.on("response", (res) => {
    if (res.url().includes("/api/push/subscribe")) {
      logger.info({ method: res.request().method(), status: res.status() }, "api de suscripción");
    }
  });
  await memberPage.getByRole("button", { name: "Activar en este dispositivo" }).click();
  const outcome = memberPage
    .getByText(
      /Listo: este dispositivo ya recibe notificaciones\.|Este dispositivo recibe notificaciones\.|No pudimos activar las notificaciones/,
    )
    .first();
  await outcome.waitFor({ timeout: 45_000 }).catch(() => {});
  logger.info({ panel: (await outcome.textContent().catch(() => null)) ?? null }, "panel");
  const probe = await memberPage.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const sub = await registration.pushManager.getSubscription();
    return { scope: registration.scope, endpoint: sub ? new URL(sub.endpoint).host : null };
  });
  logger.info(probe, "service worker");
  if (!probe.endpoint) {
    throw new Error("sin suscripción push en el navegador");
  }
  const subscriptions = await db
    .select({ endpoint: pushSubscription.endpoint, userAgent: pushSubscription.userAgent })
    .from(pushSubscription)
    .where(eq(pushSubscription.personId, member.id));
  logger.info(
    {
      subscriptions: subscriptions.map(
        (s) => `${new URL(s.endpoint).host} · ${s.userAgent?.slice(0, 40)}`,
      ),
    },
    "suscripción",
  );

  // 1. ADMIN avisa por push un anuncio publicado.
  // El admin no necesita push: va en el Chromium de Playwright para no lanzar dos Google Chrome.
  const adminBrowser = await chromium.launch();
  const adminContext = await adminBrowser.newContext();
  const adminPage = await adminContext.newPage();
  await login(adminPage, ADMIN);
  // El anuncio de prueba vuelve a "sin push" y el miembro no tiene mensaje previo de ese anuncio.
  const [notice] = await db
    .select({ id: announcement.id })
    .from(announcement)
    .where(eq(announcement.title, "Anuncio de prueba: así se ve la cartelera"));
  if (!notice) throw new Error("falta el anuncio de prueba");
  await db
    .update(announcement)
    .set({ pushRequestedAt: null, pushSentAt: null, pushCount: 0 })
    .where(eq(announcement.id, notice.id));
  await db
    .delete(message)
    .where(
      and(eq(message.personId, member.id), eq(message.dedupeKey, `announcement:${notice.id}`)),
    );
  await adminPage.goto(`${BASE}/admin/cartelera`);
  const row = adminPage.getByRole("row", { name: /Anuncio de prueba: así se ve la cartelera/ });
  const t0 = Date.now();
  await row.getByRole("button", { name: "Avisar por push", exact: true }).click();
  const first = await waitForNotification(
    memberPage,
    (n) => /Anuncio de prueba/.test(n.title),
    90_000,
  );
  logger.info(
    { seconds: Number(((Date.now() - t0) / 1000).toFixed(1)), ...first.notification },
    "anuncio → notificación",
  );

  // 2. Una ocasión con encuesta a la que el miembro asistió se cierra: llega T-191 con su URL.
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, "2026-2"));
  const [survey] = await db
    .select({ id: form.id })
    .from(form)
    .where(eq(form.slug, "encuesta-actividad"));
  if (!current || !survey) throw new Error("falta el término o el formulario de encuesta");
  const now = Date.now();
  const values = {
    publicId: "demopush01",
    termId: current.id,
    title: "Push de prueba con encuesta",
    category: "TALK" as const,
    points: 5,
    status: "OPEN" as const,
    startsAt: new Date(now - 3_600_000),
    checkInOpensAt: new Date(now - 7_200_000),
    checkInClosesAt: new Date(now + 3_600_000),
    closedAt: null,
    surveyFormId: survey.id,
  };
  const [occ] = await db
    .insert(occasion)
    .values(values)
    .onConflictDoUpdate({ target: occasion.publicId, set: values })
    .returning({ id: occasion.id });
  if (!occ) throw new Error("sin ocasión");
  await db.delete(occasionSurveyInvite).where(eq(occasionSurveyInvite.occasionId, occ.id));
  await db
    .delete(message)
    .where(and(eq(message.personId, member.id), eq(message.dedupeKey, `survey:${occ.id}`)));
  await db
    .insert(checkIn)
    .values({ occasionId: occ.id, personId: member.id, status: "APPROVED", source: "HOST" })
    .onConflictDoNothing();
  const t1 = Date.now();
  await closeOccasionAs(SYSTEM_ACTOR, occ.id);
  const second = await waitForNotification(
    memberPage,
    (n) => /Push de prueba/.test(n.title),
    90_000,
  );
  logger.info(
    { seconds: Number(((Date.now() - t1) / 1000).toFixed(1)), ...second.notification },
    "encuesta → notificación",
  );
  const url = second.notification.data?.url ?? "";
  await memberPage.goto(`${BASE}${url}`);
  await memberPage.getByRole("button", { name: "Enviar respuestas" }).waitFor({ timeout: 15_000 });
  logger.info(
    { url: url.replace(/\/app\/encuesta\/.+/, "/app/encuesta/<token>") },
    "la URL del push abre la encuesta",
  );

  const rows = await db
    .select({ kind: message.kind, status: message.status, subject: message.subject })
    .from(message)
    .where(and(eq(message.personId, member.id), eq(message.provider, "webpush")));
  logger.info({ rows }, "mensajes webpush del miembro");
  // El perfil de Chrome se borra al final: su suscripción no sirve más y no debe seguir en la base.
  await db.delete(pushSubscription).where(eq(pushSubscription.personId, member.id));
  await memberContext.close();
  await adminBrowser.close();
  rmSync(profile, { recursive: true, force: true });
  await closeDb();
}

main().catch((error) => {
  logger.error({ err: error }, "la comprobación de push falló");
  process.exit(1);
});
