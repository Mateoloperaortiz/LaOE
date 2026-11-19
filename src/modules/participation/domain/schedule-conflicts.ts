import { createHash } from "node:crypto";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type Executor, runCommand } from "@/db/tx";
import { getMacroeventEdition, isMacroeventSlug } from "@/modules/events";
import {
  canParticipate,
  getMembershipRef,
  getPeopleByIds,
  listBoardEventsBetween,
  listMyCommitteeCapabilities,
  listMyMacroeventSeats,
  lockMembershipCycles,
  notifyApproval,
  requireApprovalAuthority,
  seatDeciders,
  seatsDecidedBy,
} from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { APP_TIME_ZONE, addDays, atHourIn, calendarOverlap } from "@/shared/lib/dates-pure";
import { DomainError } from "@/shared/lib/errors";
import { occasion, scheduleConflict } from "../schema";

const path = "/app/coordinacion";
type Seat = "VP_ADMIN" | "VP_GH";
type Activity = {
  ref: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  group: string | null;
  macro: string | null;
};
async function scopeFor(personId: string, exec: Executor, now: Date) {
  const [term, member] = await Promise.all([
    getCurrentTerm(now, exec),
    getMembershipRef(personId, exec),
  ]);
  if (!term || !canParticipate(member?.status))
    return { termId: null, board: false, seats: [] as Seat[], groups: new Set<string>() };
  const [committees, macros, seats] = await Promise.all([
    listMyCommitteeCapabilities(personId, term.id, exec),
    listMyMacroeventSeats(personId, term.id, exec),
    seatsDecidedBy(personId, term.id, exec),
  ]);
  return {
    termId: term.id,
    board: seats.length > 0,
    seats: seats.flatMap(({ seat }) => (seat === "VP_ADMIN" || seat === "VP_GH" ? [seat] : [])),
    groups: new Set([
      ...committees.map((r) => "c:" + r.committee.id),
      ...macros.map((r) => "m:" + r.editionId),
    ]),
  };
}

async function activities(from: Date, to: Date, scope: Scope, exec: Executor): Promise<Activity[]> {
  const [rows, meetings] = await Promise.all([
    exec
      .select({
        id: occasion.id,
        title: occasion.title,
        startsAt: occasion.startsAt,
        endsAt: occasion.endsAt,
        committee: occasion.committeeId,
        edition: occasion.editionId,
        status: occasion.status,
      })
      .from(occasion)
      .where(
        and(
          ne(occasion.status, "CANCELLED"),
          lt(occasion.startsAt, to),
          or(gte(occasion.startsAt, from), gt(occasion.endsAt, from)),
        ),
      )
      .orderBy(asc(occasion.startsAt)),
    scope.board ? listBoardEventsBetween(from, to, exec) : [],
  ]);
  const editions = new Map(
    await Promise.all(
      [...new Set(rows.flatMap((r) => (r.edition ? [r.edition] : [])))].map(async (id) => {
        const slug = (await getMacroeventEdition(id, exec))?.eventSlug;
        return [id, slug && isMacroeventSlug(slug) ? slug : null] as const;
      }),
    ),
  );
  return [
    ...rows
      .filter(
        (row) =>
          scope.board ||
          row.status !== "DRAFT" ||
          Boolean(row.edition && editions.get(row.edition)) ||
          Boolean(row.committee && scope.groups.has("c:" + row.committee)),
      )
      .map((row) => {
        const slug = row.edition ? editions.get(row.edition) : undefined;
        return {
          ref: "o:" + row.id,
          title: row.title,
          startsAt: row.startsAt,
          endsAt: row.endsAt ?? row.startsAt,
          group: row.edition ? "m:" + row.edition : row.committee ? "c:" + row.committee : null,
          macro: slug ?? null,
        };
      }),
    ...meetings
      .filter((r) => !r.allDay)
      .map((r) => ({
        ref: "j:" + r.id,
        title: r.title,
        startsAt: r.startsAt,
        endsAt: r.endsAt,
        group: null,
        macro: null,
      })),
  ].sort((a, b) => +a.startsAt - +b.startsAt || a.ref.localeCompare(b.ref));
}

type Scope = Awaited<ReturnType<typeof scopeFor>>;
async function pairsFor(scope: Scope, day: string, exec: Executor, now: Date) {
  const pairs = [];
  if (!scope.board && !scope.groups.size) return [];
  const from = atHourIn(APP_TIME_ZONE, z.iso.date().parse(day), 0);
  const items = await activities(from, atHourIn(APP_TIME_ZONE, addDays(day, 7), 0), scope, exec);
  for (const [index, a] of items.entries()) {
    for (let j = index + 1; j < items.length; j++) {
      const b = items[j];
      if (!b || !calendarOverlap(a, b)) break;
      const endsAt = new Date(Math.min(+a.endsAt, +b.endsAt));
      if (
        endsAt < now ||
        (!scope.board &&
          !(a.group && scope.groups.has(a.group)) &&
          !(b.group && scope.groups.has(b.group)))
      )
        continue;
      const [first, second] = a.ref < b.ref ? [a, b] : [b, a];
      const signature = [first, second].map((r) => [
        r.ref,
        r.startsAt.toISOString(),
        r.endsAt.toISOString(),
      ]);
      const pairKey = createHash("sha256").update(JSON.stringify(signature)).digest("hex");
      const seat: Seat =
        first.macro && second.macro && first.macro !== second.macro ? "VP_GH" : "VP_ADMIN";
      // Cada posición identifica a la dirección involucrada. Las reuniones de la Junta son privadas.
      const scopeKeys =
        first.ref.startsWith("j:") || second.ref.startsWith("j:")
          ? []
          : [first.group ?? "public", second.group ?? "public"];
      pairs.push({
        pairKey,
        firstRef: first.ref,
        secondRef: second.ref,
        firstTitle: first.title,
        secondTitle: second.title,
        scopeKeys,
        seat,
        startsAt: b.startsAt,
        endsAt,
      });
    }
  }
  return pairs;
}

function visibleTitles(
  row: { scopeKeys: string[]; firstTitle: string; secondTitle: string },
  scope: Scope,
) {
  function titleFor(title: string, group: string | undefined) {
    return group?.startsWith("c:") && !scope.board && !scope.groups.has(group)
      ? tList("T-5195")[12]
      : title;
  }
  return {
    firstTitle: titleFor(row.firstTitle, row.scopeKeys[0]),
    secondTitle: titleFor(row.secondTitle, row.scopeKeys[1]),
  };
}

export async function weeklyScheduleConflicts(personId: string, day: string, now = new Date()) {
  const exec = getDb();
  const scope = await scopeFor(personId, exec, now);
  return (await pairsFor(scope, day, exec, now)).map((row) => ({
    ...row,
    ...visibleTitles(row, scope),
  }));
}

export function reportConflictAs(
  actor: Actor,
  raw: { day: string; pairKey: string; attempts: string },
  now = new Date(),
) {
  const input = z
    .object({
      day: z.iso.date(),
      pairKey: z.string().length(64),
      attempts: z.string().trim().min(3).max(2000),
    })
    .parse(raw);
  return runCommand(actor, async (ctx) => {
    if (!actor.personId) throw new DomainError(t("T-5198"));
    await lockMembershipCycles(ctx.tx, [actor.personId]);
    const scope = await scopeFor(actor.personId, ctx.tx, now);
    const pair = (await pairsFor(scope, input.day, ctx.tx, now)).find(
      (r) => r.pairKey === input.pairKey,
    );
    if (!pair || !scope.termId) throw new DomainError(t("T-5198"));
    const [row] = await ctx.tx
      .insert(scheduleConflict)
      .values({ ...pair, requesterId: actor.personId, attempts: input.attempts, requestedAt: now })
      .onConflictDoNothing({ target: scheduleConflict.pairKey })
      .returning({ id: scheduleConflict.id });
    if (!row) {
      const [existing] = await ctx.tx
        .select({ id: scheduleConflict.id })
        .from(scheduleConflict)
        .where(eq(scheduleConflict.pairKey, pair.pairKey));
      if (!existing) throw new DomainError(t("T-5198"));
      return existing.id;
    }
    await ctx.audit({
      action: "schedule.conflict-reported",
      entityType: "schedule_conflict",
      entityId: row.id,
      after: { first: pair.firstRef, second: pair.secondRef, seat: pair.seat },
    });
    await notifyApproval(ctx, await seatDeciders(pair.seat, scope.termId, ctx.tx), {
      title: tList("T-5201")[0],
      body: pair.firstTitle + " · " + pair.secondTitle,
      url: path + "#" + row.id,
      dedupeKey: "cruce-enviado:" + row.id,
    });
    return row.id;
  });
}

export function resolveConflictAs(actor: Actor, id: string, raw: string, now = new Date()) {
  const note = z.string().trim().min(3).max(2000).parse(raw);
  return runCommand(actor, async (ctx) => {
    const [row] = await ctx.tx
      .select()
      .from(scheduleConflict)
      .where(eq(scheduleConflict.id, id))
      .for("update");
    if (!row) throw new DomainError(t("T-032"));
    const as = await requireApprovalAuthority(ctx, row.seat, now);
    if (row.resolvedAt) {
      if (row.resolvedById === actor.personId && row.resolution === note) return;
      throw new DomainError(t("T-5169"));
    }
    await ctx.tx
      .update(scheduleConflict)
      .set({ resolvedAt: now, resolvedAs: as, resolvedById: actor.personId, resolution: note })
      .where(eq(scheduleConflict.id, id));
    await ctx.audit({
      action: "schedule.conflict-resolved",
      entityType: "schedule_conflict",
      entityId: id,
      after: { seat: row.seat, as, resolution: note },
    });
    await notifyApproval(ctx, [row.requesterId], {
      title: tList("T-5201")[1],
      body: note,
      url: path + "#" + id,
      dedupeKey: "cruce-resuelto:" + id,
    });
  });
}

export async function reportedConflictsFor(
  personId: string,
  pendingOnly = false,
  now = new Date(),
) {
  const exec = getDb();
  const scope = await scopeFor(personId, exec, now);
  const groups = [...scope.groups];
  const involved = groups.length
    ? sql`${scheduleConflict.scopeKeys} ?| array[${sql.join(
        groups.map((g) => sql`${g}`),
        sql`, `,
      )}]::text[]`
    : undefined;
  const mine = scope.seats.length ? inArray(scheduleConflict.seat, scope.seats) : undefined;
  if (pendingOnly && !mine) return [];
  const rows = await exec
    .select()
    .from(scheduleConflict)
    .where(
      and(
        pendingOnly ? mine : or(eq(scheduleConflict.requesterId, personId), mine, involved),
        pendingOnly ? isNull(scheduleConflict.resolvedAt) : undefined,
      ),
    )
    .orderBy(desc(scheduleConflict.requestedAt));
  const people = await getPeopleByIds([
    ...new Set(
      rows.flatMap((r) => (r.resolvedById ? [r.requesterId, r.resolvedById] : [r.requesterId])),
    ),
  ]);
  return rows.map((r) => ({
    ...r,
    ...visibleTitles(r, scope),
    canResolve: scope.seats.includes(r.seat),
    requesterName: people.get(r.requesterId)?.fullName,
    resolvedByName: people.get(r.resolvedById ?? "")?.fullName,
  }));
}
