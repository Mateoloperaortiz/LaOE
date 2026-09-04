import { eq } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { getMedia } from "@/modules/content";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { person } from "../schema";
import { getPerson360 } from "./person-360";
import { normalizePhone } from "./person-pure";

// Lo que una persona hace sobre sus propios datos desde Ajustes (ADR-034 reglas 8 y 12): contacto,
// foto, solicitud de eliminación y el paquete de "mis datos". Nunca toca el correo institucional.

export const ownContactSchema = z.object({
  phone: z.string().trim().max(40).default(""),
  personalEmail: z.string().trim().toLowerCase().max(254).default(""),
});

export type OwnContactInput = z.infer<typeof ownContactSchema>;

const E164 = /^\+\d{8,15}$/;
const emailSchema = z.email();
const CONTACT_FIELDS = ["phone", "personalEmail"] as const;

export async function updateOwnContact(
  ctx: CommandContext,
  personId: string,
  input: OwnContactInput,
): Promise<void> {
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
    .select({ phone: person.phone, personalEmail: person.personalEmail })
    .from(person)
    .where(eq(person.id, personId));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  const after = { phone, personalEmail };
  const changed = CONTACT_FIELDS.filter((field) => before[field] !== after[field]);
  if (changed.length === 0) {
    return;
  }
  await ctx.tx.update(person).set(after).where(eq(person.id, personId));
  await ctx.audit({
    action: "person.updated",
    entityType: "person",
    entityId: personId,
    before: Object.fromEntries(changed.map((field) => [field, before[field]])),
    after: Object.fromEntries(changed.map((field) => [field, after[field]])),
  });
  await ctx.emit({
    type: "person.updated",
    payload: { actorId: ctx.actor.personId, personId, fields: changed },
  });
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
  await ctx.emit({
    type: "person.deletion-requested",
    payload: { actorId: ctx.actor.personId, personId, requestedAt: now.toISOString() },
  });
  return { created: true, requestedAt: now };
}

export interface PersonalData {
  person: Record<string, unknown>;
  membership: Record<string, unknown> | null;
  events: unknown[];
  committeesByTerm: unknown[];
  appointments: unknown[];
  consents: unknown[];
  probation: unknown[];
}

/** Lo que `people` guarda sobre una persona, sin marcas internas (regla 12 de ADR-034). */
export async function collectPersonalData(personId: string): Promise<PersonalData | null> {
  const data = await getPerson360(personId);
  if (!data) {
    return null;
  }
  const {
    sessionsRevokedAt: _sessions,
    legacyId: _legacy,
    anonymizedAt: _anonymized,
    ...who
  } = data.person;
  return {
    person: who,
    membership: data.membership,
    events: data.events,
    committeesByTerm: data.committeesByTerm,
    appointments: data.appointments,
    consents: data.consents.map((state) => ({
      purpose: state.purpose,
      live: state.live,
      history: state.history,
    })),
    probation: data.probation,
  };
}
