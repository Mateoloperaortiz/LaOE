import { and, asc, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext, Executor } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { membershipChanged, personAnonymized, personEmailChanged } from "@/domain-events/people";
import { redactAuditEntries } from "@/modules/system";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { formatDate, todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  committeeMembership,
  type LeaveCondition,
  membership,
  membershipEvent,
  membershipTerm,
  person,
} from "../schema";
import { assertBenefitsAvailable } from "./benefits";
import { closeCommitteeMembership } from "./committee-membership-closing";
import { endRolesForPerson } from "./committee-role-assignments";
import { revokeAllConsents, syncConsent } from "./consents";
import { leaveUntilError, leaveWindow } from "./leave-pure";
import { SIGN_IN_STATUSES } from "./reads";
import { setProbation } from "./term-outcomes";
import { lockWalletMember } from "./wallet-member";

// El ciclo de vida de la membresía cambia solo por comandos (ADR-003): cada uno audita, escribe el
// historial y emite `membership.changed`; salir y anonimizar siguen ADR-030 y ADR-034.

export type MembershipRecord = typeof membership.$inferSelect;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));

export const changeStatusSchema = z.object({
  to: z.enum(["ACTIVE", "ON_LEAVE", "HONORARY"]),
  reason: z.string().trim().min(2).max(500),
  /** Regreso previsto; obligatorio al pasar a licencia (ADR-060 regla 10). */
  leaveUntil: z.iso.date().optional(),
});

export const endMembershipSchema = z.object({
  endReason: z.enum([
    "GRADUATION",
    "RESIGNATION",
    "PERMANENCE",
    "EXPULSION",
    "STUDENT_STATUS_LOST",
    "OTHER",
  ]),
  note: z.string().trim().max(500).optional(),
  memorialConsent: z.boolean().default(false),
  contactConsent: z.boolean().default(false),
  personalEmail: emailSchema.optional(),
  /** El cierre de permanencia fija el término cerrado como último; si falta, el vigente (ADR-036 regla 9). */
  lastTermId: z.string().optional(),
  /** Quién dio los consentimientos de galería y contacto: ADMIN desde la 360, SELF en un retiro pedido por la persona (ADR-037). */
  consentSource: z.enum(["ADMIN", "SELF"]).optional(),
});

export const reactivateSchema = z.object({
  email: emailSchema.optional(),
  reason: z.string().trim().max(500).optional(),
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
export type EndMembershipInput = z.infer<typeof endMembershipSchema>;
export type ReactivateInput = z.infer<typeof reactivateSchema>;

async function lockMembership(ctx: CommandContext, personId: string): Promise<MembershipRecord> {
  const [row] = await ctx.tx
    .select()
    .from(membership)
    .where(eq(membership.personId, personId))
    .for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return row;
}

/** Marca de revocación: ninguna sesión creada antes vuelve a resolver un actor (ADR-034, punto 3). */
async function revokeAccess(ctx: CommandContext, personId: string): Promise<void> {
  await ctx.tx.update(person).set({ sessionsRevokedAt: sql`now()` }).where(eq(person.id, personId));
}

async function closeOpenCommitteeMemberships(
  ctx: CommandContext,
  personId: string,
  now: Date,
): Promise<void> {
  const live = await ctx.tx
    .select({
      id: committeeMembership.id,
      personId: committeeMembership.personId,
      committeeId: committeeMembership.committeeId,
      termId: committeeMembership.termId,
    })
    .from(committeeMembership)
    .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
  for (const row of live) {
    await closeCommitteeMembership(ctx, row, now);
  }
  await endRolesForPerson(ctx.tx, personId, now);
}

/** Congela la condición al salir; una edición posterior del término no la modifica. */
async function conditionAtDeparture(
  exec: Executor,
  current: MembershipRecord,
  when: Date,
): Promise<LeaveCondition[]> {
  const term = await getCurrentTerm(when);
  if (!term) return [];
  const rows = await exec
    .select()
    .from(membershipTerm)
    .where(and(eq(membershipTerm.personId, current.personId), eq(membershipTerm.termId, term.id)));
  const conditions: LeaveCondition[] = rows.map((row) => ({
    committeeId: row.committeeId,
    probation: row.probation,
    reportAsVeteran: row.reportAsVeteran,
    resumedNew: row.resumedNew,
    resumedTransfer: row.resumedTransfer,
  }));
  const transfers = await exec
    .select({ committeeId: committeeMembership.committeeId })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, current.personId),
        eq(committeeMembership.termId, term.id),
        eq(committeeMembership.transferredIn, true),
        isNull(committeeMembership.leftAt),
      ),
    );
  for (const transfer of transfers) {
    const scope = conditions.find((row) => row.committeeId === transfer.committeeId);
    if (scope) scope.resumedTransfer = true;
    else
      conditions.push({
        committeeId: transfer.committeeId,
        probation: false,
        reportAsVeteran: false,
        resumedNew: false,
        resumedTransfer: true,
      });
  }
  const general = conditions.find((row) => row.committeeId === null);
  if (general) general.resumedNew ||= current.firstTermId === term.id;
  else
    conditions.push({
      committeeId: null,
      probation: false,
      reportAsVeteran: false,
      resumedNew: current.firstTermId === term.id,
    });
  return conditions;
}

/** La condición guardada al salir a licencia; las licencias anteriores a la migración se reconstruyen. */
async function savedCondition(
  exec: Executor,
  current: MembershipRecord,
): Promise<LeaveCondition[]> {
  if (current.leaveCondition !== null) return current.leaveCondition;
  // Licencias anteriores a la migración: reconstruir desde el término de la salida registrada.
  const [departure] = await exec
    .select({ at: membershipEvent.at })
    .from(membershipEvent)
    .where(
      and(eq(membershipEvent.membershipId, current.id), eq(membershipEvent.toStatus, "ON_LEAVE")),
    )
    .orderBy(desc(membershipEvent.at))
    .limit(1);
  return departure ? conditionAtDeparture(exec, current, departure.at) : [];
}

/**
 * La prueba con la que alguien salió a licencia sigue siendo prueba mientras no vuelva a activo
 * (ADR-120 regla 4): vive en la condición guardada y no en las filas del término vigente, que son las
 * que mira `blockedBenefits`. Cuenta la general y la de cualquier comité, como allá.
 */
async function leftOnProbation(exec: Executor, current: MembershipRecord): Promise<boolean> {
  if (current.status !== "ON_LEAVE") return false;
  return (await savedCondition(exec, current)).some((condition) => condition.probation);
}

/** La misma pregunta para una lectura: la elegibilidad a honorario que muestra la ficha. */
export async function isOnLeaveOnProbation(
  personId: string,
  exec: Executor = getDb(),
): Promise<boolean> {
  const [current] = await exec.select().from(membership).where(eq(membership.personId, personId));
  return current ? leftOnProbation(exec, current) : false;
}

/**
 * La condición que queda guardada tras el cambio (ADR-118 regla 8): se toma al salir a licencia, el
 * paso por honorario la conserva y solo el regreso a activo la gasta.
 */
async function conditionToKeep(
  ctx: CommandContext,
  current: MembershipRecord,
  to: ChangeStatusInput["to"],
  now: Date,
): Promise<LeaveCondition[] | null> {
  if (to === "ACTIVE") return null;
  if (current.status === "ON_LEAVE") return savedCondition(ctx.tx, current);
  if (current.status === "HONORARY" && current.leaveCondition !== null) {
    return current.leaveCondition;
  }
  return to === "ON_LEAVE" ? conditionAtDeparture(ctx.tx, current, now) : null;
}

/** Retoma la condición guardada, respetando una decisión explícita ya tomada para el regreso. */
async function carryOverCondition(
  ctx: CommandContext,
  current: MembershipRecord,
  now: Date,
): Promise<void> {
  const term = await getCurrentTerm(now);
  if (!term) return;
  const snapshot = await savedCondition(ctx.tx, current);
  const decided = await ctx.tx
    .select({ committeeId: membershipTerm.committeeId })
    .from(membershipTerm)
    .where(and(eq(membershipTerm.personId, current.personId), eq(membershipTerm.termId, term.id)));
  const scopes = new Set(decided.map((row) => row.committeeId));
  for (const condition of snapshot) {
    if (scopes.has(condition.committeeId)) continue;
    await setProbation(ctx, current.personId, term.id, { ...condition, reason: t("T-2276") });
  }
}

/**
 * Activo ↔ licencia ↔ honorario; la licencia mantiene acceso de consulta. Pasar a licencia exige el
 * regreso previsto, desde mañana y hasta un año (Est. art. 5.4); al volver a activo se retoma la
 * condición que tenía (ADR-060 regla 10).
 */
export async function changeMembershipStatus(
  ctx: CommandContext,
  personId: string,
  input: ChangeStatusInput,
  now = new Date(),
): Promise<void> {
  await lockWalletMember(ctx.tx, personId);
  const current = await lockMembership(ctx, personId);
  if (current.status === "INACTIVE") {
    throw new Error("Una membresía terminada se reactiva, no se cambia de estado");
  }
  // Un cambio que no cambia nada se dice (ADR-118 regla 10): antes respondía «guardado» sin escribir.
  if (current.status === input.to) {
    throw new DomainError(t("T-3245"), "to");
  }
  const today = todayKey(now);
  if (input.to === "HONORARY") {
    const term = await getCurrentTerm(now);
    if (term) await assertBenefitsAvailable(ctx.tx, personId, term.id, now);
    // Quien salió a licencia en prueba no tiene fila en el término vigente: la prueba que bloquea
    // el paso a honorario (ADR-061 regla 2) es la que quedó guardada (ADR-120 regla 4).
    if (await leftOnProbation(ctx.tx, current)) {
      throw new DomainError(t("T-2331"), "personId");
    }
  }
  let leaveUntil: string | null = null;
  if (input.to === "ON_LEAVE") {
    const error = leaveUntilError(input.leaveUntil, today);
    if (error) {
      throw new DomainError(
        t(error, { fecha: formatDate(new Date(`${leaveWindow(today).max}T12:00:00Z`)) }),
        "leaveUntil",
      );
    }
    leaveUntil = input.leaveUntil ?? null;
  }
  await ctx.tx
    .update(membership)
    .set({
      status: input.to,
      leaveUntil,
      leaveCondition: await conditionToKeep(ctx, current, input.to, now),
    })
    .where(eq(membership.id, current.id));
  await ctx.tx.insert(membershipEvent).values({
    membershipId: current.id,
    fromStatus: current.status,
    toStatus: input.to,
    reason: input.reason,
    actorId: ctx.actor.personId,
    at: now,
  });
  if (!SIGN_IN_STATUSES.includes(input.to)) {
    await revokeAccess(ctx, personId);
  }
  // Vuelve de licencia, directo o pasando por honorario con la condición todavía guardada.
  if (input.to === "ACTIVE" && (current.status === "ON_LEAVE" || current.leaveCondition !== null)) {
    await carryOverCondition(ctx, current, now);
  }
  await ctx.audit({
    action: "membership.status-changed",
    entityType: "membership",
    entityId: current.id,
    before: { status: current.status, leaveUntil: current.leaveUntil },
    after: { status: input.to, reason: input.reason, leaveUntil },
  });
  await ctx.emit(
    eventOf(membershipChanged, {
      actorId: ctx.actor.personId,
      personId,
      from: current.status,
      to: input.to,
      reason: input.reason,
      leaveUntil,
    }),
  );
}

export interface ExpiredLeave {
  personId: string;
  fullName: string;
  leaveUntil: string;
}

/** Licencias con regreso previsto antes de hoy y sin vuelta (Est. art. 11.3): GH decide. */
export async function listExpiredLeaves(today = todayKey()): Promise<ExpiredLeave[]> {
  const rows = await getDb()
    .select({
      personId: membership.personId,
      fullName: person.fullName,
      leaveUntil: membership.leaveUntil,
    })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(and(eq(membership.status, "ON_LEAVE"), lt(membership.leaveUntil, today)))
    .orderBy(asc(membership.leaveUntil));
  return rows.flatMap((row) =>
    row.leaveUntil ? [{ ...row, fullName: row.fullName ?? "", leaveUntil: row.leaveUntil }] : [],
  );
}

/**
 * Dar de baja (ADR-030): la membresía termina con motivo, el perfil pasa a egresado, se cierran las
 * pertenencias vivas, se depura lo que no es historia (celular salvo consentimiento de contacto) y se
 * registran los consentimientos de galería y de contacto. Devuelve false si ya estaba terminada.
 */
export async function endMembership(
  ctx: CommandContext,
  personId: string,
  input: EndMembershipInput,
  now = new Date(),
): Promise<boolean> {
  await lockWalletMember(ctx.tx, personId);
  const current = await lockMembership(ctx, personId);
  if (current.status === "INACTIVE") {
    return false;
  }
  const term = input.lastTermId ? null : await getCurrentTerm(now);
  await ctx.tx
    .update(membership)
    .set({
      status: "INACTIVE",
      walletEpoch: current.walletEpoch + 1,
      leaveUntil: null,
      endedAt: now,
      endReason: input.endReason,
      lastTermId: input.lastTermId ?? term?.id ?? current.lastTermId,
    })
    .where(eq(membership.id, current.id));
  await ctx.tx.insert(membershipEvent).values({
    membershipId: current.id,
    fromStatus: current.status,
    toStatus: "INACTIVE",
    reason: input.note ?? input.endReason,
    actorId: ctx.actor.personId,
  });
  await ctx.tx
    .update(person)
    .set({
      stage: "ALUMNI",
      sessionsRevokedAt: sql`now()`,
      ...(input.contactConsent ? {} : { phone: null }),
      ...(input.personalEmail ? { personalEmail: input.personalEmail } : {}),
    })
    .where(eq(person.id, personId));
  await closeOpenCommitteeMemberships(ctx, personId, now);
  const consentSource = input.consentSource ?? "ADMIN";
  await syncConsent(ctx, personId, "MEMORIAL", input.memorialConsent, consentSource);
  await syncConsent(ctx, personId, "COMMUNICATIONS", input.contactConsent, consentSource);
  await ctx.audit({
    action: "membership.ended",
    entityType: "membership",
    entityId: current.id,
    before: { status: current.status },
    after: {
      status: "INACTIVE",
      endReason: input.endReason,
      note: input.note ?? null,
      memorialConsent: input.memorialConsent,
      contactConsent: input.contactConsent,
    },
  });
  await ctx.emit(
    eventOf(membershipChanged, {
      actorId: ctx.actor.personId,
      personId,
      from: current.status,
      to: "INACTIVE",
      endReason: input.endReason,
      reason: input.note ?? null,
    }),
  );
  return true;
}

/** Reactivar (ADR-030): recupera el perfil con su historia; acepta un correo institucional nuevo. */
export async function reactivateMembership(
  ctx: CommandContext,
  personId: string,
  input: ReactivateInput,
): Promise<void> {
  await lockWalletMember(ctx.tx, personId);
  const current = await lockMembership(ctx, personId);
  if (current.status !== "INACTIVE") {
    throw new Error("Solo se reactiva una membresía terminada");
  }
  // Quien fue expulsado no vuelve a ingresar (Regl. art. 61.3; ADR-060 regla 3).
  if (current.endReason === "EXPULSION") {
    throw new DomainError(t("T-2206"));
  }
  const [who] = await ctx.tx.select().from(person).where(eq(person.id, personId));
  if (!who) {
    throw new DomainError(t("T-032"));
  }
  if (who.anonymizedAt) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx
    .update(membership)
    .set({ status: "ACTIVE", leaveUntil: null, endedAt: null, endReason: null, lastTermId: null })
    .where(eq(membership.id, current.id));
  const emailChanged = input.email !== undefined && input.email !== who.email;
  try {
    await ctx.tx
      .update(person)
      .set({
        stage: "MEMBER",
        sessionsRevokedAt: sql`now()`,
        ...(emailChanged ? { email: input.email } : {}),
      })
      .where(eq(person.id, personId));
  } catch (error) {
    if (isUniqueViolation(error, "person_email_unique")) {
      throw new DomainError(t("T-430"), "email");
    }
    throw error;
  }
  await ctx.tx.insert(membershipEvent).values({
    membershipId: current.id,
    fromStatus: "INACTIVE",
    toStatus: "ACTIVE",
    reason: input.reason ?? null,
    actorId: ctx.actor.personId,
  });
  await ctx.audit({
    action: "membership.reactivated",
    entityType: "membership",
    entityId: current.id,
    before: { status: "INACTIVE", endReason: current.endReason },
    after: { status: "ACTIVE", emailChanged },
  });
  await ctx.emit(
    eventOf(membershipChanged, {
      actorId: ctx.actor.personId,
      personId,
      from: "INACTIVE",
      to: "ACTIVE",
      reason: input.reason ?? null,
    }),
  );
  if (emailChanged) {
    await ctx.emit(eventOf(personEmailChanged, { actorId: ctx.actor.personId, personId }));
  }
}

/**
 * Anonimizar a pedido (ADR-030, ADR-034): solo con solicitud previa. El nombre pasa al texto de T-223,
 * el correo a una dirección inválida, sin contacto ni foto; las pertenencias se conservan anónimas.
 */
export async function anonymizePerson(
  ctx: CommandContext,
  personId: string,
  now = new Date(),
): Promise<void> {
  await lockWalletMember(ctx.tx, personId);
  const [who] = await ctx.tx.select().from(person).where(eq(person.id, personId)).for("update");
  if (!who) {
    throw new DomainError(t("T-032"));
  }
  if (!who.deletionRequestedAt) {
    throw new DomainError(t("T-442"));
  }
  if (who.anonymizedAt) {
    return;
  }
  const [current] = await ctx.tx
    .select()
    .from(membership)
    .where(eq(membership.personId, personId))
    .for("update");
  if (current) {
    await ctx.tx
      .update(membership)
      .set({ walletEpoch: current.walletEpoch + 1 })
      .where(eq(membership.id, current.id));
  }
  if (current && current.status !== "INACTIVE") {
    const term = await getCurrentTerm(now);
    await ctx.tx
      .update(membership)
      .set({
        status: "INACTIVE",
        endedAt: now,
        endReason: "OTHER",
        lastTermId: term?.id ?? current.lastTermId,
      })
      .where(eq(membership.id, current.id));
    await ctx.tx.insert(membershipEvent).values({
      membershipId: current.id,
      fromStatus: current.status,
      toStatus: "INACTIVE",
      reason: null,
      actorId: ctx.actor.personId,
    });
  }
  await ctx.tx
    .update(person)
    .set({
      firstName: t("T-223"),
      lastName: "",
      email: `eliminado.${personId}@anonimo.invalid`,
      preferredName: null,
      phone: null,
      personalEmail: null,
      program: null,
      documentType: null,
      documentNumber: null,
      epikId: null,
      birthDate: null,
      photoAssetId: null,
      stage: "ALUMNI",
      anonymizedAt: now,
      sessionsRevokedAt: sql`now()`,
    })
    .where(eq(person.id, personId));
  await closeOpenCommitteeMemberships(ctx, personId, now);
  await revokeAllConsents(ctx, personId, now);
  // La auditoría anterior guardaba nombre y contacto en before/after: se borra ese contenido, no la traza.
  await redactAuditEntries(ctx, "person", personId);
  await ctx.audit({
    action: "person.anonymized",
    entityType: "person",
    entityId: personId,
    after: { anonymizedAt: now.toISOString() },
  });
  await ctx.emit(eventOf(personAnonymized, { actorId: ctx.actor.personId, personId }));
}

export interface MembershipEventView {
  id: string;
  fromStatus: MembershipRecord["status"] | null;
  toStatus: MembershipRecord["status"];
  reason: string | null;
  actorName: string | null;
  at: Date;
}

/** Historial de estados de la membresía, del más viejo al más nuevo, con quién lo hizo. */
export async function listMembershipEvents(personId: string): Promise<MembershipEventView[]> {
  const actor = alias(person, "actor");
  const rows = await getDb()
    .select({
      id: membershipEvent.id,
      fromStatus: membershipEvent.fromStatus,
      toStatus: membershipEvent.toStatus,
      reason: membershipEvent.reason,
      actorName: actor.fullName,
      at: membershipEvent.at,
    })
    .from(membershipEvent)
    .innerJoin(membership, eq(membership.id, membershipEvent.membershipId))
    .leftJoin(actor, eq(actor.id, membershipEvent.actorId))
    .where(eq(membership.personId, personId))
    .orderBy(asc(membershipEvent.at));
  return rows.map((row) => ({ ...row, actorName: row.actorName ?? null }));
}
