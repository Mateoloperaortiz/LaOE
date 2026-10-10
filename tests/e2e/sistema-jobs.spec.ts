import { expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { MAX_ATTEMPTS } from "@/jobs/backoff";
import { person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { test } from "./fixtures";
import { E2E_EMAIL } from "./global-setup";

// El botón «Reintentar» de la pantalla de jobs (T-245): ADMIN devuelve a la cola un evento que agotó
// sus intentos. La action y el comando tienen su prueba (`tests/unit/outbox-retry-action.test.ts` y
// `tests/integration/outbox-retry.test.ts`); acá se hace el clic.
test.use({ storageState: "tests/e2e/.auth/admin.json" });

// Un tipo que no está en el catálogo ni tiene handler: el poller lo da por procesado (ADR-034), así
// que el drenado con el que cierra cada escenario lo recoge de la cola sin fallar.
const EVENT_TYPE = "e2e.reintento";
const LAST_ERROR = "e2e-no hoy";

test("ADMIN reintenta un evento en dead letter y la fila vuelve a la cola sin intentos ni error", async ({
  page,
}) => {
  const db = getDb();
  const [admin] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  if (!admin) throw new Error("Falta la identidad ADMIN sintética");
  const failedAt = new Date(Date.now() - 60 * 60_000);
  const [dead] = await db
    .insert(outbox)
    .values({
      eventType: EVENT_TYPE,
      payload: {},
      attempts: MAX_ATTEMPTS,
      nextAttemptAt: failedAt,
      deadLetterAt: failedAt,
      lastError: LAST_ERROR,
    })
    .returning({ id: outbox.id });
  await closeDb();
  if (!dead) throw new Error("No se pudo sembrar el evento en dead letter");

  await page.goto("/admin/sistema/jobs");
  const sectionOf = (title: string) =>
    page.locator("section").filter({ has: page.getByRole("heading", { name: title }) });
  const deadRow = sectionOf(t("T-244")).locator("tbody tr").filter({ hasText: EVENT_TYPE });
  const pendingRow = sectionOf(t("T-242")).locator("tbody tr").filter({ hasText: EVENT_TYPE });
  await expect(deadRow).toContainText(LAST_ERROR);
  await expect(pendingRow).toHaveCount(0);

  await deadRow.getByRole("button", { name: t("T-245"), exact: true }).click();

  await expect(deadRow).toHaveCount(0);
  await expect(pendingRow).toHaveCount(1);

  // Lo que quedó escrito: la misma fila, otra vez pendiente y lista para correr, y la auditoría del
  // reintento a nombre de quien hizo clic.
  const [requeued] = await getDb().select().from(outbox).where(eq(outbox.id, dead.id));
  const audits = await getDb()
    .select({ actorId: auditLog.actorId, entityId: auditLog.entityId })
    .from(auditLog)
    .where(eq(auditLog.action, "outbox.retried"));
  await closeDb();
  expect(requeued).toMatchObject({
    eventType: EVENT_TYPE,
    attempts: 0,
    lastError: null,
    deadLetterAt: null,
    processedAt: null,
  });
  expect(requeued?.nextAttemptAt.getTime()).toBeGreaterThan(failedAt.getTime());
  expect(audits).toEqual([{ actorId: admin.id, entityId: dead.id }]);
});
