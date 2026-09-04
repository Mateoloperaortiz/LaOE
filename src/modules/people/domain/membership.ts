import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { redactAuditEntries } from "@/modules/system";
import { getCurrentTerm } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { committeeMembership, membership, membershipEvent, person } from "../schema";
import { revokeAllConsents, syncConsent } from "./consents";
import { SIGN_IN_STATUSES } from "./reads";

// El ciclo de vida de la membresía cambia solo por comandos (ADR-003): cada uno audita, escribe el
// historial y emite `membership.changed`; salir y anonimizar siguen ADR-030 y ADR-034.

export type MembershipRecord = typeof membership.$inferSelect;

const emailSchema = z.string().trim().toLowerCase().pipe(z.email()).pipe(z.string().max(254));

export const changeStatusSchema = z.object({
  to: z.enum(["ACTIVE", "ON_LEAVE", "HONORARY"]),
  reason: z.string().trim().min(2).max(500),
});

export const endMembershipSchema = z.object({
  endReason: z.enum(["GRADUATION", "RESIGNATION", "PERMANENCE", "OTHER"]),
  note: z.string().trim().max(500).optional(),
  memorialConsent: z.boolean().default(false),
  contactConsent: z.boolean().default(false),
  personalEmail: emailSchema.optional(),
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
  await ctx.tx
    .update(committeeMembership)
    .set({ leftAt: now })
    .where(and(eq(committeeMembership.personId, personId), isNull(committeeMembership.leftAt)));
}

/** Activo ↔ licencia ↔ honorario; salir de activo u honorario corta el acceso. */
export async function changeMembershipStatus(
  ctx: CommandContext,
  personId: string,
  input: ChangeStatusInput,
): Promise<void> {
  const current = await lockMembership(ctx, personId);
  if (current.status === "INACTIVE") {
    throw new Error("Una membresía terminada se reactiva, no se cambia de estado");
  }
  if (current.status === input.to) {
    return;
  }
  await ctx.tx.update(membership).set({ status: input.to }).where(eq(membership.id, current.id));
  await ctx.tx.insert(membershipEvent).values({
    membershipId: current.id,
    fromStatus: current.status,
    toStatus: input.to,
    reason: input.reason,
    actorId: ctx.actor.personId,
  });
  if (!SIGN_IN_STATUSES.includes(input.to)) {
    await revokeAccess(ctx, personId);
  }
  await ctx.audit({
    action: "membership.status-changed",
    entityType: "membership",
    entityId: current.id,
    before: { status: current.status },
    after: { status: input.to, reason: input.reason },
  });
  await ctx.emit({
    type: "membership.changed",
    payload: {
      actorId: ctx.actor.personId,
      personId,
      from: current.status,
      to: input.to,
      reason: input.reason,
    },
  });
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
  const current = await lockMembership(ctx, personId);
  if (current.status === "INACTIVE") {
    return false;
  }
  const term = await getCurrentTerm(now);
  await ctx.tx
    .update(membership)
    .set({
      status: "INACTIVE",
      endedAt: now,
      endReason: input.endReason,
      lastTermId: term?.id ?? current.lastTermId,
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
  await syncConsent(ctx, personId, "MEMORIAL", input.memorialConsent, "ADMIN");
  await syncConsent(ctx, personId, "COMMUNICATIONS", input.contactConsent, "ADMIN");
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
  await ctx.emit({
    type: "membership.changed",
    payload: {
      actorId: ctx.actor.personId,
      personId,
      from: current.status,
      to: "INACTIVE",
      endReason: input.endReason,
      reason: input.note ?? null,
    },
  });
  return true;
}

/** Reactivar (ADR-030): recupera el perfil con su historia; acepta un correo institucional nuevo. */
export async function reactivateMembership(
  ctx: CommandContext,
  personId: string,
  input: ReactivateInput,
): Promise<void> {
  const current = await lockMembership(ctx, personId);
  if (current.status !== "INACTIVE") {
    throw new Error("Solo se reactiva una membresía terminada");
  }
  const [who] = await ctx.tx.select().from(person).where(eq(person.id, personId));
  if (!who) {
    throw new DomainError(t("T-032"));
  }
  await ctx.tx
    .update(membership)
    .set({ status: "ACTIVE", endedAt: null, endReason: null, lastTermId: null })
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
  await ctx.emit({
    type: "membership.changed",
    payload: {
      actorId: ctx.actor.personId,
      personId,
      from: "INACTIVE",
      to: "ACTIVE",
      reason: input.reason ?? null,
    },
  });
  if (emailChanged) {
    await ctx.emit({
      type: "person.email-changed",
      payload: { actorId: ctx.actor.personId, personId },
    });
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
  await ctx.emit({ type: "person.anonymized", payload: { actorId: ctx.actor.personId, personId } });
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
