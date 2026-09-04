import { eq, isNotNull, sql } from "drizzle-orm";
import type { Client } from "pg";
import { getDb } from "@/db/client";
import { enqueueEvent, type Tx } from "@/db/tx";
import { buildStanding } from "@/modules/participation/domain/closing";
import { defaultWindow, type WindowConfig } from "@/modules/participation/domain/occasion-pure";
import { isPublicId } from "@/modules/participation/domain/public-id-pure";
import {
  assemblyRequirement,
  checkIn,
  occasion,
  pointEntry,
  termStanding,
} from "@/modules/participation/schema";
import { legacyAlias } from "@/modules/system/schema";
import { t } from "@/shared/copy";

// Participación desde GHPOINTS (ADR-018, ADR-035 regla 19, 08-migracion-ghpoints.md): pasos 6 a 11
// del ensayo. Idempotente por `legacyId`; el ledger va en dos pasadas (las reversiones necesitan el
// mapa de originales); el score de comité no se copia: se encola `score.recompute` por ocasión.

export interface LegacyActivity {
  id: string;
  publicId: string;
  seasonId: string;
  name: string;
  description: string | null;
  activityType: string;
  startsAt: Date;
  registrationStart: Date;
  registrationEnd: Date;
  individualPoints: number;
  approvalMode: string;
  status: string;
  committeeId: string | null;
  eventEditionId: string | null;
  cancelReason: string | null;
  createdById: string;
  createdAt: Date;
}

export interface LegacyAssembly {
  id: string;
  publicId: string;
  seasonId: string;
  name: string;
  description: string | null;
  location: string | null;
  kind: string;
  startsAt: Date | null;
  registrationStart: Date | null;
  registrationEnd: Date | null;
  status: string;
  cancelReason: string | null;
  createdById: string;
  createdAt: Date;
}

export interface LegacyPublicIdHistory {
  ownerId: string;
  publicId: string;
}

export interface LegacyAttendance {
  id: string;
  activityId: string;
  memberId: string;
  status: string;
  registeredAt: Date;
  approvedAt: Date | null;
  approvedById: string | null;
  source: string;
  cancelledAt: Date | null;
  cancelReason: string | null;
  updatedAt: Date;
}

export interface LegacyAssemblyAttendance {
  id: string;
  assemblyId: string;
  memberId: string;
  status: string;
  registeredAt: Date;
  source: string;
  cancelledAt: Date | null;
  cancelReason: string | null;
  cancelledById: string | null;
}

export interface LegacyPointTransaction {
  id: string;
  memberId: string;
  seasonId: string;
  attendanceId: string | null;
  points: number;
  type: string;
  reason: string;
  createdById: string | null;
  createdAt: Date;
  reversalOfId: string | null;
}

export interface LegacyAssemblyRequirement {
  seasonId: string;
  memberId: string;
  requiredAttendanceCount: number;
  requiresBoardElection: boolean;
  adjustmentReason: string | null;
  adjustedById: string | null;
}

export interface LegacyHallOfFame {
  seasonId: string;
  activeWinnerId: string | null;
  newWinnerId: string | null;
  committeeWinnerId: string | null;
  top3Active: unknown;
  top3New: unknown;
  top3Committees: unknown;
  stats: unknown;
  createdAt: Date;
}

export interface LegacyFrozenScore {
  committeeId: string;
  activityId: string;
  eligibleMemberCount: number;
  participationRate: string;
}

export interface LegacyParticipation {
  activities: LegacyActivity[];
  activityPublicIds: LegacyPublicIdHistory[];
  assemblies: LegacyAssembly[];
  assemblyPublicIds: LegacyPublicIdHistory[];
  attendances: LegacyAttendance[];
  assemblyAttendances: LegacyAssemblyAttendance[];
  pointTransactions: LegacyPointTransaction[];
  assemblyRequirements: LegacyAssemblyRequirement[];
  hallOfFame: LegacyHallOfFame[];
  frozenScores: LegacyFrozenScore[];
}

export async function readLegacyParticipation(source: Client): Promise<LegacyParticipation> {
  const activities = await source.query<LegacyActivity>(
    'select id, "publicId", "seasonId", name, description, "activityType", "startsAt", "registrationStart", "registrationEnd", "individualPoints", "approvalMode", status, "committeeId", "eventEditionId", "cancelReason", "createdById", "createdAt" from "Activity" order by "startsAt", id',
  );
  const activityPublicIds = await source.query<LegacyPublicIdHistory>(
    'select "activityId" as "ownerId", "publicId" from "ActivityPublicIdHistory" order by "retiredAt"',
  );
  const assemblies = await source.query<LegacyAssembly>(
    'select id, "publicId", "seasonId", name, description, location, kind, "startsAt", "registrationStart", "registrationEnd", status, "cancelReason", "createdById", "createdAt" from "Assembly" order by "createdAt", id',
  );
  const assemblyPublicIds = await source.query<LegacyPublicIdHistory>(
    'select "assemblyId" as "ownerId", "publicId" from "AssemblyPublicIdHistory" order by "retiredAt"',
  );
  const attendances = await source.query<LegacyAttendance>(
    'select id, "activityId", "memberId", status, "registeredAt", "approvedAt", "approvedById", source, "cancelledAt", "cancelReason", "updatedAt" from "Attendance" order by "registeredAt", id',
  );
  const assemblyAttendances = await source.query<LegacyAssemblyAttendance>(
    'select id, "assemblyId", "memberId", status, "registeredAt", source, "cancelledAt", "cancelReason", "cancelledById" from "AssemblyAttendance" order by "registeredAt", id',
  );
  const pointTransactions = await source.query<LegacyPointTransaction>(
    'select id, "memberId", "seasonId", "attendanceId", points, type, reason, "createdById", "createdAt", "reversalOfId" from "PointTransaction" order by "createdAt", id',
  );
  const assemblyRequirements = await source.query<LegacyAssemblyRequirement>(
    'select "seasonId", "memberId", "requiredAttendanceCount", "requiresBoardElection", "adjustmentReason", "adjustedById" from "AssemblyRequirement"',
  );
  const hallOfFame = await source.query<LegacyHallOfFame>(
    'select "seasonId", "activeWinnerId", "newWinnerId", "committeeWinnerId", "top3Active", "top3New", "top3Committees", stats, "createdAt" from "HallOfFameSeason"',
  );
  const frozenScores = await source.query<LegacyFrozenScore>(
    'select "committeeId", "activityId", "eligibleMemberCount", "participationRate"::text as "participationRate" from "CommitteeActivityScore" where frozen',
  );
  return {
    activities: activities.rows,
    activityPublicIds: activityPublicIds.rows,
    assemblies: assemblies.rows,
    assemblyPublicIds: assemblyPublicIds.rows,
    attendances: attendances.rows,
    assemblyAttendances: assemblyAttendances.rows,
    pointTransactions: pointTransactions.rows,
    assemblyRequirements: assemblyRequirements.rows,
    hallOfFame: hallOfFame.rows,
    frozenScores: frozenScores.rows,
  };
}

// Mapeos de catálogos viejos a nuevos (08-migracion-ghpoints.md).

type OccasionCategory = typeof occasion.$inferInsert.category;
type OccasionStatus = NonNullable<typeof occasion.$inferInsert.status>;
type CheckInSource = NonNullable<typeof checkIn.$inferInsert.source>;
type CheckInStatus = NonNullable<typeof checkIn.$inferInsert.status>;

export function mapActivityCategory(activityType: string): NonNullable<OccasionCategory> {
  switch (activityType) {
    case "SPORTS":
      return "ATHLETIC_MATCH";
    case "TALK":
      return "TALK";
    case "WORKSHOP":
      return "WORKSHOP";
    case "SOCIAL":
      return "SOCIAL";
    default:
      return "OTHER";
  }
}

/** `PROCESSED` es `CLOSED`; una `OPEN` de una temporada cerrada también cierra. */
export function mapOccasionStatus(status: string, seasonClosed: boolean): OccasionStatus {
  switch (status) {
    case "DRAFT":
      return "DRAFT";
    case "OPEN":
      return seasonClosed ? "CLOSED" : "OPEN";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "CLOSED";
  }
}

export function mapCheckInSource(source: string): CheckInSource {
  switch (source) {
    case "ADMIN":
      return "ADMIN";
    case "IMPORT":
    case "MICROSOFT_FORMS":
      return "IMPORT";
    default:
      return "SELF_QR";
  }
}

export function mapCheckInStatus(status: string): CheckInStatus {
  switch (status) {
    case "PENDING":
      return "PENDING";
    case "REJECTED":
      return "REJECTED";
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "APPROVED"; // APPROVED y CONFIRMED (asambleas)
  }
}

/** Tipo del ledger nuevo para una transacción que no es reversión. */
export function mapEntryKind(type: string): "CHECKIN" | "ADJUSTMENT" | "LEGACY" {
  switch (type) {
    case "ACTIVITY":
      return "CHECKIN";
    case "MANUAL_ADJUSTMENT":
    case "BONUS":
    case "PENALTY":
      return "ADJUSTMENT";
    default:
      return "LEGACY"; // FLASH, BOOST, WORDLE
  }
}

export interface TermTarget {
  id: string;
  code: string;
  pointsClosedAt: Date | null;
}

export interface ParticipationSummary {
  activities: number;
  assemblies: number;
  aliases: number;
  checkIns: number;
  entries: number;
  requirements: number;
  standings: number;
  recomputes: number;
  warnings: string[];
}

export interface ParticipationMaps {
  termBySeason: Map<string, TermTarget>;
  seasonClosed: Map<string, boolean>;
  committeeByLegacy: Map<string, string>;
  personByLegacy: Map<string, string>;
  window: WindowConfig;
}

/** Anulada: cuándo se anuló; aprobada: cuándo se aprobó; rechazada: la última modificación. */
function decidedAtFor(
  status: CheckInStatus,
  item: Pick<LegacyAttendance, "approvedAt" | "cancelledAt" | "updatedAt">,
): Date | null {
  if (status === "CANCELLED") {
    return item.cancelledAt ?? item.approvedAt;
  }
  if (status === "REJECTED") {
    return item.updatedAt;
  }
  return item.approvedAt;
}

function orderedWindow(
  opensAt: Date | null,
  closesAt: Date | null,
  startsAt: Date,
  window: WindowConfig,
): { checkInOpensAt: Date; checkInClosesAt: Date; fallback: boolean } {
  if (opensAt && closesAt && opensAt < closesAt) {
    return { checkInOpensAt: opensAt, checkInClosesAt: closesAt, fallback: false };
  }
  return { ...defaultWindow(startsAt, window), fallback: true };
}

/** Pasos 6 a 10 dentro de la transacción de la migración (los pasos 1 a 5 ya corrieron en `tx`). */
export async function migrateParticipation(
  tx: Tx,
  legacy: LegacyParticipation,
  maps: ParticipationMaps,
  summary: ParticipationSummary,
): Promise<void> {
  const warn = (message: string) => summary.warnings.push(message);

  // Estado previo, para ser idempotentes sin una consulta por fila.
  const existingOccasions = await tx
    .select({
      id: occasion.id,
      publicId: occasion.publicId,
      legacyId: occasion.legacyId,
      termId: occasion.termId,
      assemblyKind: occasion.assemblyKind,
      status: occasion.status,
    })
    .from(occasion);
  const occasionByLegacy = new Map<string, string>();
  const occasionByPublicId = new Map<string, string>();
  const boardElectionTerms = new Set<string>();
  for (const row of existingOccasions) {
    if (row.legacyId) {
      occasionByLegacy.set(row.legacyId, row.id);
    }
    occasionByPublicId.set(row.publicId, row.id);
    if (row.assemblyKind === "BOARD_ELECTION" && row.status !== "CANCELLED") {
      boardElectionTerms.add(row.termId);
    }
  }

  // 6. Actividades → ocasiones ACTIVITY.
  const recompute: string[] = [];
  for (const item of legacy.activities) {
    if (occasionByLegacy.has(item.id)) {
      continue;
    }
    const target = maps.termBySeason.get(item.seasonId);
    if (!target) {
      warn(`La actividad ${item.publicId} no tiene término (temporada ${item.seasonId})`);
      continue;
    }
    if (!isPublicId(item.publicId)) {
      warn(`La actividad ${item.id} tiene un publicId inválido (${item.publicId})`);
      continue;
    }
    if (occasionByPublicId.has(item.publicId)) {
      warn(
        `El publicId ${item.publicId} ya pertenece a otra ocasión; la actividad ${item.id} no se migra`,
      );
      continue;
    }
    if (item.eventEditionId) {
      warn(
        `La actividad ${item.publicId} tenía la edición ${item.eventEditionId}; queda sin edición`,
      );
    }
    const committeeId = item.committeeId ? maps.committeeByLegacy.get(item.committeeId) : undefined;
    if (item.committeeId && !committeeId) {
      warn(`La actividad ${item.publicId} apunta a un comité sin migrar (${item.committeeId})`);
    }
    const window = orderedWindow(
      item.registrationStart,
      item.registrationEnd,
      item.startsAt,
      maps.window,
    );
    if (window.fallback) {
      warn(
        `La actividad ${item.publicId} tenía una ventana desordenada; se usa la ventana por defecto`,
      );
    }
    const status = mapOccasionStatus(item.status, maps.seasonClosed.get(item.seasonId) ?? false);
    const [created] = await tx
      .insert(occasion)
      .values({
        publicId: item.publicId,
        termId: target.id,
        kind: "ACTIVITY",
        category: mapActivityCategory(item.activityType),
        title: item.name,
        description: item.description ?? "",
        startsAt: item.startsAt,
        checkInOpensAt: window.checkInOpensAt,
        checkInClosesAt: window.checkInClosesAt,
        points: Math.max(0, item.individualPoints),
        approval: item.approvalMode === "MANUAL" ? "MANUAL" : "AUTO",
        committeeId: committeeId ?? null,
        status,
        cancelReason: status === "CANCELLED" ? item.cancelReason : null,
        closedAt: status === "CLOSED" ? window.checkInClosesAt : null,
        createdById: maps.personByLegacy.get(item.createdById) ?? null,
        legacyId: item.id,
        createdAt: item.createdAt,
      })
      .returning({ id: occasion.id });
    if (!created) {
      throw new Error(`No se pudo crear la ocasión ${item.publicId}`);
    }
    occasionByLegacy.set(item.id, created.id);
    occasionByPublicId.set(item.publicId, created.id);
    summary.activities += 1;
    if (item.individualPoints > 0 && (status === "OPEN" || status === "CLOSED")) {
      recompute.push(created.id);
    }
  }

  // 7. Asambleas → ocasiones ASSEMBLY sin puntos, más el alias /asamblea/{publicId}.
  const aliasPaths = new Set(
    (await tx.select({ path: legacyAlias.path }).from(legacyAlias)).map((row) => row.path),
  );
  const addAlias = async (path: string, targetId: string) => {
    if (aliasPaths.has(path)) {
      return;
    }
    await tx.insert(legacyAlias).values({ path, targetType: "OCCASION", targetId });
    aliasPaths.add(path);
    summary.aliases += 1;
  };
  for (const item of legacy.assemblies) {
    const known = occasionByLegacy.get(item.id);
    if (known) {
      await addAlias(`/asamblea/${item.publicId}`, known);
      continue;
    }
    const target = maps.termBySeason.get(item.seasonId);
    if (!target) {
      warn(`La asamblea ${item.publicId} no tiene término (temporada ${item.seasonId})`);
      continue;
    }
    if (!isPublicId(item.publicId)) {
      warn(`La asamblea ${item.id} tiene un publicId inválido (${item.publicId})`);
      continue;
    }
    if (occasionByPublicId.has(item.publicId)) {
      warn(
        `El publicId ${item.publicId} ya pertenece a otra ocasión; la asamblea ${item.id} no se migra`,
      );
      continue;
    }
    const status = mapOccasionStatus(item.status, maps.seasonClosed.get(item.seasonId) ?? false);
    const assemblyKind = item.kind === "BOARD_ELECTION" ? "BOARD_ELECTION" : "ORDINARY";
    if (assemblyKind === "BOARD_ELECTION" && status !== "CANCELLED") {
      if (boardElectionTerms.has(target.id)) {
        warn(
          `${target.code} ya tiene una elección de junta; la asamblea ${item.publicId} no se migra`,
        );
        continue;
      }
      boardElectionTerms.add(target.id);
    }
    const startsAt = item.startsAt ?? item.registrationStart ?? item.createdAt;
    const window = orderedWindow(
      item.registrationStart,
      item.registrationEnd,
      startsAt,
      maps.window,
    );
    const [created] = await tx
      .insert(occasion)
      .values({
        publicId: item.publicId,
        termId: target.id,
        kind: "ASSEMBLY",
        assemblyKind,
        category: "OTHER",
        title: item.name,
        description: item.description ?? "",
        location: item.location ?? "",
        startsAt,
        checkInOpensAt: window.checkInOpensAt,
        checkInClosesAt: window.checkInClosesAt,
        points: 0,
        approval: "AUTO",
        status,
        cancelReason: status === "CANCELLED" ? item.cancelReason : null,
        closedAt: status === "CLOSED" ? window.checkInClosesAt : null,
        createdById: maps.personByLegacy.get(item.createdById) ?? null,
        legacyId: item.id,
        createdAt: item.createdAt,
      })
      .returning({ id: occasion.id });
    if (!created) {
      throw new Error(`No se pudo crear la asamblea ${item.publicId}`);
    }
    occasionByLegacy.set(item.id, created.id);
    occasionByPublicId.set(item.publicId, created.id);
    summary.assemblies += 1;
    await addAlias(`/asamblea/${item.publicId}`, created.id);
  }

  // Los publicId retirados de ambos historiales siguen resolviendo.
  for (const [prefix, rows] of [
    ["/a/", legacy.activityPublicIds],
    ["/asamblea/", legacy.assemblyPublicIds],
  ] as const) {
    for (const item of rows) {
      const targetId = occasionByLegacy.get(item.ownerId);
      if (!targetId) {
        continue;
      }
      if (!isPublicId(item.publicId)) {
        warn(`El publicId retirado ${item.publicId} no tiene el formato esperado; sin alias`);
        continue;
      }
      await addAlias(`${prefix}${item.publicId}`, targetId);
    }
  }

  // 8. Asistencias → check-ins (idempotente por legacyId; el par ocasión-persona es único).
  const existingCheckIns = await tx
    .select({ id: checkIn.id, legacyId: checkIn.legacyId })
    .from(checkIn)
    .where(isNotNull(checkIn.legacyId));
  const checkInByLegacy = new Map<string, string>();
  for (const row of existingCheckIns) {
    if (row.legacyId) {
      checkInByLegacy.set(row.legacyId, row.id);
    }
  }
  const insertCheckIn = async (
    legacyId: string,
    occasionId: string | undefined,
    personId: string | undefined,
    values: Omit<typeof checkIn.$inferInsert, "occasionId" | "personId" | "legacyId">,
  ) => {
    if (checkInByLegacy.has(legacyId)) {
      return;
    }
    if (!occasionId || !personId) {
      warn(`La asistencia ${legacyId} apunta a una ocasión o una persona sin migrar`);
      return;
    }
    const [created] = await tx
      .insert(checkIn)
      .values({ ...values, occasionId, personId, legacyId })
      .onConflictDoNothing({ target: [checkIn.occasionId, checkIn.personId] })
      .returning({ id: checkIn.id });
    if (!created) {
      warn(`La asistencia ${legacyId} repite a la persona en la ocasión; no se migra`);
      return;
    }
    checkInByLegacy.set(legacyId, created.id);
    summary.checkIns += 1;
  };
  for (const item of legacy.attendances) {
    const status = mapCheckInStatus(item.status);
    await insertCheckIn(
      item.id,
      occasionByLegacy.get(item.activityId),
      maps.personByLegacy.get(item.memberId),
      {
        status,
        source: mapCheckInSource(item.source),
        at: item.registeredAt,
        decidedById: item.approvedById
          ? (maps.personByLegacy.get(item.approvedById) ?? null)
          : null,
        decidedAt: decidedAtFor(status, item),
        reason: item.cancelReason,
        createdAt: item.registeredAt,
      },
    );
  }
  for (const item of legacy.assemblyAttendances) {
    await insertCheckIn(
      item.id,
      occasionByLegacy.get(item.assemblyId),
      maps.personByLegacy.get(item.memberId),
      {
        status: mapCheckInStatus(item.status),
        source: mapCheckInSource(item.source),
        at: item.registeredAt,
        decidedById: item.cancelledById
          ? (maps.personByLegacy.get(item.cancelledById) ?? null)
          : null,
        decidedAt: item.cancelledAt,
        reason: item.cancelReason,
        createdAt: item.registeredAt,
      },
    );
  }

  // 9. Ledger en dos pasadas: primero lo que no es reversión, después las reversiones con su original.
  const existingEntries = await tx
    .select({
      id: pointEntry.id,
      legacyId: pointEntry.legacyId,
      kind: pointEntry.kind,
      checkInId: pointEntry.checkInId,
      reversalOfId: pointEntry.reversalOfId,
    })
    .from(pointEntry)
    .where(isNotNull(pointEntry.legacyId));
  const entryByLegacy = new Map<string, { id: string; checkInId: string | null }>();
  const creditedCheckIns = new Set<string>();
  const reversedEntries = new Set<string>();
  for (const row of existingEntries) {
    if (row.legacyId) {
      entryByLegacy.set(row.legacyId, { id: row.id, checkInId: row.checkInId });
    }
    if (row.kind === "CHECKIN" && row.checkInId) {
      creditedCheckIns.add(row.checkInId);
    }
    if (row.reversalOfId) {
      reversedEntries.add(row.reversalOfId);
    }
  }
  const entryContext = (item: LegacyPointTransaction) => {
    const target = maps.termBySeason.get(item.seasonId);
    const personId = maps.personByLegacy.get(item.memberId);
    if (!target || !personId) {
      warn(`La transacción ${item.id} apunta a un término o una persona sin migrar`);
      return null;
    }
    if (item.points === 0) {
      warn(`La transacción ${item.id} vale 0 puntos; no se migra`);
      return null;
    }
    return { termId: target.id, personId };
  };
  const insertEntry = async (
    item: LegacyPointTransaction,
    values: Pick<
      typeof pointEntry.$inferInsert,
      "kind" | "checkInId" | "reversalOfId" | "legacyType"
    >,
  ) => {
    const context = entryContext(item);
    if (!context) {
      return;
    }
    const [created] = await tx
      .insert(pointEntry)
      .values({
        ...values,
        personId: context.personId,
        termId: context.termId,
        points: item.points,
        reason: item.reason,
        createdById: item.createdById ? (maps.personByLegacy.get(item.createdById) ?? null) : null,
        legacyId: item.id,
        createdAt: item.createdAt,
      })
      .returning({ id: pointEntry.id, checkInId: pointEntry.checkInId });
    if (!created) {
      throw new Error(`No se pudo crear la entrada ${item.id}`);
    }
    entryByLegacy.set(item.id, created);
    if (values.kind === "CHECKIN" && created.checkInId) {
      creditedCheckIns.add(created.checkInId);
    }
    if (values.reversalOfId) {
      reversedEntries.add(values.reversalOfId);
    }
    summary.entries += 1;
  };
  for (const item of legacy.pointTransactions) {
    if (item.type === "REVERSAL" || entryByLegacy.has(item.id)) {
      continue;
    }
    let kind = mapEntryKind(item.type);
    const checkInId = item.attendanceId ? checkInByLegacy.get(item.attendanceId) : undefined;
    if (kind === "CHECKIN") {
      if (!checkInId) {
        warn(
          `La transacción ${item.id} de actividad no tiene asistencia migrada; queda como LEGACY`,
        );
        kind = "LEGACY";
      } else if (creditedCheckIns.has(checkInId)) {
        warn(
          `La transacción ${item.id} repite el crédito de la asistencia ${item.attendanceId}; queda como LEGACY`,
        );
        kind = "LEGACY";
      }
    }
    await insertEntry(item, {
      kind,
      checkInId: checkInId ?? null,
      reversalOfId: null,
      legacyType: item.type,
    });
  }
  for (const item of legacy.pointTransactions) {
    if (item.type !== "REVERSAL" || entryByLegacy.has(item.id)) {
      continue;
    }
    const original = item.reversalOfId ? entryByLegacy.get(item.reversalOfId) : undefined;
    if (!original || reversedEntries.has(original.id)) {
      warn(
        original
          ? `La reversión ${item.id} repite la reversión de ${item.reversalOfId}; queda como LEGACY`
          : `La reversión ${item.id} no tiene original migrado; queda como LEGACY`,
      );
      await insertEntry(item, {
        kind: "LEGACY",
        checkInId: null,
        reversalOfId: null,
        legacyType: "REVERSAL",
      });
      continue;
    }
    await insertEntry(item, {
      kind: "REVERSAL",
      checkInId: original.checkInId,
      reversalOfId: original.id,
      legacyType: "REVERSAL",
    });
  }

  // 10. Requisitos de asambleas: todos los de un término cerrado; solo los ajustados del abierto.
  for (const item of legacy.assemblyRequirements) {
    const target = maps.termBySeason.get(item.seasonId);
    const personId = maps.personByLegacy.get(item.memberId);
    if (!target || !personId) {
      continue;
    }
    const closed = target.pointsClosedAt !== null;
    if (!closed && !item.adjustmentReason) {
      continue;
    }
    const inserted = await tx
      .insert(assemblyRequirement)
      .values({
        termId: target.id,
        personId,
        requiredOrdinary: item.requiredAttendanceCount,
        requiresBoardElection: item.requiresBoardElection,
        requiresRunoff: false,
        adjustedReason: item.adjustmentReason ?? t("T-677"),
        adjustedById: item.adjustedById
          ? (maps.personByLegacy.get(item.adjustedById) ?? null)
          : null,
      })
      .onConflictDoNothing({ target: [assemblyRequirement.termId, assemblyRequirement.personId] })
      .returning({ id: assemblyRequirement.id });
    summary.requirements += inserted.length;
  }

  // El score de comité no se copia: cada ocasión con puntos se recalcula por outbox (ADR-009).
  for (const occasionId of recompute) {
    await enqueueEvent(tx, {
      type: "score.recompute",
      payload: { occasionId },
      dedupeKey: `score:${occasionId}`,
    });
    summary.recomputes += 1;
  }
}

/**
 * 11. Hall of fame → term_standing, fuera de la transacción: las listas se recalculan del ledger ya
 * confirmado y el JSON viejo queda bajo `stats.legacy`. Solo para términos con puntos cerrados.
 */
export async function migrateStandings(
  legacy: LegacyParticipation,
  termBySeason: Map<string, TermTarget>,
  summary: ParticipationSummary,
): Promise<void> {
  const db = getDb();
  for (const item of legacy.hallOfFame) {
    const target = termBySeason.get(item.seasonId);
    if (!target) {
      summary.warnings.push(`El hall of fame de la temporada ${item.seasonId} no tiene término`);
      continue;
    }
    if (!target.pointsClosedAt) {
      summary.warnings.push(
        `El hall of fame de ${target.code} es de un término sin cerrar; no se migra`,
      );
      continue;
    }
    const [existing] = await db
      .select({ id: termStanding.id })
      .from(termStanding)
      .where(eq(termStanding.termId, target.id))
      .limit(1);
    if (existing) {
      continue;
    }
    const standing = await buildStanding(target.id);
    await db.insert(termStanding).values({
      termId: target.id,
      topNew: standing.topNew,
      topVeteran: standing.topVeteran,
      topCommittees: standing.topCommittees,
      stats: {
        ...standing.stats,
        legacy: {
          activeWinnerId: item.activeWinnerId,
          newWinnerId: item.newWinnerId,
          committeeWinnerId: item.committeeWinnerId,
          top3Active: item.top3Active,
          top3New: item.top3New,
          top3Committees: item.top3Committees,
          stats: item.stats,
        },
      },
      createdAt: item.createdAt,
    });
    summary.standings += 1;
  }
}

export interface VerificationRow {
  name: string;
  source: number;
  target: number;
}

const RATE_TOLERANCE = 0.005;

/** Filas de verificación de la fase 3 y advertencias (no bloquean) sobre la base ya migrada. */
export async function verifyParticipation(
  legacy: LegacyParticipation,
  seasonCodeOf: (seasonId: string) => string | undefined,
): Promise<{ rows: VerificationRow[]; warnings: string[] }> {
  const db = getDb();
  const count = async (query: ReturnType<typeof sql>) => {
    const result = await db.execute<{ n: string }>(query);
    return Number.parseInt(result.rows[0]?.n ?? "0", 10);
  };
  const warnings: string[] = [];

  // Pares (miembro, temporada) con la misma suma de puntos.
  const sourceSums = new Map<string, number>();
  for (const item of legacy.pointTransactions) {
    const code = seasonCodeOf(item.seasonId);
    if (!code) {
      continue;
    }
    const key = `${item.memberId}:${code}`;
    sourceSums.set(key, (sourceSums.get(key) ?? 0) + item.points);
  }
  const targetSums = await db.execute<{ member: string; code: string; total: string }>(
    sql`select p.legacy_id as member, t.code as code, sum(pe.points)::text as total
        from point_entry pe
        join person p on p.id = pe.person_id
        join term t on t.id = pe.term_id
        where pe.legacy_id is not null
        group by p.legacy_id, t.code`,
  );
  const targetByPair = new Map(
    targetSums.rows.map((row) => [`${row.member}:${row.code}`, Number.parseInt(row.total, 10)]),
  );
  let equalPairs = 0;
  for (const [key, total] of sourceSums) {
    if (targetByPair.get(key) === total) {
      equalPairs += 1;
    }
  }

  // Asistencias aprobadas de actividades con puntos con exactamente una entrada CHECKIN viva.
  const pointsByActivity = new Map(
    legacy.activities.map((item) => [item.id, item.individualPoints]),
  );
  const approvedWithPoints = legacy.attendances.filter(
    (item) => item.status === "APPROVED" && (pointsByActivity.get(item.activityId) ?? 0) > 0,
  ).length;

  const expectedAliases = [
    ...legacy.assemblies.map((item) => `/asamblea/${item.publicId}`),
    ...legacy.assemblyPublicIds.map((item) => `/asamblea/${item.publicId}`),
    ...legacy.activityPublicIds.map((item) => `/a/${item.publicId}`),
  ].filter((path) => isPublicId(path.slice(path.lastIndexOf("/") + 1)));
  const uniqueAliases = [...new Set(expectedAliases)];

  const rows: VerificationRow[] = [
    {
      name: "Activity → occasion (legacyId)",
      source: legacy.activities.length,
      target: await count(
        sql`select count(*)::text as n from occasion where kind = 'ACTIVITY' and legacy_id is not null`,
      ),
    },
    {
      name: "Assembly → occasion (legacyId)",
      source: legacy.assemblies.length,
      target: await count(
        sql`select count(*)::text as n from occasion where kind = 'ASSEMBLY' and legacy_id is not null`,
      ),
    },
    {
      name: "Attendance → check_in",
      source: legacy.attendances.length,
      target: await count(
        sql`select count(*)::text as n from check_in ci join occasion o on o.id = ci.occasion_id where ci.legacy_id is not null and o.kind = 'ACTIVITY'`,
      ),
    },
    {
      name: "AssemblyAttendance → check_in",
      source: legacy.assemblyAttendances.length,
      target: await count(
        sql`select count(*)::text as n from check_in ci join occasion o on o.id = ci.occasion_id where ci.legacy_id is not null and o.kind = 'ASSEMBLY'`,
      ),
    },
    {
      name: "PointTransaction → point_entry",
      source: legacy.pointTransactions.length,
      target: await count(
        sql`select count(*)::text as n from point_entry where legacy_id is not null`,
      ),
    },
    {
      name: "Pares (miembro, temporada) con SUM(points) idéntica",
      source: sourceSums.size,
      target: equalPairs,
    },
    {
      name: "Attendance APPROVED con puntos → una CHECKIN viva",
      source: approvedWithPoints,
      target: await count(
        sql`select count(*)::text as n
            from check_in ci
            join occasion o on o.id = ci.occasion_id
            where ci.legacy_id is not null and ci.status = 'APPROVED' and o.kind = 'ACTIVITY' and o.points > 0
              and (select count(*) from point_entry pe
                   where pe.check_in_id = ci.id and pe.kind = 'CHECKIN'
                     and not exists (select 1 from point_entry r where r.reversal_of_id = pe.id)) = 1`,
      ),
    },
    {
      name: "Alias (/asamblea y publicId retirados)",
      source: uniqueAliases.length,
      target:
        uniqueAliases.length === 0
          ? 0
          : await count(
              sql`select count(*)::text as n from legacy_alias where path in (${sql.join(
                uniqueAliases.map((path) => sql`${path}`),
                sql`, `,
              )})`,
            ),
    },
  ];

  // Advertencias: ediciones sin mapa, reversiones sin original y la tasa cruda de los scores congelados.
  const withEdition = legacy.activities.filter((item) => item.eventEditionId).length;
  if (withEdition > 0) {
    warnings.push(`${withEdition} actividades tenían edición en GHPOINTS y quedaron sin edición`);
  }
  const orphanReversals = await count(
    sql`select count(*)::text as n from point_entry where legacy_type = 'REVERSAL' and kind = 'LEGACY'`,
  );
  if (orphanReversals > 0) {
    warnings.push(`${orphanReversals} reversiones quedaron como LEGACY (sin original o repetidas)`);
  }
  if (legacy.frozenScores.length > 0) {
    const scores = await db.execute<{
      activity: string;
      committee: string;
      rate: string;
      eligible: string;
    }>(
      sql`select o.legacy_id as activity, c.legacy_id as committee, cp.rate::text as rate, cp.eligible::text as eligible
          from committee_participation cp
          join occasion o on o.id = cp.occasion_id
          join committee c on c.id = cp.committee_id
          where o.legacy_id is not null and c.legacy_id is not null`,
    );
    const byKey = new Map(scores.rows.map((row) => [`${row.activity}:${row.committee}`, row]));
    let pending = 0;
    const differences: string[] = [];
    for (const item of legacy.frozenScores) {
      const target = byKey.get(`${item.activityId}:${item.committeeId}`);
      if (!target) {
        pending += 1;
        continue;
      }
      const sourceRate = Number.parseFloat(item.participationRate);
      const targetRate = Number.parseFloat(target.rate);
      if (Math.abs(sourceRate - targetRate) > RATE_TOLERANCE) {
        differences.push(
          `${item.activityId}/${item.committeeId}: ${sourceRate.toFixed(4)} (${item.eligibleMemberCount} elegibles) frente a ${targetRate.toFixed(4)} (${target.eligible})`,
        );
      }
    }
    if (pending > 0) {
      warnings.push(
        `${pending} scores congelados sin recompute todavía (el outbox no ha corrido para esas ocasiones)`,
      );
    }
    if (differences.length > 0) {
      warnings.push(
        `${differences.length} scores congelados con tasa cruda distinta: ${differences.slice(0, 5).join("; ")}`,
      );
    }
  }
  return { rows, warnings };
}
