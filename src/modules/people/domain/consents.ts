import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { CommandContext } from "@/db/tx";
import { requireConfig } from "@/modules/system";
import { consent } from "../schema";

// Consentimiento versionado por propósito (ADR-014, ADR-034): una fila por aceptación; revocar estampa
// revokedAt; la versión de la política es la vigente al aceptar.

export type ConsentRow = typeof consent.$inferSelect;
export type ConsentPurpose = ConsentRow["purpose"];
export type ConsentSource = ConsentRow["source"];

export const CONSENT_PURPOSES: readonly ConsentPurpose[] = [
  "MEMBERSHIP",
  "COMMUNICATIONS",
  "DIRECTORY_PHOTO",
  "MEMORIAL",
];

export interface ConsentState {
  purpose: ConsentPurpose;
  live: ConsentRow | null;
  history: ConsentRow[];
}

/** Estado por propósito: el consentimiento vivo (si hay) y su historial. */
export async function listConsents(personId: string): Promise<ConsentState[]> {
  const rows = await getDb()
    .select()
    .from(consent)
    .where(eq(consent.personId, personId))
    .orderBy(desc(consent.acceptedAt));
  return CONSENT_PURPOSES.map((purpose) => {
    const history = rows.filter((row) => row.purpose === purpose);
    return { purpose, live: history.find((row) => row.revokedAt === null) ?? null, history };
  });
}

export async function hasLiveConsent(personId: string, purpose: ConsentPurpose): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: consent.id })
    .from(consent)
    .where(
      and(eq(consent.personId, personId), eq(consent.purpose, purpose), isNull(consent.revokedAt)),
    )
    .limit(1);
  return row !== undefined;
}

export interface RecordConsentInput {
  purpose: ConsentPurpose;
  source: ConsentSource;
  ip?: string | null;
}

/** Registra un consentimiento vivo; si ya había uno, no duplica. */
export async function recordConsent(
  ctx: CommandContext,
  personId: string,
  input: RecordConsentInput,
): Promise<{ id: string; created: boolean }> {
  const [live] = await ctx.tx
    .select({ id: consent.id })
    .from(consent)
    .where(
      and(
        eq(consent.personId, personId),
        eq(consent.purpose, input.purpose),
        isNull(consent.revokedAt),
      ),
    )
    .limit(1);
  if (live) {
    return { id: live.id, created: false };
  }
  const policyVersion = await requireConfig("privacy.policyVersion");
  const [row] = await ctx.tx
    .insert(consent)
    .values({
      personId,
      purpose: input.purpose,
      source: input.source,
      policyVersion,
      ip: input.ip ?? ctx.actor.ip ?? null,
    })
    .returning({ id: consent.id });
  if (!row) {
    throw new Error("No se pudo registrar el consentimiento");
  }
  await ctx.audit({
    action: "consent.granted",
    entityType: "consent",
    entityId: row.id,
    after: { personId, purpose: input.purpose, source: input.source, policyVersion },
  });
  await ctx.emit({
    type: "consent.changed",
    payload: {
      actorId: ctx.actor.personId,
      personId,
      purpose: input.purpose,
      action: "GRANTED",
      source: input.source,
    },
  });
  return { id: row.id, created: true };
}

/** Revoca el consentimiento vivo de un propósito; devuelve false si no había ninguno. */
export async function revokeConsent(
  ctx: CommandContext,
  personId: string,
  purpose: ConsentPurpose,
  now = new Date(),
): Promise<boolean> {
  const revoked = await ctx.tx
    .update(consent)
    .set({ revokedAt: now })
    .where(
      and(eq(consent.personId, personId), eq(consent.purpose, purpose), isNull(consent.revokedAt)),
    )
    .returning({ id: consent.id });
  const row = revoked[0];
  if (!row) {
    return false;
  }
  await ctx.audit({
    action: "consent.revoked",
    entityType: "consent",
    entityId: row.id,
    after: { personId, purpose },
  });
  await ctx.emit({
    type: "consent.changed",
    payload: { actorId: ctx.actor.personId, personId, purpose, action: "REVOKED" },
  });
  return true;
}

/** Deja el consentimiento como lo pide `granted` (lo registra o lo revoca) sin duplicar filas. */
export async function syncConsent(
  ctx: CommandContext,
  personId: string,
  purpose: ConsentPurpose,
  granted: boolean,
  source: ConsentSource,
): Promise<void> {
  if (granted) {
    await recordConsent(ctx, personId, { purpose, source });
  } else {
    await revokeConsent(ctx, personId, purpose);
  }
}

/** Revoca todos los consentimientos vivos (anonimización). */
export async function revokeAllConsents(
  ctx: CommandContext,
  personId: string,
  now = new Date(),
): Promise<number> {
  const revoked = await ctx.tx
    .update(consent)
    .set({ revokedAt: now })
    .where(and(eq(consent.personId, personId), isNull(consent.revokedAt)))
    .returning({ id: consent.id });
  return revoked.length;
}
