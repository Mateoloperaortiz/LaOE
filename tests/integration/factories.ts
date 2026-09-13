import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  card,
  internalCall,
  internalCallEntry,
  organization,
  pipeline,
  pipelineStage,
  request,
} from "@/modules/crm/schema";
import { form, formSubmission } from "@/modules/forms/schema";
import { checkIn, occasion } from "@/modules/participation/schema";
import {
  appointment,
  committee,
  committeeMembership,
  committeeRoleAssignment,
  membership,
  membershipTerm,
  person,
} from "@/modules/people/schema";
import {
  permanenceRule,
  permanenceTable,
  workGroup,
  workGroupEvaluator,
  workGroupMembership,
} from "@/modules/permanence/schema";
import { conventionalTermDates } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { todayKey } from "@/shared/lib/dates";

// Fábricas de datos sintéticos para las pruebas de integración: nunca datos reales.

const db = () => getDb();

/** El código del término que contiene hoy en Bogotá, con fechas por semestre calendario. */
export function currentTermCode(): string {
  const today = todayKey();
  const year = today.slice(0, 4);
  const month = Number.parseInt(today.slice(5, 7), 10);
  return `${year}-${month <= 6 ? 1 : 2}`;
}

export async function seedTerm(code = currentTermCode()): Promise<string> {
  const [existing] = await db().select({ id: term.id }).from(term).where(eq(term.code, code));
  if (existing) {
    return existing.id;
  }
  const dates = conventionalTermDates(code);
  const [row] = await db()
    .insert(term)
    .values({ code, semester: code.endsWith("-2") ? 2 : 1, ...dates })
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
}>;

export async function seedPerson(email: string, overrides: PersonOverrides = {}): Promise<string> {
  const [row] = await db()
    .insert(person)
    .values({
      email,
      firstName: overrides.firstName ?? "Persona",
      lastName: overrides.lastName ?? "Sintética",
      stage: overrides.stage ?? "MEMBER",
      kind: overrides.kind ?? "STUDENT",
      phone: overrides.phone ?? null,
      program: overrides.program ?? null,
      personalEmail: overrides.personalEmail ?? null,
      source: "TEST",
    })
    .returning({ id: person.id });
  if (!row) throw new Error("seed person");
  return row.id;
}

export async function seedMembership(
  personId: string,
  termId: string,
  status: "ACTIVE" | "ON_LEAVE" | "HONORARY" | "INACTIVE" = "ACTIVE",
): Promise<string> {
  const [row] = await db()
    .insert(membership)
    .values({
      personId,
      firstTermId: termId,
      status,
      ...(status === "INACTIVE" ? { endedAt: new Date(), endReason: "OTHER" as const } : {}),
    })
    .returning({ id: membership.id });
  if (!row) throw new Error("seed membership");
  return row.id;
}

/** Persona del roster con membresía activa en el término actual; devuelve su id. */
export async function seedMember(email: string, overrides: PersonOverrides = {}): Promise<string> {
  const termId = await seedTerm();
  const personId = await seedPerson(email, overrides);
  await seedMembership(personId, termId);
  return personId;
}

export async function seedCommittee(slug: string, name = slug.toUpperCase()): Promise<string> {
  const [row] = await db()
    .insert(committee)
    .values({ slug, name, status: "ACTIVE", publicationStatus: "PUBLISHED" })
    .returning({ id: committee.id });
  if (!row) throw new Error("seed committee");
  return row.id;
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
  overrides: Partial<{ joinedAt: Date | null; transferredIn: boolean; coDirector: boolean }> = {},
): Promise<string> {
  const [row] = await db()
    .insert(committeeMembership)
    .values({
      personId,
      committeeId,
      termId,
      roleCode,
      joinedAt: overrides.joinedAt === undefined ? new Date() : overrides.joinedAt,
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

type OccasionOverrides = Partial<{
  title: string;
  kind: "ACTIVITY" | "ASSEMBLY" | "EDITION_SESSION";
  assemblyKind: "ORDINARY" | "BOARD_ELECTION" | "RUNOFF" | null;
  category:
    | "INTEGRATION"
    | "ATHLETIC_MATCH"
    | "COMMITTEE_MEETING"
    | "TALK"
    | "WORKSHOP"
    | "SOCIAL"
    | "OTHER";
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

/** Check-in aprobado de una persona en una ocasión (sin crédito en el ledger: para permanencia). */
export async function seedCheckIn(
  occasionId: string,
  personId: string,
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" = "APPROVED",
): Promise<string> {
  const [row] = await db()
    .insert(checkIn)
    .values({ occasionId, personId, status, source: "ADMIN" })
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

/** Condición de prueba en un término (ADR-027). */
export async function seedMembershipTerm(
  personId: string,
  termId: string,
  probation = true,
): Promise<void> {
  await db()
    .insert(membershipTerm)
    .values({ personId, termId, probation, reason: "prueba de integración" })
    .onConflictDoUpdate({
      target: [membershipTerm.personId, membershipTerm.termId],
      targetWhere: isNull(membershipTerm.committeeId),
      set: { probation },
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

/** Pipeline con sus etapas; devuelve el id y las etapas en orden. */
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
