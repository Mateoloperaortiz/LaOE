import { expect } from "@playwright/test";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import { person, sanction } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { E2E_CALENDAR, E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// ADMIN registra y revoca una sanción desde la pestaña Membresía de la Persona 360 (ADR-060 regla 6,
// ADR-112 y ADR-114 regla 3).
test.use({ storageState: "tests/e2e/.auth/admin.json" });

const CAUSE = "e2e-Incumplió un compromiso con un aliado y presentó descargos por escrito";
const REASON = "e2e-La junta revisó los descargos y levantó la sanción";

test("ADMIN registra una falta grave en la Persona 360 y después la revoca con su motivo", async ({
  page,
}) => {
  const db = getDb();
  const [admin] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_EMAIL));
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  if (!admin || !member || !current) throw new Error("Faltan identidades sintéticas");
  // Decisión abierta 66: hoy registrar y revocar una sanción piden ADMIN y no el paso de seguridad
  // (no están en la lista de `docs/05-acceso.md`). El paso se envejece para que quede fijado: con la
  // ventana de 15 minutos vencida, ninguno de los dos envíos manda a `/ingresar/paso`.
  await db.execute(
    sql`update session set otp_verified_at = now() - interval '20 minutes' where person_id = ${admin.id}`,
  );
  await closeDb();

  const [recordLabel = "", revokeLabel = ""] = tList("T-2232");
  const [, emptyLabel = ""] = tList("T-2239");
  const [liveLabel = "", , revokedLabel = ""] = tList("T-2243");
  const [kindField = "", causeField = "", , dateField = ""] = tList("T-2230");
  const today = E2E_CALENDAR.day;

  await page.goto(`/admin/personas/${member.id}?pestana=membresia`);
  await expect(page.getByText(emptyLabel, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: recordLabel, exact: true }).click();
  const recordPanel = page.getByRole("dialog");
  await recordPanel.getByLabel(kindField, { exact: true }).selectOption("MAJOR");
  await recordPanel.getByLabel(causeField, { exact: true }).fill(CAUSE);
  await recordPanel.getByLabel(dateField, { exact: true }).fill(today);
  await recordPanel.getByRole("button", { name: recordLabel, exact: true }).click();

  await expect(page).toHaveURL(/pestana=membresia&guardado=1$/);
  const entry = page.getByRole("listitem").filter({ hasText: CAUSE });
  await expect(entry).toContainText(liveLabel);

  // Lo que quedó escrito al registrar: la sanción viva, de la junta (sin comité) y a nombre de ADMIN.
  const recorded = await getDb().select().from(sanction).where(eq(sanction.personId, member.id));
  await closeDb();
  expect(recorded).toHaveLength(1);
  expect(recorded[0]).toMatchObject({
    personId: member.id,
    termId: current.id,
    committeeId: null,
    kind: "MAJOR",
    cause: CAUSE,
    occurredOn: today,
    suspendedFrom: null,
    suspendedUntil: null,
    issuedById: admin.id,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
  });

  await entry.getByRole("link", { name: revokeLabel, exact: true }).click();
  const revokePanel = page.getByRole("dialog");
  await revokePanel.getByLabel(t("T-2240"), { exact: true }).fill(REASON);
  await revokePanel.getByRole("button", { name: revokeLabel, exact: true }).click();

  await expect(page).toHaveURL(/pestana=membresia&guardado=1$/);
  await expect(entry).toContainText(revokedLabel);
  await expect(entry).toContainText(REASON);
  await expect(page.getByRole("link", { name: revokeLabel, exact: true })).toHaveCount(0);

  // El estado final: la misma fila, revocada por ADMIN con su motivo.
  const revoked = await getDb().select().from(sanction).where(eq(sanction.personId, member.id));
  await closeDb();
  expect(revoked).toHaveLength(1);
  expect(revoked[0]).toMatchObject({
    id: recorded[0]?.id,
    personId: member.id,
    kind: "MAJOR",
    revokedById: admin.id,
    revokeReason: REASON,
  });
  expect(revoked[0]?.revokedAt).toBeInstanceOf(Date);
});
