import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type Executor, runCommand } from "@/db/tx";
import {
  getEventRef,
  getMacroeventEdition,
  isMacroeventSlug,
  listEditionRefs,
  macroeventRoleCodes,
} from "@/modules/events";
import { t } from "@/shared/copy";
import { APP_TIME_ZONE, dateKeyIn } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  appointment,
  appointmentElectionRecord,
  macroeventReactivation,
  macroeventReview,
  membership,
  person,
} from "../schema";
import {
  type ElectionRecord,
  electionRecordSchema,
  electionRecordValid,
  macroeventViability,
  type ReactivationInput,
  reactivationInputSchema,
  reactivationValid,
} from "./macroevent-governance-pure";
import { lockMacroeventGovernance } from "./macroevent-lock";

const today = () => dateKeyIn(APP_TIME_ZONE, new Date());
const yearSchema = z.number().int().min(2026).max(2100);
async function requireMacroevent(eventId: string, exec: Executor) {
  const event = await getEventRef(eventId, exec);
  if (!event || !isMacroeventSlug(event.slug)) throw new DomainError(t("T-2353"));
  return event;
}

/** Mesa anual: Inventiva puede tener dos ediciones, pero cada cargo se cuenta una sola vez. */
async function annualBoard(eventId: string, year: number, exec: Executor) {
  const rows = await exec
    .select({
      id: appointment.id,
      editionId: appointment.editionId,
      roleCode: appointment.roleCode,
      fullName: person.fullName,
      origin: appointmentElectionRecord.origin,
      evidence: appointmentElectionRecord.evidence,
    })
    .from(appointment)
    .innerJoin(person, eq(person.id, appointment.personId))
    .leftJoin(
      appointmentElectionRecord,
      eq(appointmentElectionRecord.appointmentId, appointment.id),
    )
    .where(eq(appointment.kind, "MACROEVENT_DIRECTOR"));
  const editions = await listEditionRefs(
    [...new Set(rows.flatMap((row) => (row.editionId ? [row.editionId] : [])))],
    exec,
  );
  return rows.flatMap((row) => {
    const pair = rows
      .filter((item) => item.editionId === row.editionId && item.roleCode === row.roleCode)
      .map((item) => item.id)
      .sort();
    const verified = JSON.stringify(pair) === JSON.stringify(row.evidence?.appointmentIds);
    const edition = row.editionId ? editions.get(row.editionId) : undefined;
    return edition?.eventId === eventId &&
      Number(dateKeyIn(APP_TIME_ZONE, edition.startsAt).slice(0, 4)) === year &&
      row.roleCode
      ? [
          {
            ...row,
            origin: verified ? row.origin : null,
            roleCode: row.roleCode,
            editionName: edition.name,
          },
        ]
      : [];
  });
}

export async function getMacroeventGovernance(eventId: string, year: number) {
  yearSchema.parse(year);
  const exec = getDb();
  const event = await requireMacroevent(eventId, exec);
  const board = await annualBoard(eventId, year, exec);
  const reviews = await exec
    .select()
    .from(macroeventReview)
    .where(eq(macroeventReview.eventId, eventId))
    .orderBy(desc(macroeventReview.year));
  const proposals = await exec
    .select()
    .from(macroeventReactivation)
    .where(eq(macroeventReactivation.eventId, eventId))
    .orderBy(desc(macroeventReactivation.createdAt));
  const review = reviews.find((row) => row.year === year) ?? null;
  const preceding = reviews.find((row) => row.year < year);
  const approved = proposals.some((row) => row.year === year && row.status === "APPROVED");
  return {
    board,
    reviews,
    proposals,
    review,
    viability: macroeventViability(event.slug, board, macroeventRoleCodes(event.slug)),
    status: review?.status ?? (preceding?.status === "DISABLED" && !approved ? "DISABLED" : null),
    approved,
  };
}

export function recordMacroeventElectionAs(
  actor: Actor,
  eventId: string,
  appointmentId: string,
  raw: ElectionRecord,
) {
  return runCommand(actor, async (ctx) => {
    const input = electionRecordSchema.parse(raw);
    const event = await requireMacroevent(eventId, ctx.tx);
    await lockMacroeventGovernance(ctx.tx, eventId);
    const [row] = await ctx.tx
      .select()
      .from(appointment)
      .where(eq(appointment.id, appointmentId))
      .for("update");
    const edition = row?.editionId ? await getMacroeventEdition(row.editionId, ctx.tx) : null;
    if (!row?.roleCode || edition?.eventId !== eventId) throw new DomainError(t("T-2353"));
    if (!electionRecordValid(event.slug, row.roleCode, input)) throw new DomainError(t("T-4802"));
    const [before] = await ctx.tx
      .select()
      .from(appointmentElectionRecord)
      .where(eq(appointmentElectionRecord.appointmentId, appointmentId));
    const pair = await ctx.tx
      .select({ id: appointment.id })
      .from(appointment)
      .where(and(eq(appointment.editionId, edition.id), eq(appointment.roleCode, row.roleCode)));
    const after = {
      appointmentId,
      origin: input.origin,
      evidence: { ...input, appointmentIds: pair.map((item) => item.id).sort() },
      reviewedBy: actor.personId,
      reviewedAt: new Date(),
    };
    await ctx.tx
      .insert(appointmentElectionRecord)
      .values(after)
      .onConflictDoUpdate({ target: appointmentElectionRecord.appointmentId, set: after });
    await ctx.audit({
      action: "macroevent.election_recorded",
      entityType: "appointment",
      entityId: appointmentId,
      before,
      after,
    });
  });
}

export function reviewMacroeventAs(
  actor: Actor,
  raw: {
    eventId: string;
    year: number;
    assemblyOn: string;
    minutes: string;
    afterElections: boolean;
  },
) {
  return runCommand(actor, async (ctx) => {
    const input = z
      .object({
        eventId: z.string().min(1),
        year: yearSchema,
        assemblyOn: z.iso.date(),
        minutes: z.string().trim().min(5).max(2000),
        afterElections: z.literal(true),
      })
      .parse(raw);
    const event = await requireMacroevent(input.eventId, ctx.tx);
    await lockMacroeventGovernance(ctx.tx, event.id);
    if (input.assemblyOn > today() || Number(input.assemblyOn.slice(0, 4)) !== input.year)
      throw new DomainError(t("T-4803"));
    const [previous] = await ctx.tx
      .select()
      .from(macroeventReview)
      .where(
        and(eq(macroeventReview.eventId, event.id), lte(macroeventReview.year, input.year - 1)),
      )
      .orderBy(desc(macroeventReview.year))
      .limit(1);
    if (previous?.status === "DISABLED") {
      const [approved] = await ctx.tx
        .select({ id: macroeventReactivation.id })
        .from(macroeventReactivation)
        .where(
          and(
            eq(macroeventReactivation.eventId, event.id),
            eq(macroeventReactivation.year, input.year),
            eq(macroeventReactivation.status, "APPROVED"),
          ),
        );
      if (!approved) throw new DomainError(t("T-4855"));
    }
    const board = await annualBoard(event.id, input.year, ctx.tx);
    const viability = macroeventViability(event.slug, board, macroeventRoleCodes(event.slug));
    if (viability.unverified) throw new DomainError(t("T-4804"));
    const [before] = await ctx.tx
      .select()
      .from(macroeventReview)
      .where(and(eq(macroeventReview.eventId, event.id), eq(macroeventReview.year, input.year)));
    // Un corte ya registrado conserva su mesa; corregirlo requiere una decisión nueva documentada.
    if (before) throw new DomainError(t("T-4805"));
    const [row] = await ctx.tx
      .insert(macroeventReview)
      .values({
        eventId: event.id,
        year: input.year,
        assemblyOn: input.assemblyOn,
        minutes: input.minutes,
        electedRoles: viability.elected,
        status: viability.status,
        reviewedBy: actor.personId,
      })
      .returning();
    if (!row) throw new Error("No se pudo registrar el corte del macroevento");
    await ctx.audit({
      action: "macroevent.reviewed",
      entityType: "macroevent_review",
      entityId: row.id,
      after: row,
    });
    return row;
  });
}

export function proposeMacroeventReactivationAs(actor: Actor, raw: ReactivationInput) {
  return runCommand(actor, async (ctx) => {
    const input = reactivationInputSchema.parse(raw);
    const event = await requireMacroevent(input.eventId, ctx.tx);
    await lockMacroeventGovernance(ctx.tx, event.id);
    if (!reactivationValid(macroeventRoleCodes(event.slug), input, today()))
      throw new DomainError(t("T-4806"));
    const [review] = await ctx.tx
      .select()
      .from(macroeventReview)
      .where(
        and(eq(macroeventReview.eventId, event.id), lte(macroeventReview.year, input.year - 1)),
      )
      .orderBy(desc(macroeventReview.year))
      .limit(1);
    if (review?.status !== "DISABLED" || review.assemblyOn > input.submittedOn)
      throw new DomainError(t("T-4807"));
    const [existing] = await ctx.tx
      .select({ id: macroeventReactivation.id })
      .from(macroeventReactivation)
      .where(
        and(
          eq(macroeventReactivation.eventId, event.id),
          eq(macroeventReactivation.year, input.year),
          inArray(macroeventReactivation.status, ["PENDING", "APPROVED"]),
        ),
      );
    if (existing) throw new DomainError(t("T-4808"));
    const members = await ctx.tx
      .select({ personId: membership.personId })
      .from(membership)
      .where(
        and(
          eq(membership.status, "ACTIVE"),
          inArray(
            membership.personId,
            input.roster.map((row) => row.personId),
          ),
        ),
      );
    if (input.roster.some((row) => !members.some((member) => member.personId === row.personId)))
      throw new DomainError(t("T-4809"));
    const [row] = await ctx.tx
      .insert(macroeventReactivation)
      .values({ ...input, recordedBy: actor.personId })
      .returning();
    if (!row) throw new Error("No se pudo registrar la propuesta");
    await ctx.audit({
      action: "macroevent.reactivation_proposed",
      entityType: "macroevent_reactivation",
      entityId: row.id,
      after: row,
    });
    return row;
  });
}

export function decideMacroeventReactivationAs(
  actor: Actor,
  raw: {
    eventId: string;
    proposalId: string;
    approved: boolean;
    decisionMinutes: string;
    assemblyNotice: string;
  },
) {
  return runCommand(actor, async (ctx) => {
    const input = z
      .object({
        eventId: z.string().min(1),
        proposalId: z.string().min(1),
        approved: z.boolean(),
        decisionMinutes: z.string().trim().min(5).max(2000),
        assemblyNotice: z.string().trim().min(5).max(2000),
      })
      .parse(raw);
    await lockMacroeventGovernance(ctx.tx, input.eventId);
    const [before] = await ctx.tx
      .select()
      .from(macroeventReactivation)
      .where(
        and(
          eq(macroeventReactivation.id, input.proposalId),
          eq(macroeventReactivation.eventId, input.eventId),
        ),
      )
      .for("update");
    if (!before || before.status !== "PENDING") throw new DomainError(t("T-4808"));
    if (input.approved) {
      const members = await ctx.tx
        .select({ personId: membership.personId })
        .from(membership)
        .where(
          and(
            eq(membership.status, "ACTIVE"),
            inArray(
              membership.personId,
              before.roster.map((row) => row.personId),
            ),
          ),
        );
      if (before.roster.some((row) => !members.some((member) => member.personId === row.personId)))
        throw new DomainError(t("T-4809"));
    }
    const after = {
      status: input.approved ? ("APPROVED" as const) : ("REJECTED" as const),
      decisionMinutes: input.decisionMinutes,
      assemblyNotice: input.assemblyNotice,
      decidedAt: new Date(),
      decidedBy: actor.personId,
    };
    await ctx.tx
      .update(macroeventReactivation)
      .set(after)
      .where(eq(macroeventReactivation.id, before.id));
    await ctx.audit({
      action: "macroevent.reactivation_decided",
      entityType: "macroevent_reactivation",
      entityId: before.id,
      before,
      after,
    });
  });
}
