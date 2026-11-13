import { and, count, desc, eq, gte, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Actor, runCommand } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { committeeMembersAmong, getPeopleByIds, socialVisibleIds } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { atHourIn } from "@/shared/lib/dates-pure";
import { DomainError } from "@/shared/lib/errors";
import { applause } from "../schema";
import { dayKeyFor, GAMIFICATION_TIMEZONE } from "./gamification-pure";

// Aplausos entre miembros de un comité (ADR-176): un mensaje corto a alguien del mismo comité en el
// semestre, hasta cinco al día. Quien lo recibe siempre lo ve; en el muro solo sale si los dos tienen
// la actividad prendida (ADR-175).

export const APPLAUSE_MAX = 140;
export const APPLAUSE_PER_DAY = 5;

export interface ApplauseView {
  id: string;
  fromPersonId: string;
  fromName: string;
  toPersonId: string;
  toName: string;
  committeeId: string;
  message: string;
  createdAt: Date;
}

export function giveApplauseAs(
  actor: Actor,
  input: { toPersonId: string; committeeId: string; message: string },
  now = new Date(),
): Promise<{ id: string }> {
  return runCommand(actor, async (ctx) => {
    const fromPersonId = ctx.actor.personId;
    if (!fromPersonId) throw new DomainError(t("T-032"));
    const message = input.message.trim();
    if (message.length < 2 || message.length > APPLAUSE_MAX) {
      throw new DomainError(t("T-4968", { n: APPLAUSE_MAX }), "message");
    }
    if (input.toPersonId === fromPersonId) throw new DomainError(t("T-4969"), "toPersonId");
    const term = await getCurrentTerm(now);
    if (!term) throw new DomainError(t("T-548"));
    const members = await committeeMembersAmong(input.committeeId, term.id, [
      fromPersonId,
      input.toPersonId,
    ]);
    if (!members.has(fromPersonId) || !members.has(input.toPersonId)) {
      throw new DomainError(t("T-4969"), "toPersonId");
    }
    const startOfDay = atHourIn(GAMIFICATION_TIMEZONE, dayKeyFor(now), 0);
    const [today] = await ctx.tx
      .select({ n: count() })
      .from(applause)
      .where(and(eq(applause.fromPersonId, fromPersonId), gte(applause.createdAt, startOfDay)));
    if ((today?.n ?? 0) >= APPLAUSE_PER_DAY) {
      throw new DomainError(t("T-4970", { n: APPLAUSE_PER_DAY }));
    }
    const [row] = await ctx.tx
      .insert(applause)
      .values({
        fromPersonId,
        toPersonId: input.toPersonId,
        committeeId: input.committeeId,
        termId: term.id,
        message,
      })
      .returning({ id: applause.id });
    if (!row) throw new Error("No se pudo guardar el aplauso");
    await ctx.audit({
      action: "applause.given",
      entityType: "applause",
      entityId: row.id,
      after: { toPersonId: input.toPersonId, committeeId: input.committeeId },
    });
    const [title, body] = [t("T-4971"), message];
    await ctx.emit(
      eventOf(notificationRequested, {
        kind: "ANNOUNCEMENT",
        recipients: [{ personId: input.toPersonId, url: "/app/yo" }],
        title,
        body,
        url: "/app/yo",
        tag: `aplauso-${row.id}`,
        dedupeKey: `aplauso:${row.id}`,
      }),
    );
    return row;
  });
}

/** Quien aplaudió borra su aplauso (ADR-176 regla 4). */
export function deleteApplauseAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, async (ctx) => {
    const personId = ctx.actor.personId;
    if (!personId) throw new DomainError(t("T-032"));
    const [row] = await ctx.tx
      .delete(applause)
      .where(and(eq(applause.id, id), eq(applause.fromPersonId, personId)))
      .returning({ id: applause.id });
    if (!row) throw new DomainError(t("T-032"));
    await ctx.audit({ action: "applause.deleted", entityType: "applause", entityId: id });
  });
}

async function withNames(
  rows: Array<Omit<ApplauseView, "fromName" | "toName">>,
): Promise<ApplauseView[]> {
  const people = await getPeopleByIds(rows.flatMap((row) => [row.fromPersonId, row.toPersonId]));
  return rows.map((row) => ({
    ...row,
    fromName: people.get(row.fromPersonId)?.fullName?.trim() ?? "",
    toName: people.get(row.toPersonId)?.fullName?.trim() ?? "",
  }));
}

const columns = {
  id: applause.id,
  fromPersonId: applause.fromPersonId,
  toPersonId: applause.toPersonId,
  committeeId: applause.committeeId,
  message: applause.message,
  createdAt: applause.createdAt,
};

/** Los aplausos que recibió la persona, del más reciente: los ve siempre, tenga o no la actividad. */
export async function listApplauseReceived(personId: string, limit = 20): Promise<ApplauseView[]> {
  return withNames(
    await getDb()
      .select(columns)
      .from(applause)
      .where(eq(applause.toPersonId, personId))
      .orderBy(desc(applause.createdAt))
      .limit(limit),
  );
}

/** Los aplausos del muro de un comité: solo entre personas con la actividad prendida. */
export async function listCommitteeApplause(
  committeeId: string,
  termId: string,
  limit = 30,
): Promise<ApplauseView[]> {
  const rows = await getDb()
    .select(columns)
    .from(applause)
    .where(and(eq(applause.committeeId, committeeId), eq(applause.termId, termId)))
    .orderBy(desc(applause.createdAt))
    .limit(limit * 3);
  const visible = await socialVisibleIds(rows.flatMap((row) => [row.fromPersonId, row.toPersonId]));
  return withNames(
    rows
      .filter((row) => visible.has(row.fromPersonId) && visible.has(row.toPersonId))
      .slice(0, limit),
  );
}

/** Al anonimizar a la persona se borran los aplausos que dio y recibió (ADR-176 regla 4). */
export async function deleteApplauseFor(personId: string): Promise<number> {
  const rows = await getDb()
    .delete(applause)
    .where(or(eq(applause.fromPersonId, personId), eq(applause.toPersonId, personId)))
    .returning({ id: applause.id });
  return rows.length;
}
