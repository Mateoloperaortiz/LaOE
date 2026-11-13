import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { sanctionRecorded, sanctionRevoked } from "@/domain-events/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tLabels, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import { committee, committeeMembership, membership, person, sanction } from "../schema";
import { APPOINTMENT_KINDS } from "./appointment-kinds";
import { currentSeatAuthority, type SeatAuthority, seatDeciders } from "./board-seats";
import {
  COMMITTEE_SANCTION_KINDS,
  deriveDates,
  expulsionWarning,
  hasOfficeBan,
  SANCTION_KINDS,
  type SanctionKind,
  type SanctionLike,
  type SanctionScope,
  type SanctionState,
  sanctionState,
  suspendedUntil,
} from "./sanction-pure";

// Faltas y sanciones (Regl. cap. 9 y Anexo 1; ADR-060 regla 6; ADR-196): la dirección de un comité
// con PERMANENCE anota la falta, que queda por avalar hasta que la VP de Gestión Humana la avale o la
// rechace (Regl. art. 70 par. 2); la VP registra por su cargo cualquier sanción, que vale de una vez, y
// anula. ADMIN no registra sanciones. Cada camino declara su alcance y el comando lo comprueba (ADR-072
// regla 1; ADR-112). `sanction.recorded` sale cuando la sanción toma efecto, y deja en la línea de
// tiempo la causal con los descargos. Los efectos (beneficios, cargos, cierre) los leen crm, people y
// permanence por estas lecturas, que solo cuentan lo avalado.

export type SanctionRecord = typeof sanction.$inferSelect;

export const sanctionInputSchema = z.object({
  termId: z.string().trim().min(1),
  kind: z.enum(SANCTION_KINDS),
  /** Los hechos y los descargos (Regl. art. 56 y 57): mínimo una frase. */
  cause: z.string().trim().min(5).max(1000),
  reference: z
    .string()
    .trim()
    .max(120)
    .nullable()
    .default(null)
    .transform((value) => value || null),
  occurredOn: z.iso.date(),
  /** Solo para SUSPENSION: hasta cuándo, dentro del mes siguiente (Regl. art. 59). */
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

/** Los estados de una sanción en el orden de T-2243. */
const SANCTION_STATES = [
  "LIVE",
  "EXPIRED",
  "REVOKED",
  "PENDING",
  "REJECTED",
] as const satisfies readonly SanctionState[];

const vpGhLabel = () => tLabels("T-444", APPOINTMENT_KINDS).VP_GH;

/** Quien decide por la VP de Gestión Humana: la titular o la Presidencia que la suple (ADR-195). */
async function assertGhAuthority(ctx: CommandContext, now: Date): Promise<SeatAuthority> {
  const authority = ctx.actor.personId
    ? await currentSeatAuthority(ctx.actor.personId, "VP_GH", ctx.tx, now)
    : null;
  if (!authority) {
    throw new DomainError(t("T-5088", { cargo: vpGhLabel() }));
  }
  return authority;
}

async function personName(exec: Executor, personId: string): Promise<string> {
  const [row] = await exec
    .select({ fullName: person.fullName })
    .from(person)
    .where(eq(person.id, personId));
  return row?.fullName ?? "";
}

export function sanctionKindLabel(kind: SanctionKind): string {
  return tLabels("T-2229", SANCTION_KINDS)[kind] ?? kind;
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
    stateLabel: tLabels("T-2243", SANCTION_STATES)[state] ?? state,
  };
}

type CommitteeSanctionScope = Extract<SanctionScope, { by: "COMMITTEE" }>;

/**
 * Lo que la dirección de un comité puede sancionar (ADR-112): a un miembro vivo de su comité en ese
 * término, que si es ajeno se trata como inexistente, y con un tipo de los suyos.
 */
async function assertCommitteeScope(
  exec: Executor,
  personId: string,
  kind: SanctionKind,
  scope: CommitteeSanctionScope,
): Promise<void> {
  const [own] = await exec
    .select({ id: committeeMembership.id })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, personId),
        eq(committeeMembership.committeeId, scope.committeeId),
        eq(committeeMembership.termId, scope.termId),
        isNull(committeeMembership.leftAt),
      ),
    );
  if (!own) {
    throw new DomainError(t("T-032"));
  }
  if (!COMMITTEE_SANCTION_KINDS.includes(kind)) {
    throw new DomainError(t("T-260"), "kind");
  }
}

/**
 * Registra una sanción sobre una membresía viva y deriva sus fechas; devuelve el id. El alcance es
 * obligatorio (ADR-112). Desde un comité pasa por `assertCommitteeScope`, queda a nombre de ese comité
 * y de ese término, traiga lo que traiga la entrada, y queda por avalar: le llega el aviso a quien
 * decide por la VP de GH (ADR-196 regla 3). Desde Gestión Humana se comprueba el cargo y queda avalada
 * al registrarse, de cualquier tipo y comité (regla 5).
 */
export async function recordSanction(
  ctx: CommandContext,
  personId: string,
  raw: SanctionInput,
  scope: SanctionScope,
  now = new Date(),
): Promise<{ id: string }> {
  // Un alcance que no se reconoce se rechaza: nunca cae en el de Gestión Humana, que es el más amplio.
  const by: unknown = (scope as { by?: unknown } | undefined)?.by;
  if (by !== "GH" && by !== "COMMITTEE") {
    throw new DomainError(t("T-032"));
  }
  const parsed = sanctionInputSchema.parse(raw);
  const input =
    scope.by === "COMMITTEE"
      ? { ...parsed, termId: scope.termId, committeeId: scope.committeeId }
      : parsed;
  const authority = scope.by === "GH" ? await assertGhAuthority(ctx, now) : null;
  if (scope.by === "COMMITTEE") {
    await assertCommitteeScope(ctx.tx, personId, input.kind, scope);
  }
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
  const decided = authority
    ? {
        status: "APPROVED" as const,
        decidedAt: now,
        decidedById: ctx.actor.personId,
        decidedAs: authority,
      }
    : { status: "PENDING" as const };
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
      ...decided,
    })
    .returning({ id: sanction.id });
  if (!created) {
    throw new Error("No se pudo registrar la sanción");
  }
  await ctx.audit({
    action: "sanction.recorded",
    entityType: "sanction",
    entityId: created.id,
    after: { personId, ...input, ...dates, status: decided.status },
  });
  if (decided.status === "APPROVED") {
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
  // Por avalar: el aviso a quien decide por la VP de GH (ADR-195 regla 3).
  const term = await getCurrentTerm(now, ctx.tx);
  const deciders = term ? await seatDeciders("VP_GH", term.id, ctx.tx) : [];
  if (deciders.length > 0) {
    const [committeeRow] = input.committeeId
      ? await ctx.tx
          .select({ name: committee.name })
          .from(committee)
          .where(eq(committee.id, input.committeeId))
      : [];
    const [title, body] = tList("T-5093");
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "TRANSACTIONAL",
        recipients: deciders.map((decider) => ({ personId: decider })),
        title: title ?? "",
        body: (body ?? "")
          .replace("{comité}", committeeRow?.name ?? "")
          .replace("{persona}", await personName(ctx.tx, personId))
          .replace("{tipo}", sanctionKindLabel(input.kind).toLowerCase()),
        url: `/admin/avales?falta=${created.id}`,
        tag: `falta-${created.id}`,
        dedupeKey: `falta-por-avalar:${created.id}`,
      }),
    );
  }
  return { id: created.id };
}

export const sanctionDecisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().trim().max(500).default(""),
});

export type SanctionDecisionInput = z.input<typeof sanctionDecisionSchema>;

/**
 * El aval de la VP de Gestión Humana a una falta por avalar (ADR-196 regla 4): una sola vez. Al
 * avalarla, la suspensión y el año de vigencia empiezan ese día, y la sanción toma efecto; rechazarla
 * exige el motivo. Quien la anotó recibe un aviso en los dos casos.
 */
export async function decideSanction(
  ctx: CommandContext,
  sanctionId: string,
  raw: SanctionDecisionInput,
  now = new Date(),
): Promise<void> {
  const input = sanctionDecisionSchema.parse(raw);
  const authority = await assertGhAuthority(ctx, now);
  if (input.decision === "REJECTED" && input.note.length < 2) {
    throw new DomainError(t("T-5087"), "note");
  }
  const [row] = await ctx.tx
    .select()
    .from(sanction)
    .where(eq(sanction.id, sanctionId))
    .for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.status !== "PENDING") {
    throw new DomainError(t("T-2296"));
  }
  const day = todayKey(now);
  const dates =
    input.decision === "APPROVED" ? deriveDates(row.kind, day, row.suspendedUntil) : null;
  if (dates && "error" in dates) {
    throw new DomainError(t(dates.error));
  }
  await ctx.tx
    .update(sanction)
    .set({
      status: input.decision,
      decidedAt: now,
      decidedById: ctx.actor.personId,
      decidedAs: authority,
      decisionNote: input.note,
      ...(dates ?? {}),
    })
    .where(eq(sanction.id, sanctionId));
  await ctx.audit({
    action: "sanction.decided",
    entityType: "sanction",
    entityId: sanctionId,
    before: { status: row.status },
    after: { status: input.decision, note: input.note, as: authority, ...(dates ?? {}) },
  });
  if (dates) {
    await ctx.emit(
      eventOf(sanctionRecorded, {
        actorId: ctx.actor.personId,
        personId: row.personId,
        sanctionId,
        termId: row.termId,
        committeeId: row.committeeId,
        kind: row.kind,
        cause: row.cause,
        occurredOn: row.occurredOn,
        suspendedUntil: dates.suspendedUntil,
        expiresOn: dates.expiresOn,
      }),
    );
  }
  if (row.issuedById) {
    const [title, approved, rejected] = tList("T-5094");
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "TRANSACTIONAL",
        recipients: [{ personId: row.issuedById }],
        title: title ?? "",
        body: ((input.decision === "APPROVED" ? approved : rejected) ?? "")
          .replace("{persona}", await personName(ctx.tx, row.personId))
          .replace("{motivo}", input.note),
        url: "/admin/mesa",
        tag: `falta-${sanctionId}`,
        dedupeKey: `falta-decidida:${sanctionId}`,
      }),
    );
  }
}

/**
 * Anula una sanción avalada de una persona (descargos o revisión de la junta, Regl. art. 57 par. 1);
 * idempotente. La persona es obligatoria (ADR-114 regla 3), y una sanción que no es suya se trata como
 * inexistente, también si ya estaba revocada. El alcance también es obligatorio (ADR-116 regla 11):
 * anula quien decide por la VP de Gestión Humana, desde «Faltas» (ADR-196 regla 5). Una falta por
 * avalar no se anula: se rechaza.
 */
export async function revokeSanction(
  ctx: CommandContext,
  personId: string,
  sanctionId: string,
  reason: string,
  scope: SanctionScope,
): Promise<void> {
  // Solo se deja pasar el alcance que anula. El de un comité, que no tiene ese permiso, y uno que no
  // se reconoce responden igual, antes de leer nada: para ellos la sanción no existe.
  const by: unknown = (scope as { by?: unknown } | undefined)?.by;
  if (by !== "GH") {
    throw new DomainError(t("T-032"));
  }
  await assertGhAuthority(ctx, new Date());
  // Sin una persona que se reconozca no se busca: nunca cae en «la sanción de cualquiera».
  if (typeof personId !== "string" || personId.length === 0) {
    throw new DomainError(t("T-032"));
  }
  const cleanReason = reason.trim();
  if (cleanReason.length < 2) {
    throw new DomainError(t("T-1003"), "reason");
  }
  const own = and(eq(sanction.id, sanctionId), eq(sanction.personId, personId));
  const [row] = await ctx.tx.select().from(sanction).where(own).for("update");
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  if (row.revokedAt) {
    return;
  }
  if (row.status !== "APPROVED") {
    throw new DomainError(t("T-032"));
  }
  const now = new Date();
  await ctx.tx
    .update(sanction)
    .set({ revokedAt: now, revokedById: ctx.actor.personId, revokeReason: cleanReason })
    .where(own);
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
        eq(sanction.status, "APPROVED"),
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
  exec: Executor = getDb(),
): Promise<Set<string>> {
  const map = await liveSanctions(onKey, personIds, exec);
  const warned = new Set<string>();
  for (const [personId, items] of map) {
    if (expulsionWarning(items, onKey)) {
      warned.add(personId);
    }
  }
  return warned;
}

export interface SanctionListRow extends SanctionView {
  personName: string;
  issuedByName: string | null;
}

async function withNames(
  rows: Array<{ row: SanctionRecord; committeeName: string | null }>,
  onKey: string,
): Promise<SanctionListRow[]> {
  const ids = [
    ...new Set(
      rows.flatMap(({ row }) => [row.personId, ...(row.issuedById ? [row.issuedById] : [])]),
    ),
  ];
  const names =
    ids.length === 0
      ? new Map<string, string>()
      : new Map(
          (
            await getDb()
              .select({ id: person.id, fullName: person.fullName })
              .from(person)
              .where(inArray(person.id, ids))
          ).map((item) => [item.id, item.fullName ?? ""]),
        );
  return rows.map(({ row, committeeName }) => ({
    ...toView(row, committeeName, onKey),
    personName: names.get(row.personId) ?? "",
    issuedByName: row.issuedById ? (names.get(row.issuedById) ?? null) : null,
  }));
}

/** Las faltas por avalar, de la más vieja a la más nueva: lo que le toca a la VP de GH (ADR-196). */
export async function listPendingSanctions(now = new Date()): Promise<SanctionListRow[]> {
  const rows = await getDb()
    .select({ row: sanction, committeeName: committee.name })
    .from(sanction)
    .leftJoin(committee, eq(committee.id, sanction.committeeId))
    .where(eq(sanction.status, "PENDING"))
    .orderBy(sanction.createdAt);
  return withNames(rows, todayKey(now));
}

/** Las sanciones de un término, de la más reciente a la más vieja, con su estado a hoy. */
export async function listSanctionsOfTerm(
  termId: string,
  now = new Date(),
): Promise<SanctionListRow[]> {
  const rows = await getDb()
    .select({ row: sanction, committeeName: committee.name })
    .from(sanction)
    .leftJoin(committee, eq(committee.id, sanction.committeeId))
    .where(eq(sanction.termId, termId))
    .orderBy(desc(sanction.occurredOn), desc(sanction.createdAt));
  return withNames(rows, todayKey(now));
}
