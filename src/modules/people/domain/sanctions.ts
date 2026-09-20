import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { sanctionRecorded, sanctionRevoked } from "@/domain-events/people";
import { t, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { committee, membership, sanction } from "../schema";
import {
  deriveDates,
  expulsionWarning,
  hasOfficeBan,
  SANCTION_KINDS,
  type SanctionKind,
  type SanctionLike,
  type SanctionState,
  sanctionState,
  suspendedUntil,
} from "./sanction-pure";

// Faltas y sanciones (Regl. cap. 9 y Anexo 1; ADR-060 regla 6): las registra ADMIN desde la Persona
// 360 o quien tiene PERMANENCE en el comité; cada una audita, emite `sanction.recorded` y deja en
// la línea de tiempo la causal con los descargos. Los efectos (beneficios, cargos, cierre) los leen
// crm, people y permanence por estas lecturas.

export type SanctionRecord = typeof sanction.$inferSelect;

export const sanctionInputSchema = z.object({
  termId: z.string().trim().min(1),
  kind: z.enum(SANCTION_KINDS as [SanctionKind, ...SanctionKind[]]),
  /** Los hechos y los descargos (Regl. art. 55 y 56): mínimo una frase. */
  cause: z.string().trim().min(5).max(1000),
  reference: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .default(null)
    .transform((value) => value || null),
  occurredOn: z.iso.date(),
  /** Solo para SUSPENSION: hasta cuándo, dentro del mes siguiente (Regl. art. 58). */
  suspendedUntil: z.iso
    .date()
    .nullable()
    .default(null)
    .transform((value) => value || null),
  committeeId: z
    .string()
    .trim()
    .nullable()
    .default(null)
    .transform((value) => value || null),
});

export type SanctionInput = z.input<typeof sanctionInputSchema>;

export function sanctionKindLabel(kind: SanctionKind): string {
  return tList("T-2229")[SANCTION_KINDS.indexOf(kind)] ?? kind;
}

export interface SanctionView extends SanctionRecord {
  kindLabel: string;
  committeeName: string | null;
  state: SanctionState;
  stateLabel: string;
}

function toView(row: SanctionRecord, committeeName: string | null, onKey: string): SanctionView {
  const state = sanctionState(row, onKey);
  return {
    ...row,
    kindLabel: sanctionKindLabel(row.kind),
    committeeName,
    state,
    stateLabel: tList("T-2243")[["LIVE", "EXPIRED", "REVOKED"].indexOf(state)] ?? state,
  };
}

/** Registra una sanción sobre una membresía viva y deriva sus fechas; devuelve el id. */
export async function recordSanction(
  ctx: CommandContext,
  personId: string,
  raw: SanctionInput,
): Promise<{ id: string }> {
  const input = sanctionInputSchema.parse(raw);
  const [current] = await ctx.tx
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, personId));
  if (!current) {
    throw new DomainError(t("T-032"));
  }
  if (current.status === "INACTIVE") {
    throw new DomainError(t("T-2244"));
  }
  const dates = deriveDates(input.kind, input.occurredOn, input.suspendedUntil);
  if ("error" in dates) {
    throw new DomainError(t(dates.error), "suspendedUntil");
  }
  const [created] = await ctx.tx
    .insert(sanction)
    .values({
      personId,
      termId: input.termId,
      committeeId: input.committeeId,
      kind: input.kind,
      cause: input.cause,
      reference: input.reference,
      occurredOn: input.occurredOn,
      suspendedFrom: dates.suspendedFrom,
      suspendedUntil: dates.suspendedUntil,
      expiresOn: dates.expiresOn,
      issuedById: ctx.actor.personId,
    })
    .returning({ id: sanction.id });
  if (!created) {
    throw new Error("No se pudo registrar la sanción");
  }
  await ctx.audit({
    action: "sanction.recorded",
    entityType: "sanction",
    entityId: created.id,
    after: { personId, ...input, ...dates },
  });
  await ctx.emit(
    eventOf(sanctionRecorded, {
      actorId: ctx.actor.personId,
      personId,
      sanctionId: created.id,
      termId: input.termId,
      committeeId: input.committeeId,
      kind: input.kind,
      cause: input.cause,
      occurredOn: input.occurredOn,
      suspendedUntil: dates.suspendedUntil,
      expiresOn: dates.expiresOn,
    }),
  );
  return { id: created.id };
}

/** Revoca una sanción (descargos o revisión de la junta, Regl. art. 56 par. 1); idempotente. */
export async function revokeSanction(
  ctx: CommandContext,
  sanctionId: string,
  reason: string,
): Promise<void> {
  const cleanReason = reason.trim();
  if (cleanReason.length < 2) {
    throw new DomainError(t("T-1003"), "reason");
  }
  const [row] = await ctx.tx
    .select()
    .from(sanction)
    .where(eq(sanction.id, sanctionId))
    .for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.revokedAt) {
    return;
  }
  const now = new Date();
  await ctx.tx
    .update(sanction)
    .set({ revokedAt: now, revokedById: ctx.actor.personId, revokeReason: cleanReason })
    .where(eq(sanction.id, sanctionId));
  await ctx.audit({
    action: "sanction.revoked",
    entityType: "sanction",
    entityId: sanctionId,
    before: { revokedAt: null },
    after: { revokedAt: now.toISOString(), reason: cleanReason },
  });
  await ctx.emit(
    eventOf(sanctionRevoked, {
      actorId: ctx.actor.personId,
      personId: row.personId,
      sanctionId,
      termId: row.termId,
      kind: row.kind,
      reason: cleanReason,
    }),
  );
}

// Lecturas.

/** Todas las sanciones de una persona, de la más reciente a la más vieja, con su estado a hoy. */
export async function listSanctionsForPerson(
  personId: string,
  now = new Date(),
): Promise<SanctionView[]> {
  const onKey = todayKey(now);
  const rows = await getDb()
    .select({ row: sanction, committeeName: committee.name })
    .from(sanction)
    .leftJoin(committee, eq(committee.id, sanction.committeeId))
    .where(eq(sanction.personId, personId))
    .orderBy(desc(sanction.occurredOn), desc(sanction.createdAt));
  return rows.map((item) => toView(item.row, item.committeeName ?? null, onKey));
}

async function liveSanctions(
  onKey: string,
  personIds?: string[],
  exec: Executor = getDb(),
): Promise<Map<string, SanctionLike[]>> {
  if (personIds && personIds.length === 0) {
    return new Map();
  }
  const rows = await exec
    .select()
    .from(sanction)
    .where(
      and(
        isNull(sanction.revokedAt),
        gte(sanction.expiresOn, onKey),
        personIds ? inArray(sanction.personId, personIds) : undefined,
      ),
    );
  const map = new Map<string, SanctionLike[]>();
  for (const row of rows) {
    map.set(row.personId, [...(map.get(row.personId) ?? []), row]);
  }
  return map;
}

export interface SanctionStateView {
  /** Derechos y beneficios suspendidos hasta ese día (YYYY-MM-DD), o nulo. */
  suspendedUntil: string | null;
  officeBan: boolean;
  expulsionWarning: boolean;
}

/** Qué efectos tiene hoy la persona: suspensión de beneficios, inhabilidad y advertencia de expulsión. */
export async function sanctionStateFor(
  personId: string,
  now = new Date(),
  exec: Executor = getDb(),
): Promise<SanctionStateView> {
  const onKey = todayKey(now);
  const items = (await liveSanctions(onKey, [personId], exec)).get(personId) ?? [];
  return {
    suspendedUntil: suspendedUntil(items, onKey),
    officeBan: hasOfficeBan(items, onKey),
    expulsionWarning: expulsionWarning(items, onKey),
  };
}

/** Quiénes llegan a un día (el cierre del término) con falta grave más otra sanción viva. */
export async function listExpulsionWarnings(
  onKey: string,
  personIds?: string[],
): Promise<Set<string>> {
  const map = await liveSanctions(onKey, personIds);
  const warned = new Set<string>();
  for (const [personId, items] of map) {
    if (expulsionWarning(items, onKey)) {
      warned.add(personId);
    }
  }
  return warned;
}
