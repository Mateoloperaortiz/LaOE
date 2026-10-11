import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { campaign, campaignRecipient, emailTemplate, message } from "@/modules/comms/schema";
import { competitionSupport } from "@/modules/competition/schema";
import { document, mediaAsset, page } from "@/modules/content/schema";
import {
  card,
  interaction,
  internalCall,
  internalCallEntry,
  organization,
  pipeline,
  pipelineStage,
  request,
} from "@/modules/crm/schema";
import { event, eventEdition } from "@/modules/events/schema";
import { form, formSubmission } from "@/modules/forms/schema";
import { createWalletCarnetToken } from "@/modules/identity/domain/carnet-pure";
import { hashPassword } from "@/modules/identity/domain/pure";
import { carnetToken, credential, permission } from "@/modules/identity/schema";
import { dayKeyFor, weekKeyFor } from "@/modules/participation/domain/gamification-pure";
import {
  achievement,
  badgeDefinition,
  boosterItem,
  challenge,
  challengeEvidenceFile,
  challengeParticipation,
  challengeQuestion,
  checkIn,
  occasion,
  reward,
  wordleGame,
} from "@/modules/participation/schema";
import {
  appointment,
  committee,
  committeeMembership,
  committeeRoleAssignment,
  consent,
  membership,
  membershipTerm,
  person,
  segment,
  tag,
} from "@/modules/people/schema";
import {
  leaderScore,
  manualCredit,
  permanenceRule,
  permanenceTable,
  workGroup,
  workGroupEvaluator,
  workGroupMembership,
} from "@/modules/permanence/schema";
import { appConfig, legacyAlias } from "@/modules/system/schema";
import { conventionalTermDates } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { walletPass } from "@/modules/wallet/schema";
import { todayKey } from "@/shared/lib/dates";
import { TEST_POLICY_VERSION } from "./policy-version";

// Fábricas de datos sintéticos para las pruebas de integración y de la E2E: nunca datos reales.
// Escriben filas, no llaman comandos, y lo hacen por `getDb()`: en integración es la base `_test` y
// en la E2E la base desechable que el lanzador deja en `DATABASE_URL`. No importan nada de
// `tests/integration` ni de `tests/e2e`, para que las dos suites puedan compartirlas.

const db = () => getDb();

/** El código del término que contiene hoy en Bogotá, con fechas por semestre calendario. */
export function currentTermCode(): string {
  const today = todayKey();
  const year = today.slice(0, 4);
  const month = Number.parseInt(today.slice(5, 7), 10);
  return `${year}-${month <= 6 ? 1 : 2}`;
}

/**
 * El término de ese código: si ya existe devuelve el que hay, con las fechas que tenga. Uno nuevo
 * nace con las fechas convencionales del semestre calendario, salvo las que se pidan en `dates`.
 */
export async function seedTerm(
  code = currentTermCode(),
  dates: Partial<{ startsOn: string; endsOn: string }> = {},
): Promise<string> {
  const [existing] = await db().select({ id: term.id }).from(term).where(eq(term.code, code));
  if (existing) {
    return existing.id;
  }
  const [row] = await db()
    .insert(term)
    .values({
      code,
      semester: code.endsWith("-2") ? 2 : 1,
      ...conventionalTermDates(code),
      ...dates,
    })
    .returning({ id: term.id });
  if (!row) throw new Error("seed term");
  return row.id;
}

type PersonOverrides = Partial<{
  firstName: string;
  lastName: string;
  stage: "PROSPECT" | "APPLICANT" | "MEMBER" | "ALUMNI";
  kind: "STUDENT" | "EXTERNAL";
  phone: string | null;
  program: string | null;
  personalEmail: string | null;
  /** De dónde viene la fila: `TEST` si no se dice; la E2E marca las suyas con `E2E`. */
  source: string;
  /** Término de ingreso de `seedMember`; uno anterior al actual lo hace veterano (sin la guarda de nuevo, ADR-060 regla 11). */
  entryTermCode: string;
}>;

/** Varias personas en una sola escritura, cada una con sus overrides; devuelve sus ids en el orden pedido. */
export async function seedPeople(
  people: Array<{ email: string } & PersonOverrides>,
): Promise<string[]> {
  if (people.length === 0) return [];
  const rows = await db()
    .insert(person)
    .values(
      people.map((one) => ({
        email: one.email,
        firstName: one.firstName ?? "Persona",
        lastName: one.lastName ?? "Sintética",
        stage: one.stage ?? "MEMBER",
        kind: one.kind ?? "STUDENT",
        phone: one.phone ?? null,
        program: one.program ?? null,
        personalEmail: one.personalEmail ?? null,
        source: one.source ?? "TEST",
      })),
    )
    .returning({ id: person.id, email: person.email });
  const ids = new Map(rows.map((row) => [row.email, row.id]));
  return people.map((one) => {
    const id = ids.get(one.email);
    if (!id) throw new Error("seed person");
    return id;
  });
}

export async function seedPerson(email: string, overrides: PersonOverrides = {}): Promise<string> {
  const [id] = await seedPeople([{ email, ...overrides }]);
  if (!id) throw new Error("seed person");
  return id;
}

type MembershipStatus = NonNullable<(typeof membership.$inferInsert)["status"]>;
type MembershipEndReason = NonNullable<(typeof membership.$inferInsert)["endReason"]>;

/**
 * La membresía de varias personas en una sola escritura, con el mismo término de ingreso y el mismo
 * estado; devuelve sus ids en el orden pedido. Una inactiva lleva su fecha y su motivo de salida
 * (`endReason`), que el esquema exige juntos. No es todo lo que deja una baja: `endMembership` escribe
 * además el último semestre (`lastTermId`), sube la época del carné (`walletEpoch`) y pasa a la persona
 * a exalumna; `tests/integration/factory-parity.test.ts` fija esa diferencia (DT-351).
 */
export async function seedMemberships(
  personIds: string[],
  termId: string,
  status: MembershipStatus = "ACTIVE",
  endReason: MembershipEndReason = "OTHER",
): Promise<string[]> {
  if (personIds.length === 0) return [];
  const rows = await db()
    .insert(membership)
    .values(
      personIds.map((personId) => ({
        personId,
        firstTermId: termId,
        status,
        ...(status === "INACTIVE" ? { endedAt: new Date(), endReason } : {}),
      })),
    )
    .returning({ id: membership.id, personId: membership.personId });
  const ids = new Map(rows.map((row) => [row.personId, row.id]));
  return personIds.map((personId) => {
    const id = ids.get(personId);
    if (!id) throw new Error("seed membership");
    return id;
  });
}

export async function seedMembership(
  personId: string,
  termId: string,
  status: MembershipStatus = "ACTIVE",
  endReason: MembershipEndReason = "OTHER",
): Promise<string> {
  const [id] = await seedMemberships([personId], termId, status, endReason);
  if (!id) throw new Error("seed membership");
  return id;
}

/** Persona del roster con membresía activa en el término actual; devuelve su id. */
export async function seedMember(email: string, overrides: PersonOverrides = {}): Promise<string> {
  const termId = await seedTerm();
  const personId = await seedPerson(email, overrides);
  const entryTermId = overrides.entryTermCode ? await seedTerm(overrides.entryTermCode) : termId;
  await seedMembership(personId, entryTermId);
  return personId;
}

/** Un activo veterano: entró en un término anterior, así que puede recibir cargos de mesa. */
export async function seedVeteran(email: string, overrides: PersonOverrides = {}): Promise<string> {
  return seedMember(email, { entryTermCode: "2025-1", ...overrides });
}

/**
 * Permiso global (ADMIN, BOARD) o de líder de un comité. Deja la fila que deja `grantPermission`
 * (`tests/integration/factory-parity.test.ts`) y nada más de lo que hace el comando: no audita, no
 * emite el evento ni retira los enlaces de acceso de la persona. Si ya lo tiene, devuelve el que hay.
 * `grantedById` está para esa comparación: el comando escribe a quien concede, y sin decirlo queda nulo.
 */
export async function seedPermission(
  personId: string,
  code: (typeof permission.$inferInsert)["code"],
  committeeId: string | null = null,
  grantedById: string | null = null,
): Promise<string> {
  const [row] = await db()
    .insert(permission)
    .values({ personId, code, committeeId, grantedById })
    .onConflictDoNothing()
    .returning({ id: permission.id });
  if (row) return row.id;
  const [existing] = await db()
    .select({ id: permission.id })
    .from(permission)
    .where(
      and(
        eq(permission.personId, personId),
        eq(permission.code, code),
        committeeId ? eq(permission.committeeId, committeeId) : isNull(permission.committeeId),
      ),
    );
  if (!existing) throw new Error("seed permission");
  return existing.id;
}

/**
 * Deja a la persona con esa contraseña. Si ya tenía credencial, se la cambia: la preparación de la
 * E2E vuelve a pasar por identidades que ya traen la suya.
 */
export async function seedCredential(personId: string, password: string): Promise<void> {
  const passwordHash = await hashPassword(password);
  await db()
    .insert(credential)
    .values({ personId, passwordHash })
    .onConflictDoUpdate({ target: credential.personId, set: { passwordHash } });
}

type CommitteeOverrides = Partial<{
  status: "ACTIVE" | "INACTIVE" | "ON_TRIAL";
  /** Un comité desactivado (ADR-073) necesita su fecha, como exige `committeeLifecycleError`. */
  deactivatedOn: string;
  /** La fábrica lo publica; una fila de `committee` nace en borrador. */
  publicationStatus: "DRAFT" | "PUBLISHED";
  logoKey: string | null;
  presentation: string | null;
}>;

/** Un comité activo y publicado, sin logo ni presentación, salvo que se diga otra cosa. */
export async function seedCommittee(
  slug: string,
  name = slug.toUpperCase(),
  overrides: CommitteeOverrides = {},
): Promise<string> {
  const status = overrides.status ?? "ACTIVE";
  const [row] = await db()
    .insert(committee)
    .values({
      slug,
      name,
      status,
      publicationStatus: overrides.publicationStatus ?? "PUBLISHED",
      logoKey: overrides.logoKey ?? null,
      presentation: overrides.presentation ?? null,
      deactivatedOn:
        overrides.deactivatedOn ?? (status === "INACTIVE" ? conventionalDeactivation() : null),
    })
    .returning({ id: committee.id });
  if (!row) throw new Error("seed committee");
  return row.id;
}

/** Una fecha de desactivación en el pasado, para que el comité quede fuera sin depender del reloj. */
function conventionalDeactivation(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Pertenencia en un comité y término. Un cargo distinto de MIEMBRO también se escribe como cargo
 * asignado (ADR-058); `roleCode` queda como cargo principal (o MIEMBRO si el cargo es codirección
 * sin otro cargo, igual que hace el dominio).
 */
export async function seedCommitteeMembership(
  personId: string,
  committeeId: string,
  termId: string,
  roleCode = "MIEMBRO",
  overrides: Partial<{
    joinedAt: Date | null;
    leftAt: Date | null;
    transferredIn: boolean;
    coDirector: boolean;
  }> = {},
): Promise<string> {
  const [row] = await db()
    .insert(committeeMembership)
    .values({
      personId,
      committeeId,
      termId,
      roleCode,
      joinedAt: overrides.joinedAt === undefined ? new Date() : overrides.joinedAt,
      leftAt: overrides.leftAt ?? null,
      transferredIn: overrides.transferredIn ?? false,
    })
    .returning({ id: committeeMembership.id });
  if (!row) throw new Error("seed committee membership");
  if (roleCode !== "MIEMBRO") {
    await db()
      .insert(committeeRoleAssignment)
      .values({
        membershipId: row.id,
        personId,
        committeeId,
        termId,
        roleCode,
        coDirector: overrides.coDirector ?? false,
      });
  }
  return row.id;
}

/**
 * Autorización viva de una persona para una finalidad, con la versión de la política que traen las
 * bases de prueba. Si ya tiene una viva no choca: queda la que había, como con `recordConsent`.
 */
export async function seedConsent(
  personId: string,
  purpose: (typeof consent.$inferInsert)["purpose"] = "MEMBERSHIP",
  source: (typeof consent.$inferInsert)["source"] = "SELF",
): Promise<void> {
  await db()
    .insert(consent)
    .values({ personId, purpose, source, policyVersion: TEST_POLICY_VERSION })
    // Solo calla el choque con la autorización viva (`consent_live_unique`), no otro.
    .onConflictDoNothing({
      target: [consent.personId, consent.purpose],
      where: isNull(consent.revokedAt),
    });
}

/**
 * Un segmento sin creador y con el filtro vacío, que alcanza a todas las personas. `createSegment`
 * escribe además cada filtro con su valor por defecto y a quien lo crea; el vacío se lee igual
 * (`tests/integration/factory-parity.test.ts`).
 */
export async function seedSegment(name = "Todos"): Promise<string> {
  const [row] = await db()
    .insert(segment)
    .values({ name, filter: {} })
    .returning({ id: segment.id });
  if (!row) throw new Error("seed segment");
  return row.id;
}

/** Una etiqueta sin color. */
export async function seedTag(name: string): Promise<string> {
  const [row] = await db().insert(tag).values({ name }).returning({ id: tag.id });
  if (!row) throw new Error("seed tag");
  return row.id;
}

/**
 * Correos que el proveedor ya había enviado antes de la prueba, que es lo que cuenta contra el cupo:
 * ningún comando deja un envío hecho sin pasar por el proveedor. Llevan un asunto numerado, salvo
 * que se diga uno.
 */
export async function seedSentEmails(
  personId: string,
  amount: number,
  sent: {
    provider: string;
    sentAt: Date;
    kind?: (typeof message.$inferInsert)["kind"];
    subject?: string;
  },
): Promise<void> {
  await db()
    .insert(message)
    .values(
      Array.from({ length: amount }, (_, index) => ({
        personId,
        channel: "EMAIL" as const,
        kind: sent.kind ?? "TRANSACTIONAL",
        subject: sent.subject ?? `Previo ${index}`,
        status: "SENT" as const,
        provider: sent.provider,
        sentAt: sent.sentAt,
      })),
    );
}

type OccasionOverrides = Partial<{
  title: string;
  kind: "ACTIVITY" | "ASSEMBLY" | "EDITION_SESSION";
  assemblyKind: "ORDINARY" | "BOARD_ELECTION" | "RUNOFF" | null;
  category: (typeof occasion.$inferInsert)["category"];
  newMembersOnly: boolean;
  points: number;
  approval: "AUTO" | "MANUAL";
  status: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED";
  requireRotatingCode: boolean;
  rotatingSecret: string | null;
  committeeId: string | null;
  startsAt: Date;
  checkInOpensAt: Date;
  checkInClosesAt: Date;
  publicId: string;
}>;

let occasionCounter = 0;

/** Ocasión abierta ahora mismo, con 10 puntos y aprobación automática salvo que se diga otra cosa. */
export async function seedOccasion(
  termId: string,
  overrides: OccasionOverrides = {},
): Promise<{ id: string; publicId: string }> {
  occasionCounter += 1;
  const now = Date.now();
  const [row] = await db()
    .insert(occasion)
    .values({
      termId,
      publicId:
        overrides.publicId ??
        `t${String(occasionCounter).padStart(4, "0")}${String(now % 100_000).padStart(5, "0")}`,
      title: overrides.title ?? `Ocasión de prueba ${occasionCounter}`,
      kind: overrides.kind ?? "ACTIVITY",
      assemblyKind: overrides.assemblyKind ?? null,
      category: overrides.category ?? "OTHER",
      newMembersOnly: overrides.newMembersOnly ?? false,
      points: overrides.points ?? 10,
      approval: overrides.approval ?? "AUTO",
      status: overrides.status ?? "OPEN",
      requireRotatingCode: overrides.requireRotatingCode ?? false,
      rotatingSecret: overrides.rotatingSecret ?? null,
      committeeId: overrides.committeeId ?? null,
      startsAt: overrides.startsAt ?? new Date(now),
      checkInOpensAt: overrides.checkInOpensAt ?? new Date(now - 3_600_000),
      checkInClosesAt: overrides.checkInClosesAt ?? new Date(now + 3_600_000),
    })
    .returning({ id: occasion.id, publicId: occasion.publicId });
  if (!row) throw new Error("seed occasion");
  return row;
}

type CheckInRow = typeof checkIn.$inferInsert;

/**
 * Check-in de una persona en una ocasión: aprobado, puesto por un admin y con la hora de ahora, salvo
 * que se diga otra cosa (sin crédito en el ledger: para permanencia).
 */
export async function seedCheckIn(
  occasionId: string,
  personId: string,
  status: NonNullable<CheckInRow["status"]> = "APPROVED",
  overrides: Partial<{ source: NonNullable<CheckInRow["source"]>; at: Date; reason: string }> = {},
): Promise<string> {
  const [row] = await db()
    .insert(checkIn)
    .values({
      occasionId,
      personId,
      status,
      source: overrides.source ?? "ADMIN",
      reason: overrides.reason ?? null,
      ...(overrides.at ? { at: overrides.at } : {}),
    })
    .returning({ id: checkIn.id });
  if (!row) throw new Error("seed check-in");
  return row.id;
}

export async function seedAppointment(
  personId: string,
  termId: string,
  kind:
    | "PRESIDENT"
    | "VP_GH"
    | "VP_PUBLIC_RELATIONS"
    | "VP_ADMIN"
    | "VP_FINANCE"
    | "VP_COMMUNICATIONS"
    | "GH_HEAD"
    | "GH_DIRECTOR"
    | "OTHER",
  committeeId: string | null = null,
): Promise<string> {
  const [row] = await db()
    .insert(appointment)
    .values({ personId, termId, kind, committeeId })
    .returning({ id: appointment.id });
  if (!row) throw new Error("seed appointment");
  return row.id;
}

/**
 * Condición de prueba en un término (ADR-027). `flags` dice además si la persona se reporta como
 * activa o si retomó la condición de nuevo; sin ellos quedan como los deja la base, en falso.
 */
export async function seedMembershipTerm(
  personId: string,
  termId: string,
  probation = true,
  flags: Partial<{ reportAsVeteran: boolean; resumedNew: boolean }> = {},
): Promise<void> {
  await db()
    .insert(membershipTerm)
    .values({ personId, termId, probation, reason: "prueba de integración", ...flags })
    .onConflictDoUpdate({
      target: [membershipTerm.personId, membershipTerm.termId],
      targetWhere: isNull(membershipTerm.committeeId),
      set: { probation, ...flags },
    });
}

type RuleOverrides = Partial<{
  scope: "GENERAL" | "COMMITTEE";
  committeeId: string | null;
  label: string;
  description: string;
  weight: number;
  appliesTo: "ALL" | "NEW" | "VETERAN";
  computation:
    | "CHECKIN_COUNT"
    | "CHECKIN_THRESHOLD"
    | "CHECKIN_RATE"
    | "GROUP_EVALUATED"
    | "COMPOSITE"
    | "LEADER_SCORE"
    | "MANUAL";
  params: Record<string, unknown>;
  sortOrder: number;
}>;

/** Un criterio de permanencia; por defecto general, manual y de peso 10. */
export async function seedRule(
  termId: string,
  key: string,
  overrides: RuleOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(permanenceRule)
    .values({
      termId,
      key,
      scope: overrides.scope ?? (overrides.committeeId ? "COMMITTEE" : "GENERAL"),
      committeeId: overrides.committeeId ?? null,
      label: overrides.label ?? key,
      description: overrides.description ?? "",
      weight: overrides.weight ?? 10,
      appliesTo: overrides.appliesTo ?? "ALL",
      computation: overrides.computation ?? "MANUAL",
      params: overrides.params ?? {},
      sortOrder: overrides.sortOrder ?? 0,
    })
    .returning({ id: permanenceRule.id });
  if (!row) throw new Error("seed rule");
  return row.id;
}

/** Bloqueo o comentario de una tabla (general con committeeId nulo). */
export async function seedTable(
  termId: string,
  committeeId: string | null,
  overrides: Partial<{ lockedAt: Date | null; comment: string | null }> = {},
): Promise<string> {
  const [row] = await db()
    .insert(permanenceTable)
    .values({
      termId,
      scope: committeeId ? "COMMITTEE" : "GENERAL",
      committeeId,
      lockedAt: overrides.lockedAt ?? null,
      comment: overrides.comment ?? null,
    })
    .returning({ id: permanenceTable.id });
  if (!row) throw new Error("seed table");
  return row.id;
}

type GroupOverrides = Partial<{
  kind: "WORK_COMMITTEE" | "GT_MACROEVENT" | "GAP" | "GAP_OE" | "BARRA_BRAVA" | "NEW_MEMBER_TASK";
  code: string | null;
  leaderPersonId: string | null;
  evaluatorIds: string[];
}>;

export async function seedWorkGroup(
  termId: string,
  name: string,
  overrides: GroupOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(workGroup)
    .values({
      termId,
      name,
      kind: overrides.kind ?? "GAP",
      code: overrides.code ?? null,
      leaderPersonId: overrides.leaderPersonId ?? null,
    })
    .returning({ id: workGroup.id });
  if (!row) throw new Error("seed work group");
  if (overrides.evaluatorIds && overrides.evaluatorIds.length > 0) {
    await db()
      .insert(workGroupEvaluator)
      .values(overrides.evaluatorIds.map((personId) => ({ groupId: row.id, personId })));
  }
  return row.id;
}

export async function seedWorkGroupMembership(
  groupId: string,
  personId: string,
  evaluation: "PENDING" | "GOOD" | "INSUFFICIENT" = "PENDING",
  evaluatedById: string | null = null,
): Promise<string> {
  const [row] = await db()
    .insert(workGroupMembership)
    .values({
      groupId,
      personId,
      evaluation,
      evaluatedById,
      evaluatedAt: evaluation === "PENDING" ? null : new Date(),
      note: evaluation === "INSUFFICIENT" ? "Nota de prueba" : null,
    })
    .returning({ id: workGroupMembership.id });
  if (!row) throw new Error("seed work group membership");
  return row.id;
}

// Fase 5 (ADR-037): formularios, organizaciones, pipelines, solicitudes y convocatorias.

type FormOverrides = Partial<{
  title: string;
  audience: "PUBLIC" | "MEMBERS";
  status: "DRAFT" | "OPEN" | "CLOSED";
  fields: unknown[];
  actions: Record<string, unknown>;
  allowMultiple: boolean;
  consentRequired: boolean;
  maxSubmissions: number | null;
  opensAt: Date | null;
  closesAt: Date | null;
}>;

export async function seedForm(slug: string, overrides: FormOverrides = {}): Promise<string> {
  const [row] = await db()
    .insert(form)
    .values({
      slug,
      title: overrides.title ?? slug,
      audience: overrides.audience ?? "PUBLIC",
      status: overrides.status ?? "OPEN",
      fields: overrides.fields ?? [],
      actions: overrides.actions ?? { createPerson: true },
      allowMultiple: overrides.allowMultiple ?? false,
      consentRequired: overrides.consentRequired ?? true,
      maxSubmissions: overrides.maxSubmissions ?? null,
      opensAt: overrides.opensAt ?? null,
      closesAt: overrides.closesAt ?? null,
    })
    .returning({ id: form.id });
  if (!row) throw new Error("seed form");
  return row.id;
}

export async function seedSubmission(
  formId: string,
  email: string,
  overrides: Partial<{
    personId: string | null;
    answers: Record<string, unknown>;
    ip: string;
  }> = {},
): Promise<string> {
  const [row] = await db()
    .insert(formSubmission)
    .values({
      formId,
      email,
      personId: overrides.personId ?? null,
      answers: overrides.answers ?? {},
      ip: overrides.ip ?? null,
    })
    .returning({ id: formSubmission.id });
  if (!row) throw new Error("seed submission");
  return row.id;
}

export async function seedOrganization(
  name: string,
  kind: "COMPANY" | "EAFIT_UNIT" | "STUDENT_GROUP" | "OTHER" = "COMPANY",
): Promise<string> {
  const [row] = await db()
    .insert(organization)
    .values({ name, kind })
    .returning({ id: organization.id });
  if (!row) throw new Error("seed organization");
  return row.id;
}

/** Pipeline con sus etapas; devuelve el id y las etapas en orden. Con una lista vacía nace sin etapas. */
export async function seedPipeline(
  name: string,
  kind: "ADMISSION" | "SPONSORSHIP" | "CUSTOM" = "ADMISSION",
  stages: Array<{ name: string; isWon?: boolean; isLost?: boolean }> = [
    { name: "Recibida" },
    { name: "Entrevista" },
    { name: "Alta", isWon: true },
    { name: "No admitida", isLost: true },
  ],
): Promise<{ id: string; stages: Array<{ id: string; name: string }> }> {
  const [row] = await db().insert(pipeline).values({ name, kind }).returning({ id: pipeline.id });
  if (!row) throw new Error("seed pipeline");
  if (stages.length === 0) return { id: row.id, stages: [] };
  const created = await db()
    .insert(pipelineStage)
    .values(
      stages.map((stage, index) => ({
        pipelineId: row.id,
        name: stage.name,
        sortOrder: index,
        isWon: stage.isWon ?? false,
        isLost: stage.isLost ?? false,
      })),
    )
    .returning({ id: pipelineStage.id, name: pipelineStage.name });
  return { id: row.id, stages: created };
}

export async function seedCard(
  pipelineId: string,
  stageId: string,
  subject: { personId?: string; organizationId?: string },
  overrides: Partial<{ title: string; submissionId: string | null; editionId: string | null }> = {},
): Promise<string> {
  const [row] = await db()
    .insert(card)
    .values({
      pipelineId,
      stageId,
      personId: subject.personId ?? null,
      organizationId: subject.organizationId ?? null,
      title: overrides.title ?? "Tarjeta",
      submissionId: overrides.submissionId ?? null,
      editionId: overrides.editionId ?? null,
    })
    .returning({ id: card.id });
  if (!row) throw new Error("seed card");
  return row.id;
}

export async function seedRequest(
  personId: string,
  termId: string,
  kind: "LEAVE" | "RESIGNATION" | "TRANSFER" = "LEAVE",
  overrides: Partial<{
    payload: Record<string, unknown>;
    status: "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";
    reason: string | null;
  }> = {},
): Promise<string> {
  const [row] = await db()
    .insert(request)
    .values({
      personId,
      termId,
      kind,
      payload: overrides.payload ?? { reason: "Motivo de prueba" },
      status: overrides.status ?? "PENDING",
      reason: overrides.reason ?? null,
    })
    .returning({ id: request.id });
  if (!row) throw new Error("seed request");
  return row.id;
}

export async function seedCall(
  termId: string,
  groupId: string,
  overrides: Partial<{
    title: string;
    formId: string | null;
    opensAt: Date;
    closesAt: Date;
    capacity: number | null;
    selection: "FIRST_COME" | "MANUAL";
    status: "DRAFT" | "OPEN" | "CLOSED";
  }> = {},
): Promise<string> {
  const now = Date.now();
  const [row] = await db()
    .insert(internalCall)
    .values({
      termId,
      groupId,
      title: overrides.title ?? "Convocatoria de prueba",
      formId: overrides.formId ?? null,
      opensAt: overrides.opensAt ?? new Date(now - 86_400_000),
      closesAt: overrides.closesAt ?? new Date(now + 7 * 86_400_000),
      capacity: overrides.capacity ?? null,
      selection: overrides.selection ?? "FIRST_COME",
      status: overrides.status ?? "OPEN",
    })
    .returning({ id: internalCall.id });
  if (!row) throw new Error("seed call");
  return row.id;
}

export async function seedCallEntry(
  callId: string,
  personId: string,
  status: "APPLIED" | "ACCEPTED" | "WAITLISTED" | "REJECTED" = "ACCEPTED",
): Promise<string> {
  const [row] = await db()
    .insert(internalCallEntry)
    .values({ callId, personId, status })
    .returning({ id: internalCallEntry.id });
  if (!row) throw new Error("seed call entry");
  return row.id;
}

/** Regreso previsto de una licencia dentro de la ventana de un año (ADR-060 regla 10): en `days` días. */
export function leaveUntilSoon(days = 90): string {
  return new Date(Date.now() + days * 24 * 60 * 60_000).toISOString().slice(0, 10);
}

// Gamificación (ADR-067): retos, participaciones y boosters.

type ChallengeOverrides = Partial<{
  kind: "PRESENTIAL" | "TRIVIA" | "EVIDENCE";
  status: "DRAFT" | "PUBLISHED" | "CANCELLED";
  title: string;
  audience: "ALL" | "NEW" | "VETERAN" | "COMMITTEES";
  audienceCommitteeIds: string[];
  opensAt: Date;
  closesAt: Date;
  basePoints: number;
  passPercent: number | null;
  occasionId: string | null;
}>;

let challengeCounter = 0;

/** Reto publicado y abierto ahora mismo: trivia con umbral 80 % y 5 puntos base, salvo overrides. */
export async function seedChallenge(
  termId: string,
  overrides: ChallengeOverrides = {},
): Promise<string> {
  challengeCounter += 1;
  const now = Date.now();
  const kind = overrides.kind ?? "TRIVIA";
  const status = overrides.status ?? "PUBLISHED";
  const occasionId =
    overrides.occasionId === undefined
      ? kind === "PRESENTIAL"
        ? (await seedOccasion(termId)).id
        : null
      : overrides.occasionId;
  const [row] = await db()
    .insert(challenge)
    .values({
      termId,
      kind,
      status,
      title: overrides.title ?? `Reto de prueba ${challengeCounter}`,
      audience: overrides.audience ?? "ALL",
      audienceCommitteeIds: overrides.audienceCommitteeIds ?? [],
      opensAt: overrides.opensAt ?? new Date(now - 3_600_000),
      closesAt: overrides.closesAt ?? new Date(now + 86_400_000),
      basePoints: overrides.basePoints ?? 5,
      passPercent:
        overrides.passPercent === undefined
          ? kind === "TRIVIA"
            ? 80
            : null
          : overrides.passPercent,
      occasionId,
      publishedAt: status === "DRAFT" ? null : new Date(now - 3_600_000),
      cancelledAt: status === "CANCELLED" ? new Date(now) : null,
      cancelReason: status === "CANCELLED" ? "Cancelación de prueba" : null,
    })
    .returning({ id: challenge.id });
  if (!row) throw new Error("seed challenge");
  return row.id;
}

type ParticipationOverrides = Partial<{
  status: "PENDING" | "COMPLETED" | "REJECTED" | "ANNULLED";
  requestId: string;
  submittedAt: Date;
  answers: number[] | null;
  score: number | null;
  passed: boolean | null;
  evidenceText: string | null;
  checkInId: string | null;
  rewardId: string | null;
  reason: string | null;
}>;

/** Entrega de una persona a un reto: PENDING con requestId aleatorio, salvo overrides. */
export async function seedParticipation(
  challengeId: string,
  personId: string,
  overrides: ParticipationOverrides = {},
): Promise<string> {
  const status = overrides.status ?? "PENDING";
  const [row] = await db()
    .insert(challengeParticipation)
    .values({
      challengeId,
      personId,
      status,
      requestId: overrides.requestId ?? randomUUID(),
      submittedAt: overrides.submittedAt ?? new Date(),
      answers: overrides.answers ?? null,
      score: overrides.score ?? null,
      passed: overrides.passed ?? null,
      evidenceText: overrides.evidenceText ?? null,
      checkInId: overrides.checkInId ?? null,
      rewardId: overrides.rewardId ?? null,
      reason: overrides.reason ?? (status === "REJECTED" ? "Rechazo de prueba" : null),
      decidedAt: status === "PENDING" ? null : new Date(),
    })
    .returning({ id: challengeParticipation.id });
  if (!row) throw new Error("seed participation");
  return row.id;
}

type BoosterOverrides = Partial<{
  status: "AVAILABLE" | "RESERVED" | "CONSUMED" | "REVOKED";
  expiresAt: Date;
  targetChallengeId: string | null;
  targetOccasionId: string | null;
  sourceAchievementId: string | null;
  consumedRewardId: string | null;
}>;

/** Booster disponible que vence en 30 días, salvo overrides. */
export async function seedBooster(
  personId: string,
  termId: string,
  kind: "PLUS_50" | "PLUS_100" = "PLUS_50",
  overrides: BoosterOverrides = {},
): Promise<string> {
  const status = overrides.status ?? "AVAILABLE";
  const [row] = await db()
    .insert(boosterItem)
    .values({
      personId,
      termId,
      kind,
      status,
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 30 * 86_400_000),
      targetChallengeId: overrides.targetChallengeId ?? null,
      targetOccasionId: overrides.targetOccasionId ?? null,
      sourceAchievementId: overrides.sourceAchievementId ?? null,
      consumedRewardId: overrides.consumedRewardId ?? null,
      revokedAt: status === "REVOKED" ? new Date() : null,
      revokeReason: status === "REVOKED" ? "Retiro de prueba" : null,
    })
    .returning({ id: boosterItem.id });
  if (!row) throw new Error("seed booster");
  return row.id;
}

/** La pregunta de un reto: una sola, de sí o no y con la primera opción como correcta, salvo que se diga otra cosa. */
export async function seedQuestion(
  challengeId: string,
  overrides: Partial<{ prompt: string; options: string[] }> = {},
): Promise<void> {
  await db()
    .insert(challengeQuestion)
    .values({
      challengeId,
      ordinal: 1,
      prompt: overrides.prompt ?? "¿Pregunta?",
      options: overrides.options ?? ["Sí", "No"],
      correctIndex: 0,
    });
}

type WordleGameSeed = {
  personId: string;
  /** El día de la partida, `AAAA-MM-DD`. */
  day: string;
} & Partial<
  Pick<
    typeof wordleGame.$inferInsert,
    "answer" | "status" | "completedAt" | "dictionaryVersion" | "rulesVersion"
  >
>;

/**
 * Partidas de Wordle de un término, en una sola sentencia y en el orden dado: en curso, con la
 * respuesta `PRUEB` y las versiones `test`, salvo que cada una diga otra cosa. La que ya terminó
 * lleva su hora de cierre. No escribe intentos ni acredita nada.
 */
export async function seedWordleGames(termId: string, games: WordleGameSeed[]): Promise<string[]> {
  if (games.length === 0) return [];
  const rows = await db()
    .insert(wordleGame)
    .values(
      games.map((game) => {
        const status = game.status ?? "IN_PROGRESS";
        return {
          personId: game.personId,
          day: game.day,
          termId,
          answer: game.answer ?? "PRUEB",
          dictionaryVersion: game.dictionaryVersion ?? "test",
          rulesVersion: game.rulesVersion ?? "test",
          status,
          completedAt: status === "IN_PROGRESS" ? null : (game.completedAt ?? new Date()),
        };
      }),
    )
    .returning({ id: wordleGame.id });
  return rows.map((row) => row.id);
}

/** Una partida de Wordle de una persona en un día: lo mismo que `seedWordleGames`, de a una. */
export async function seedWordleGame(
  personId: string,
  termId: string,
  day: string,
  overrides: Omit<WordleGameSeed, "personId" | "day"> = {},
): Promise<string> {
  const [id] = await seedWordleGames(termId, [{ personId, day, ...overrides }]);
  if (!id) throw new Error("seed wordle game");
  return id;
}

/**
 * Insignia de edición especial, activa y atada a una ocasión o a un reto. Las de serie no se
 * siembran: las llenan las migraciones y el vaciado las devuelve a su foto.
 */
export async function seedSpecialBadge(
  code: string,
  target: { occasionId: string } | { challengeId: string },
  overrides: Partial<{ name: string; active: boolean }> = {},
): Promise<string> {
  const [row] = await db()
    .insert(badgeDefinition)
    .values({
      code,
      family: "SPECIAL",
      threshold: null,
      name: overrides.name ?? `Edición especial ${code}`,
      active: overrides.active ?? true,
      specialOccasionId: "occasionId" in target ? target.occasionId : null,
      specialChallengeId: "challengeId" in target ? target.challengeId : null,
    })
    .returning({ id: badgeDefinition.id });
  if (!row) throw new Error("seed special badge");
  return row.id;
}

type AchievementOverrides = Partial<
  Omit<typeof achievement.$inferInsert, "personId" | "badgeId" | "termId">
>;

/** Logro vivo de una persona sobre una insignia: de origen manual y desbloqueado ahora, salvo overrides. */
export async function seedAchievement(
  personId: string,
  badgeId: string,
  termId: string,
  overrides: AchievementOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(achievement)
    .values({ personId, badgeId, termId, sourceKind: "MANUAL", ...overrides })
    .returning({ id: achievement.id });
  if (!row) throw new Error("seed achievement");
  return row.id;
}

type EvidenceFileOverrides = Partial<
  Omit<typeof challengeEvidenceFile.$inferInsert, "participationId" | "objectKey">
>;

/**
 * Archivo de evidencia de una entrega: el primero, un JPEG de 10 kB todavía sin procesar, salvo
 * overrides. Escribe la fila y nada más: el objeto del bucket lo sube la prueba que lo necesite.
 */
export async function seedChallengeEvidenceFile(
  participationId: string,
  objectKey: string,
  overrides: EvidenceFileOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(challengeEvidenceFile)
    .values({
      participationId,
      objectKey,
      ordinal: 1,
      contentType: "image/jpeg",
      byteSize: 10_000,
      ...overrides,
    })
    .returning({ id: challengeEvidenceFile.id });
  if (!row) throw new Error("seed challenge evidence file");
  return row.id;
}

type RewardOverrides = Partial<
  Omit<typeof reward.$inferInsert, "personId" | "termId" | "participationId" | "source">
>;

/**
 * Premio reservado de la entrega a un reto: 10 puntos base, todos concedidos y sin extra, con el día
 * y la semana de hoy y los topes 20 y 60, salvo overrides. Escribe la fila del premio y nada más: los
 * puntos son del libro, y la entrega no queda apuntando al premio.
 */
export async function seedReward(
  personId: string,
  termId: string,
  participationId: string,
  overrides: RewardOverrides = {},
): Promise<string> {
  const now = new Date();
  const basePoints = overrides.basePoints ?? 10;
  const [row] = await db()
    .insert(reward)
    .values({
      personId,
      termId,
      source: "CHALLENGE",
      participationId,
      basePoints,
      baseGranted: basePoints,
      extraPoints: 0,
      dayKey: dayKeyFor(now),
      weekKey: weekKeyFor(now),
      capDaily: 20,
      capWeekly: 60,
      ...overrides,
    })
    .returning({ id: reward.id });
  if (!row) throw new Error("seed reward");
  return row.id;
}

type EventOverrides = Partial<Omit<typeof event.$inferInsert, "slug" | "name">>;

/** Macroevento como lo deja la base si nadie dice más: en borrador, para todo público y sin texto. */
export async function seedEvent(
  slug: string,
  name: string,
  overrides: EventOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(event)
    .values({ slug, name, ...overrides })
    .returning({ id: event.id });
  if (!row) throw new Error("seed event");
  return row.id;
}

type EditionOverrides = Partial<
  Omit<typeof eventEdition.$inferInsert, "eventId" | "slug" | "name">
>;

/** Edición de un macroevento: en borrador y que empieza ahora, salvo overrides. */
export async function seedEdition(
  eventId: string,
  slug: string,
  name: string,
  overrides: EditionOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(eventEdition)
    .values({ eventId, slug, name, startsAt: new Date(), ...overrides })
    .returning({ id: eventEdition.id });
  if (!row) throw new Error("seed edition");
  return row.id;
}

type MediaAssetOverrides = Partial<Omit<typeof mediaAsset.$inferInsert, "objectKey">>;

/**
 * Medio privado y listo, como queda una imagen ya procesada: un JPEG de 10 kB con el nombre de su
 * clave, salvo overrides. Escribe la fila y nada más: no sube el objeto ni arma sus variantes.
 */
export async function seedMediaAsset(
  objectKey: string,
  overrides: MediaAssetOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(mediaAsset)
    .values({
      objectKey,
      visibility: "PRIVATE",
      originalFilename: objectKey.split("/").pop() ?? objectKey,
      contentType: "image/jpeg",
      byteSize: 10_000,
      status: "READY",
      ...overrides,
    })
    .returning({ id: mediaAsset.id });
  if (!row) throw new Error("seed media asset");
  return row.id;
}

type PageContent = Required<Pick<typeof page.$inferInsert, "body" | "status" | "audience">>;

/**
 * La página de ese slug: en borrador, pública y sin texto, salvo overrides. Si ya existe, como las
 * que dejan las migraciones, conserva su título y cambia lo demás.
 */
export async function seedPage(
  slug: string,
  title: string,
  overrides: Partial<PageContent> = {},
): Promise<string> {
  const content: PageContent = {
    body: overrides.body ?? "",
    status: overrides.status ?? "DRAFT",
    audience: overrides.audience ?? "PUBLIC",
  };
  const [row] = await db()
    .insert(page)
    .values({ slug, title, ...content })
    .onConflictDoUpdate({ target: page.slug, set: content })
    .returning({ id: page.id });
  if (!row) throw new Error("seed page");
  return row.id;
}

type DocumentOverrides = Partial<Omit<typeof document.$inferInsert, "title">>;

/**
 * Documento como lo deja la base si nadie dice más: en borrador, para miembros y de tipo OTRO, con un
 * PDF de 2 kB que lleva su título por nombre. Escribe la fila y nada más: no sube el archivo ni
 * guarda sus artículos.
 */
export async function seedDocument(
  title: string,
  overrides: DocumentOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(document)
    .values({
      title,
      version: "Versión de prueba",
      fileKey: `documents/${title}.pdf`,
      originalFilename: `${title}.pdf`,
      byteSize: 2048,
      ...overrides,
    })
    .returning({ id: document.id });
  if (!row) throw new Error("seed document");
  return row.id;
}

/** Puntaje que el líder le puso a una persona en un criterio, sin nota y sin decir quién lo puso. */
export async function seedLeaderScore(
  termId: string,
  ruleId: string,
  personId: string,
  value: number,
): Promise<void> {
  await db().insert(leaderScore).values({ termId, ruleId, personId, value });
}

/** Crédito manual de una persona en un criterio, sin decir quién lo concedió, salvo overrides. */
export async function seedManualCredit(
  termId: string,
  ruleId: string,
  personId: string,
  value: number,
  overrides: Partial<{ reason: string; grantedById: string | null }> = {},
): Promise<void> {
  await db()
    .insert(manualCredit)
    .values({
      termId,
      ruleId,
      personId,
      value,
      reason: overrides.reason ?? "Crédito de prueba",
      grantedById: overrides.grantedById ?? null,
    });
}

type InteractionSeed = {
  kind: (typeof interaction.$inferInsert)["kind"];
  summary: string;
  occurredAt: Date;
};

/** Interacciones de una persona en su línea de tiempo, en una sola sentencia y en el orden dado. */
export async function seedInteractions(personId: string, items: InteractionSeed[]): Promise<void> {
  if (items.length === 0) return;
  await db()
    .insert(interaction)
    .values(items.map((item) => ({ personId, ...item })));
}

/** El carné de cada persona, en una sola sentencia: un token nuevo, en la época 0 y la revisión 1. */
export async function seedCarnetTokens(personIds: string[]): Promise<void> {
  if (personIds.length === 0) return;
  await db()
    .insert(carnetToken)
    .values(
      personIds.map((personId) => ({
        personId,
        token: createWalletCarnetToken(),
        walletEpoch: 0,
        revision: 1,
      })),
    );
}

/**
 * El pase de Google Wallet de cada persona, en una sola sentencia: en la época 0 y la revisión 1 de
 * su token, todavía sin emitir. El objeto del proveedor lo arma la prueba que lo necesite.
 */
export async function seedWalletPasses(
  passes: { personId: string; externalId: string }[],
): Promise<void> {
  if (passes.length === 0) return;
  await db()
    .insert(walletPass)
    .values(
      passes.map((pass) => ({
        ...pass,
        platform: "GOOGLE" as const,
        walletEpoch: 0,
        tokenRevision: 1,
      })),
    );
}

/**
 * Una clave de configuración escrita directo en la base, pisando la que haya. No pasa por `setConfig`:
 * no audita ni emite, y tampoco le avisa a la caché de configuración de este proceso, que sigue con lo
 * que ya había leído hasta que alguien la limpie.
 */
export async function seedConfig(key: string, value: unknown): Promise<void> {
  await db()
    .insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value } });
}

/** Apoyo de una base de la competencia, como lo deja la importación del personal, sin decir quién lo cargó. */
export async function seedCompetitionSupport(
  competitionId: string,
  baseId: string,
  personId: string,
  role: (typeof competitionSupport.$inferInsert)["role"],
): Promise<void> {
  await db().insert(competitionSupport).values({ competitionId, baseId, personId, role });
}

/**
 * Alias de una ruta del sitio anterior hacia una ocasión (ADR-018), con la fila que deja `createAlias`.
 * No valida la forma de la ruta ni audita.
 */
export async function seedAlias(path: string, targetId: string): Promise<void> {
  await db().insert(legacyAlias).values({ path, targetId });
}

type EmailTemplateOverrides = Partial<{ name: string; subject: string; body: string }>;

/** Plantilla de correo con el slug por nombre, un asunto de prueba y sin texto, salvo overrides. */
export async function seedEmailTemplate(
  slug: string,
  overrides: EmailTemplateOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(emailTemplate)
    .values({
      slug,
      name: overrides.name ?? slug,
      subject: overrides.subject ?? "Asunto de prueba",
      body: overrides.body ?? "",
    })
    .returning({ id: emailTemplate.id });
  if (!row) throw new Error("seed email template");
  return row.id;
}

type CampaignOverrides = Partial<
  Omit<typeof campaign.$inferInsert, "name" | "templateId" | "segmentId">
>;

/**
 * Campaña como la deja la base si nadie dice más: en borrador, sin programar y con los contadores en
 * cero. Una en curso dice su estado, sus horas y sus contadores: no reparte destinatarios ni envía.
 */
export async function seedCampaign(
  name: string,
  templateId: string,
  segmentId: string,
  overrides: CampaignOverrides = {},
): Promise<string> {
  const [row] = await db()
    .insert(campaign)
    .values({ name, templateId, segmentId, ...overrides })
    .returning({ id: campaign.id });
  if (!row) throw new Error("seed campaign");
  return row.id;
}

type CampaignRecipientSeed = Omit<typeof campaignRecipient.$inferInsert, "campaignId">;

/**
 * Destinatarios de una campaña, en una sola sentencia y en el orden dado: pendientes, salvo que cada
 * uno diga su estado. No toca los contadores de la campaña.
 */
export async function seedCampaignRecipients(
  campaignId: string,
  recipients: CampaignRecipientSeed[],
): Promise<void> {
  if (recipients.length === 0) return;
  await db()
    .insert(campaignRecipient)
    .values(recipients.map((recipient) => ({ campaignId, ...recipient })));
}
