import { expect } from "@playwright/test";
import { and, asc, eq, isNull, notLike } from "drizzle-orm";
import { closeDb, getDb } from "@/db/client";
import {
  committee,
  committeeMembership,
  committeeRoleAssignment,
  person,
  sanction,
} from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { E2E_CALENDAR, E2E_TERM } from "./calendar";
import { test } from "./fixtures";
import { E2E_LEAVE_EMAIL, E2E_MEMBER_EMAIL } from "./global-setup";

// La dirección de un comité registra una falta desde su página de permanencia (Regl. art. 69 par. 2;
// ADR-060 regla 6 y ADR-112). El miembro de pruebas recibe por SQL el cargo de Gestión Humana de su
// comité base, que trae la capacidad PERMANENCE sin ser ADMIN ni líder técnico (ADR-058), y le
// registra la falta a otro miembro del mismo comité.
test.use({ storageState: "tests/e2e/.auth/member.json" });

const CAUSE = "e2e-No llegó a dos reuniones seguidas y no presentó descargos";
const REFERENCE = "Anexo 1, numeral 3";
/** Una falta leve suspende derechos y beneficios 20 días (Regl. art. 69.2). */
const MINOR_SUSPENSION_DAYS = 20;

interface Scenario {
  slug: string;
  committeeId: string;
  committeeName: string;
  termId: string;
  directorId: string;
  memberId: string;
}

/** Da al miembro de pruebas el cargo de Gestión Humana de su comité base y ubica a quien va a sancionar. */
async function seedDirector(): Promise<Scenario> {
  const db = getDb();
  const [director] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_MEMBER_EMAIL));
  const [member] = await db
    .select({ id: person.id })
    .from(person)
    .where(eq(person.email, E2E_LEAVE_EMAIL));
  const [home] = await db
    .select({ id: committee.id, slug: committee.slug, name: committee.name })
    .from(committee)
    .where(and(eq(committee.status, "ACTIVE"), notLike(committee.slug, "e2e-%")))
    .orderBy(asc(committee.name))
    .limit(1);
  const [current] = await db.select({ id: term.id }).from(term).where(eq(term.code, E2E_TERM.code));
  if (!director || !member || !home || !current) throw new Error("Faltan identidades sintéticas");
  const [seat] = await db
    .select({ id: committeeMembership.id })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, director.id),
        eq(committeeMembership.committeeId, home.id),
        eq(committeeMembership.termId, current.id),
        isNull(committeeMembership.leftAt),
      ),
    );
  if (!seat) throw new Error("El miembro de pruebas no está en su comité base");
  await db.insert(committeeRoleAssignment).values({
    membershipId: seat.id,
    personId: director.id,
    committeeId: home.id,
    termId: current.id,
    roleCode: "GESTION_HUMANA",
    coDirector: false,
  });
  await db
    .update(committeeMembership)
    .set({ roleCode: "GESTION_HUMANA" })
    .where(eq(committeeMembership.id, seat.id));
  await closeDb();
  return {
    slug: home.slug,
    committeeId: home.id,
    committeeName: home.name,
    termId: current.id,
    directorId: director.id,
    memberId: member.id,
  };
}

function daysAfter(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("la dirección registra una falta leve a un miembro de su comité y queda a nombre del comité", async ({
  page,
}) => {
  const scenario = await seedDirector();
  const today = E2E_CALENDAR.day;

  await page.goto(`/admin/comites/${scenario.slug}/permanencia`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    t("T-818", { comité: scenario.committeeName }),
  );
  const form = page.getByRole("region", { name: t("T-2242") });
  const [
    kindField = "",
    causeField = "",
    referenceField = "",
    dateField = "",
    ,
    ,
    memberField = "",
  ] = tList("T-2230");
  const [recordLabel = ""] = tList("T-2232");
  await form.getByLabel(memberField).selectOption(scenario.memberId);
  await form.getByLabel(kindField).selectOption("MINOR");
  await form.getByLabel(causeField).fill(CAUSE);
  await form.getByLabel(referenceField).fill(REFERENCE);
  await form.getByLabel(dateField).fill(today);
  await form.getByRole("button", { name: recordLabel, exact: true }).click();

  await expect(page).toHaveURL(/[?&]sancion=1/);
  await expect(page.getByText(t("T-259"), { exact: true })).toBeVisible();

  // Lo que quedó escrito: una sola falta, de esa persona, a nombre del comité y del término de la
  // ruta (el formulario no los manda: los pone la action, ADR-112), con quien la registró.
  const rows = await getDb()
    .select()
    .from(sanction)
    .where(eq(sanction.personId, scenario.memberId));
  await closeDb();
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({
    personId: scenario.memberId,
    termId: scenario.termId,
    committeeId: scenario.committeeId,
    kind: "MINOR",
    cause: CAUSE,
    reference: REFERENCE,
    occurredOn: today,
    suspendedFrom: today,
    suspendedUntil: daysAfter(today, MINOR_SUSPENSION_DAYS),
    issuedById: scenario.directorId,
    revokedAt: null,
    revokedById: null,
    revokeReason: null,
  });
});
