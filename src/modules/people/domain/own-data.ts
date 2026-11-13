import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { personDeletionRequested, personUpdated } from "@/domain-events/people";
import { getMedia } from "@/modules/content";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import {
  appointment,
  committeeMembership,
  committeeRepresentative,
  committeeRoleAssignment,
  membership,
  membershipEvent,
  membershipTerm,
  person,
  personTag,
  sanction,
  tag,
} from "../schema";
import { listConsents } from "./consents";
import { cardUidSchema, normalizePhone } from "./person-pure";

// Lo que una persona hace sobre sus propios datos desde Ajustes (ADR-034 reglas 8 y 12): contacto,
// foto, solicitud de eliminación y el paquete de "mis datos". Nunca toca el correo institucional.

export const ownContactSchema = z.object({
  cardUid: cardUidSchema,
  phone: z.string().trim().max(40).default(""),
  personalEmail: z.string().trim().toLowerCase().max(254).default(""),
});

export type OwnContactInput = z.infer<typeof ownContactSchema>;

const E164 = /^\+\d{8,15}$/;
const emailSchema = z.email();
const CONTACT_FIELDS = ["phone", "personalEmail", "cardUid"] as const;

const leaveConditionSchema = z
  .array(
    z.object({
      committeeId: z.string().min(1).nullable(),
      probation: z.boolean(),
      reportAsVeteran: z.boolean(),
      resumedNew: z.boolean(),
      resumedTransfer: z.boolean().optional(),
    }),
  )
  .nullable();

export async function updateOwnContact(
  ctx: CommandContext,
  personId: string,
  input: OwnContactInput,
): Promise<void> {
  const uid = cardUidSchema.safeParse(input.cardUid);
  if (!uid.success) throw new DomainError(t("T-4102"), "cardUid");
  let phone: string | null = null;
  if (input.phone) {
    const parsed = normalizePhone(input.phone);
    if (!parsed.normalized && !E164.test(parsed.value)) {
      throw new DomainError(t("T-410"), "phone");
    }
    phone = parsed.value;
  }
  let personalEmail: string | null = null;
  const candidate = input.personalEmail.trim().toLowerCase();
  if (candidate) {
    if (!emailSchema.safeParse(candidate).success) {
      throw new DomainError(t("T-239"), "personalEmail");
    }
    personalEmail = candidate;
  }
  const [before] = await ctx.tx
    .select({ phone: person.phone, personalEmail: person.personalEmail, cardUid: person.cardUid })
    .from(person)
    .where(eq(person.id, personId));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const after = { phone, personalEmail, cardUid: uid.data };
  const changed = CONTACT_FIELDS.filter((field) => before[field] !== after[field]);
  if (changed.length === 0) {
    return;
  }
  try {
    await ctx.tx.update(person).set(after).where(eq(person.id, personId));
  } catch (error) {
    if (isUniqueViolation(error, "person_card_uid_unique"))
      throw new DomainError(t("T-4103"), "cardUid");
    throw error;
  }
  await ctx.audit({
    action: "person.updated",
    entityType: "person",
    entityId: personId,
    before: Object.fromEntries(changed.map((field) => [field, before[field]])),
    after: Object.fromEntries(changed.map((field) => [field, after[field]])),
  });
  await ctx.emit(
    eventOf(personUpdated, { actorId: ctx.actor.personId, personId, fields: changed }),
  );
}

/** La foto propia: solo un medio privado que la misma persona subió a `photos/<personId>/`. */
export async function setOwnPhoto(
  ctx: CommandContext,
  personId: string,
  assetId: string | null,
): Promise<void> {
  if (assetId) {
    const asset = await getMedia(assetId);
    if (
      !asset ||
      asset.uploadedById !== personId ||
      asset.visibility !== "PRIVATE" ||
      !asset.objectKey.startsWith(`photos/${personId}/`)
    ) {
      throw new DomainError(t("T-363"), "photo");
    }
  }
  await ctx.tx.update(person).set({ photoAssetId: assetId }).where(eq(person.id, personId));
  await ctx.audit({
    action: "person.photo-changed",
    entityType: "person",
    entityId: personId,
    after: { photoAssetId: assetId },
  });
}

/** Deja la marca de solicitud de eliminación; la tarea para GH la crea el CRM por outbox. */
export async function requestDeletion(
  ctx: CommandContext,
  personId: string,
  now = new Date(),
): Promise<{ created: boolean; requestedAt: Date }> {
  const [row] = await ctx.tx
    .select({ requestedAt: person.deletionRequestedAt })
    .from(person)
    .where(eq(person.id, personId));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.requestedAt) {
    return { created: false, requestedAt: row.requestedAt };
  }
  await ctx.tx.update(person).set({ deletionRequestedAt: now }).where(eq(person.id, personId));
  await ctx.audit({
    action: "person.deletion-requested",
    entityType: "person",
    entityId: personId,
    after: { requestedAt: now.toISOString() },
  });
  await ctx.emit(
    eventOf(personDeletionRequested, {
      actorId: ctx.actor.personId,
      personId,
      requestedAt: now.toISOString(),
    }),
  );
  return { created: true, requestedAt: now };
}

/** Proyección propia cerrada: nunca hereda columnas ni notas de la Persona 360 administrativa. */
export async function collectPersonalData(personId: string) {
  const db = getDb();
  const [who] = await db
    .select({
      id: person.id,
      email: person.email,
      kind: person.kind,
      stage: person.stage,
      firstName: person.firstName,
      lastName: person.lastName,
      fullName: person.fullName,
      preferredName: person.preferredName,
      phone: person.phone,
      personalEmail: person.personalEmail,
      program: person.program,
      documentType: person.documentType,
      documentNumber: person.documentNumber,
      epikId: person.epikId,
      cardUid: person.cardUid,
      birthDate: person.birthDate,
      photoAssetId: person.photoAssetId,
      source: person.source,
      deletionRequestedAt: person.deletionRequestedAt,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    })
    .from(person)
    .where(eq(person.id, personId))
    .limit(1);
  if (!who) return null;
  const [
    memberships,
    events,
    committeesByTerm,
    appointments,
    probation,
    personTags,
    sanctions,
    committeeRoles,
    committeeRepresentations,
    consents,
  ] = await Promise.all([
    db
      .select({
        id: membership.id,
        status: membership.status,
        walletEpoch: membership.walletEpoch,
        firstTermId: membership.firstTermId,
        lastTermId: membership.lastTermId,
        leaveUntil: membership.leaveUntil,
        leaveCondition: membership.leaveCondition,
        endedAt: membership.endedAt,
        endReason: membership.endReason,
        createdAt: membership.createdAt,
        updatedAt: membership.updatedAt,
      })
      .from(membership)
      .where(eq(membership.personId, personId))
      .limit(1),
    db
      .select({
        id: membershipEvent.id,
        fromStatus: membershipEvent.fromStatus,
        toStatus: membershipEvent.toStatus,
        at: membershipEvent.at,
      })
      .from(membershipEvent)
      .innerJoin(membership, eq(membership.id, membershipEvent.membershipId))
      .where(eq(membership.personId, personId))
      .orderBy(desc(membershipEvent.at), desc(membershipEvent.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: committeeMembership.id,
        committeeId: committeeMembership.committeeId,
        termId: committeeMembership.termId,
        roleCode: committeeMembership.roleCode,
        transferredIn: committeeMembership.transferredIn,
        joinedAt: committeeMembership.joinedAt,
        leftAt: committeeMembership.leftAt,
        createdAt: committeeMembership.createdAt,
      })
      .from(committeeMembership)
      .where(eq(committeeMembership.personId, personId))
      .orderBy(desc(committeeMembership.createdAt), desc(committeeMembership.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: appointment.id,
        kind: appointment.kind,
        committeeId: appointment.committeeId,
        termId: appointment.termId,
        editionId: appointment.editionId,
        roleCode: appointment.roleCode,
        coDirector: appointment.coDirector,
        title: appointment.title,
        createdAt: appointment.createdAt,
      })
      .from(appointment)
      .where(eq(appointment.personId, personId))
      .orderBy(desc(appointment.createdAt), desc(appointment.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: membershipTerm.id,
        termId: membershipTerm.termId,
        committeeId: membershipTerm.committeeId,
        probation: membershipTerm.probation,
        reportAsVeteran: membershipTerm.reportAsVeteran,
        resumedNew: membershipTerm.resumedNew,
        resumedTransfer: membershipTerm.resumedTransfer,
        academicVerifiedOn: membershipTerm.academicVerifiedOn,
        createdAt: membershipTerm.createdAt,
      })
      .from(membershipTerm)
      .where(eq(membershipTerm.personId, personId))
      .orderBy(desc(membershipTerm.createdAt), desc(membershipTerm.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: personTag.id,
        tagId: personTag.tagId,
        name: tag.name,
        color: tag.color,
        createdAt: personTag.createdAt,
      })
      .from(personTag)
      .innerJoin(tag, eq(tag.id, personTag.tagId))
      .where(eq(personTag.personId, personId))
      .orderBy(desc(personTag.createdAt), desc(personTag.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: sanction.id,
        termId: sanction.termId,
        committeeId: sanction.committeeId,
        kind: sanction.kind,
        reference: sanction.reference,
        occurredOn: sanction.occurredOn,
        suspendedFrom: sanction.suspendedFrom,
        suspendedUntil: sanction.suspendedUntil,
        expiresOn: sanction.expiresOn,
        revokedAt: sanction.revokedAt,
        createdAt: sanction.createdAt,
      })
      .from(sanction)
      .where(eq(sanction.personId, personId))
      .orderBy(desc(sanction.createdAt), desc(sanction.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: committeeRoleAssignment.id,
        membershipId: committeeRoleAssignment.membershipId,
        committeeId: committeeRoleAssignment.committeeId,
        termId: committeeRoleAssignment.termId,
        roleCode: committeeRoleAssignment.roleCode,
        coDirector: committeeRoleAssignment.coDirector,
        startedAt: committeeRoleAssignment.startedAt,
        endedAt: committeeRoleAssignment.endedAt,
        createdAt: committeeRoleAssignment.createdAt,
      })
      .from(committeeRoleAssignment)
      .where(eq(committeeRoleAssignment.personId, personId))
      .orderBy(desc(committeeRoleAssignment.createdAt), desc(committeeRoleAssignment.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: committeeRepresentative.id,
        committeeId: committeeRepresentative.committeeId,
        termId: committeeRepresentative.termId,
        role: committeeRepresentative.role,
        createdAt: committeeRepresentative.createdAt,
      })
      .from(committeeRepresentative)
      .where(eq(committeeRepresentative.personId, personId))
      .orderBy(desc(committeeRepresentative.createdAt), desc(committeeRepresentative.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    listConsents(personId),
  ]);
  const collections = ownDataCollections({
    events,
    committeesByTerm,
    appointments,
    probation,
    personTags,
    sanctions,
    committeeRoles,
    committeeRepresentations,
  });
  const ownConsents = consents.map((state) => {
    const history = state.history.map((row) => ({
      id: row.id,
      purpose: row.purpose,
      source: row.source,
      policyVersion: row.policyVersion,
      acceptedAt: row.acceptedAt,
      revokedAt: row.revokedAt,
      // Una aceptación administrativa puede llevar la IP del operador, que no es del titular.
      ip: row.source === "SELF" ? row.ip : null,
    }));
    return {
      purpose: state.purpose,
      live: history.find((row) => row.revokedAt === null) ?? null,
      history,
    };
  });
  const currentMembership = memberships[0];
  const leaveCondition = leaveConditionSchema.safeParse(currentMembership?.leaveCondition ?? null);
  return {
    person: who,
    membership: currentMembership
      ? {
          ...currentMembership,
          leaveCondition: leaveCondition.success ? leaveCondition.data : null,
          leaveConditionAvailable: leaveCondition.success,
        }
      : null,
    ...collections.data,
    consents: ownConsents,
    exportLimits: {
      ...collections.limits,
      consents: { limit: null, returned: ownConsents.length, truncated: false },
    },
  };
}
