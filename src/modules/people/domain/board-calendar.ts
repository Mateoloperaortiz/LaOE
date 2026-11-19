import { and, asc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  type Actor,
  type CommandContext,
  type Executor,
  enqueueEvent,
  runCommand,
  SYSTEM_ACTOR,
} from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { boardCalendarPush } from "@/domain-events/people";
import { getCurrentTerm } from "@/modules/terms";
import {
  deleteCalendarEvent,
  GoogleCalendarError,
  insertCalendarEvent,
  isGoogleCalendarConfigured,
  listCalendarEvents,
  patchCalendarEvent,
} from "@/shared/adapters/google-calendar";
import { t, tList } from "@/shared/copy";
import { bogotaInputToUtc } from "@/shared/lib/dates";
import { LOCAL_INPUT } from "@/shared/lib/dates-pure";
import { DomainError } from "@/shared/lib/errors";
import { boardCalendarEvent, boardCalendarSync } from "../schema";
import {
  BOARD_CALENDAR_AREAS,
  type BoardCalendarArea,
  CASA_ID_PROPERTY,
  contentFromGoogle,
  googleBodyFor,
  sameContent,
} from "./board-calendar-pure";
import { type BoardSeat, currentSeatAuthority, seatsDecidedBy } from "./board-seats";

// El calendario de la junta (ADR-197 regla 6): las reuniones de la junta y las fechas clave que
// registra cada cargo. Quien tiene un cargo de la junta agenda por su área o por la junta en pleno; lo
// edita quien lo agregó o quien decide por esa área. Se sincroniza en los dos sentidos con el Google
// Calendar de la junta: lo de la casa se escribe allá al instante (un trabajo del outbox) y lo de allá
// se lee cada pocos minutos (un programado). Cada evento se edita donde nació, y en la siguiente
// lectura gana ese lado.

export type BoardEventRow = typeof boardCalendarEvent.$inferSelect;

const SYNC_ID = "JUNTA";
/** Lo que la casa lee de Google: un mes atrás y un año adelante. */
const PULL_BACK_DAYS = 30;
const PULL_AHEAD_DAYS = 400;
/** Un margen por si los relojes de Google y de la casa no coinciden del todo. */
const PULL_OVERLAP_MS = 2 * 60 * 1000;

const guard = (index: number) => tList("T-5120")[index] ?? "";

export const boardEventInputSchema = z.object({
  title: z.string().trim().min(2).max(200),
  area: z.enum(BOARD_CALENDAR_AREAS),
  startsAt: z.string().regex(LOCAL_INPUT),
  endsAt: z.string().regex(LOCAL_INPUT),
  location: z.string().trim().max(300).default(""),
  description: z.string().trim().max(4000).default(""),
});

export type BoardEventInput = z.input<typeof boardEventInputSchema>;

/** El cargo que decide por un área: la junta en pleno la convoca la Presidencia. */
function seatOf(area: BoardCalendarArea): BoardSeat {
  return area === "BOARD" ? "PRESIDENT" : area;
}

function parse(raw: BoardEventInput) {
  const input = boardEventInputSchema.parse(raw);
  const startsAt = bogotaInputToUtc(input.startsAt);
  const endsAt = bogotaInputToUtc(input.endsAt);
  if (endsAt <= startsAt) {
    throw new DomainError(guard(4), "endsAt");
  }
  return { ...input, startsAt, endsAt };
}

async function queuePush(ctx: CommandContext, id: string) {
  await ctx.emit(eventOf(boardCalendarPush, { eventId: id }));
}

/** Agenda quien tiene un cargo de la junta este semestre, por su área o por la junta en pleno. */
export async function createBoardEvent(
  ctx: CommandContext,
  raw: BoardEventInput,
): Promise<{ id: string }> {
  const input = parse(raw);
  const term = await getCurrentTerm();
  const seats =
    ctx.actor.personId && term ? await seatsDecidedBy(ctx.actor.personId, term.id, ctx.tx) : [];
  if (seats.length === 0) {
    throw new DomainError(guard(0));
  }
  if (input.area !== "BOARD" && !seats.some((item) => item.seat === input.area)) {
    throw new DomainError(guard(1), "area");
  }
  const values = {
    title: input.title,
    area: input.area,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    allDay: false,
    location: input.location,
    description: input.description,
    origin: "CASA" as const,
    createdById: ctx.actor.personId,
  };
  const [row] = await ctx.tx
    .insert(boardCalendarEvent)
    .values(values)
    .returning({ id: boardCalendarEvent.id });
  if (!row) throw new Error("No se pudo agendar");
  await ctx.audit({
    action: "board-calendar.created",
    entityType: "board_calendar_event",
    entityId: row.id,
    after: values,
  });
  await queuePush(ctx, row.id);
  return row;
}

/** Lo que nació en la casa lo edita quien lo agregó o quien decide por su área. */
async function editable(ctx: CommandContext, id: string): Promise<BoardEventRow> {
  const [row] = await ctx.tx
    .select()
    .from(boardCalendarEvent)
    .where(eq(boardCalendarEvent.id, id))
    .for("update");
  if (!row || row.cancelledAt) {
    throw new DomainError(t("T-032"));
  }
  if (row.origin !== "CASA") {
    throw new DomainError(guard(2));
  }
  const personId = ctx.actor.personId;
  const mine =
    personId !== null &&
    (row.createdById === personId ||
      (await currentSeatAuthority(personId, seatOf(row.area), ctx.tx)) !== null);
  if (!mine) {
    throw new DomainError(guard(3));
  }
  return row;
}

export async function updateBoardEvent(
  ctx: CommandContext,
  id: string,
  raw: BoardEventInput,
): Promise<void> {
  const input = parse(raw);
  const row = await editable(ctx, id);
  if (input.area !== row.area && input.area !== "BOARD") {
    const term = await getCurrentTerm();
    const seats =
      ctx.actor.personId && term ? await seatsDecidedBy(ctx.actor.personId, term.id, ctx.tx) : [];
    if (!seats.some((item) => item.seat === input.area)) {
      throw new DomainError(guard(1), "area");
    }
  }
  const values = {
    title: input.title,
    area: input.area,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    location: input.location,
    description: input.description,
    updatedById: ctx.actor.personId,
  };
  await ctx.tx.update(boardCalendarEvent).set(values).where(eq(boardCalendarEvent.id, id));
  await ctx.audit({
    action: "board-calendar.updated",
    entityType: "board_calendar_event",
    entityId: id,
    before: {
      title: row.title,
      area: row.area,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      location: row.location,
      description: row.description,
    },
    after: values,
  });
  await queuePush(ctx, id);
}

export async function cancelBoardEvent(ctx: CommandContext, id: string): Promise<void> {
  const row = await editable(ctx, id);
  await ctx.tx
    .update(boardCalendarEvent)
    .set({ cancelledAt: new Date(), updatedById: ctx.actor.personId })
    .where(eq(boardCalendarEvent.id, id));
  await ctx.audit({
    action: "board-calendar.cancelled",
    entityType: "board_calendar_event",
    entityId: id,
    before: { title: row.title, startsAt: row.startsAt },
  });
  await queuePush(ctx, id);
}

/** Las fechas de la junta que tocan un rango, sin las quitadas, en orden. */
export async function listBoardEventsBetween(
  from: Date,
  to: Date,
  exec: Executor = getDb(),
): Promise<BoardEventRow[]> {
  return exec
    .select()
    .from(boardCalendarEvent)
    .where(
      and(
        isNull(boardCalendarEvent.cancelledAt),
        lt(boardCalendarEvent.startsAt, to),
        gt(boardCalendarEvent.endsAt, from),
      ),
    )
    .orderBy(asc(boardCalendarEvent.startsAt));
}

export async function getBoardEvent(id: string): Promise<BoardEventRow | null> {
  const [row] = await getDb()
    .select()
    .from(boardCalendarEvent)
    .where(eq(boardCalendarEvent.id, id));
  return row ?? null;
}

export interface BoardCalendarStatus {
  configured: boolean;
  lastPulledAt: Date | null;
  lastError: string;
}

export async function boardCalendarStatus(): Promise<BoardCalendarStatus> {
  const [state] = await getDb()
    .select()
    .from(boardCalendarSync)
    .where(eq(boardCalendarSync.id, SYNC_ID));
  return {
    configured: isGoogleCalendarConfigured(),
    lastPulledAt: state?.lastPulledAt ?? null,
    lastError: state?.lastError ?? "",
  };
}

function syncErrorOf(error: unknown): string {
  return error instanceof GoogleCalendarError
    ? `${error.code}${error.status ? ` ${error.status}` : ""}`
    : "UNKNOWN";
}

/**
 * Escribe en Google lo que nació en la casa (el trabajo del outbox). Sin Google configurado no hace
 * nada. Si Google falla, deja el error en la fila y relanza, para que el outbox reintente.
 */
export async function pushBoardEvent(id: string): Promise<void> {
  if (!isGoogleCalendarConfigured()) return;
  try {
    await pushInTransaction(id);
  } catch (error) {
    // La transacción ya se deshizo: el error queda en la fila para verlo en la pantalla.
    if (error instanceof GoogleCalendarError) {
      await getDb()
        .update(boardCalendarEvent)
        .set({ syncError: syncErrorOf(error) })
        .where(eq(boardCalendarEvent.id, id));
    }
    throw error;
  }
}

async function pushInTransaction(id: string): Promise<void> {
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`board-calendar:${id}`}))`);
    const [row] = await tx
      .select()
      .from(boardCalendarEvent)
      .where(eq(boardCalendarEvent.id, id))
      .for("update");
    if (!row || row.origin !== "CASA") return;
    if (row.cancelledAt) {
      if (row.googleEventId) await deleteCalendarEvent(row.googleEventId);
      await tx
        .update(boardCalendarEvent)
        .set({ syncedAt: new Date(), syncError: "" })
        .where(eq(boardCalendarEvent.id, id));
      return;
    }
    const body = googleBodyFor(row.id, row);
    const saved = row.googleEventId
      ? await patchCalendarEvent(row.googleEventId, body)
      : await insertCalendarEvent(body);
    await tx
      .update(boardCalendarEvent)
      .set({
        googleEventId: saved.id,
        googleHtmlLink: saved.htmlLink ?? row.googleHtmlLink,
        syncedAt: new Date(),
        syncError: "",
      })
      .where(eq(boardCalendarEvent.id, id));
  });
}

/**
 * Lee de Google lo que cambió desde la última lectura (el programado de cada pocos minutos). Lo que
 * nació allá entra, cambia o se quita aquí; lo que nació aquí y alguien cambió o borró allá se vuelve a
 * escribir desde la casa, porque gana el lado donde nació.
 */
export async function pullBoardCalendar(
  now = new Date(),
): Promise<{ read: number; queued: number }> {
  if (!isGoogleCalendarConfigured()) return { read: 0, queued: 0 };
  const db = getDb();
  const [state] = await db
    .select()
    .from(boardCalendarSync)
    .where(eq(boardCalendarSync.id, SYNC_ID));
  let events: Awaited<ReturnType<typeof listCalendarEvents>>;
  try {
    events = await listCalendarEvents({
      timeMin: new Date(now.getTime() - PULL_BACK_DAYS * 86_400_000),
      timeMax: new Date(now.getTime() + PULL_AHEAD_DAYS * 86_400_000),
      updatedMin: state?.lastPulledAt
        ? new Date(state.lastPulledAt.getTime() - PULL_OVERLAP_MS)
        : undefined,
    });
  } catch (error) {
    await saveSyncState({ lastError: syncErrorOf(error) });
    throw error;
  }
  let queued = 0;
  await runCommand(SYSTEM_ACTOR, async (ctx) => {
    for (const event of events) {
      const casaId = event.extendedProperties?.private?.[CASA_ID_PROPERTY];
      const [own] = await ctx.tx
        .select()
        .from(boardCalendarEvent)
        .where(
          casaId
            ? eq(boardCalendarEvent.id, casaId)
            : eq(boardCalendarEvent.googleEventId, event.id),
        )
        .for("update");
      if (own?.origin === "CASA") {
        // Gana la casa: si lo borraron o lo cambiaron allá, se vuelve a escribir como está aquí.
        const content = contentFromGoogle(event);
        const deletedThere = event.status === "cancelled";
        // Si aquí se quitó, sobra allá; si sigue aquí, allá tiene que estar y decir lo mismo.
        const differs = own.cancelledAt
          ? !deletedThere
          : deletedThere || !content || !sameContent(own, content);
        if (differs) {
          if (deletedThere && !own.cancelledAt) {
            await ctx.tx
              .update(boardCalendarEvent)
              .set({ googleEventId: null })
              .where(eq(boardCalendarEvent.id, own.id));
          }
          await enqueueEvent(ctx.tx, eventOf(boardCalendarPush, { eventId: own.id }));
          queued += 1;
        }
        continue;
      }
      if (event.status === "cancelled") {
        if (own && !own.cancelledAt) {
          await ctx.tx
            .update(boardCalendarEvent)
            .set({ cancelledAt: now })
            .where(eq(boardCalendarEvent.id, own.id));
        }
        continue;
      }
      const content = contentFromGoogle(event);
      if (!content || content.title.length === 0) continue;
      const values = {
        ...content,
        googleHtmlLink: event.htmlLink ?? null,
        cancelledAt: null,
        syncedAt: now,
        syncError: "",
      };
      if (own) {
        await ctx.tx
          .update(boardCalendarEvent)
          .set(values)
          .where(eq(boardCalendarEvent.id, own.id));
      } else {
        await ctx.tx.insert(boardCalendarEvent).values({
          ...values,
          area: "BOARD",
          origin: "GOOGLE",
          googleEventId: event.id,
        });
      }
    }
  });
  await saveSyncState({ lastPulledAt: now, lastError: "" });
  return { read: events.length, queued };
}

async function saveSyncState(values: { lastPulledAt?: Date; lastError: string }) {
  await getDb()
    .insert(boardCalendarSync)
    .values({ id: SYNC_ID, ...values })
    .onConflictDoUpdate({ target: boardCalendarSync.id, set: values });
}

// Comandos (ADR-003): cada uno corre en runCommand con auditoría; el cargo se comprueba adentro.

export function createBoardEventAs(actor: Actor, input: BoardEventInput): Promise<{ id: string }> {
  return runCommand(actor, (ctx) => createBoardEvent(ctx, input));
}

export function updateBoardEventAs(
  actor: Actor,
  id: string,
  input: BoardEventInput,
): Promise<void> {
  return runCommand(actor, (ctx) => updateBoardEvent(ctx, id, input));
}

export function cancelBoardEventAs(actor: Actor, id: string): Promise<void> {
  return runCommand(actor, (ctx) => cancelBoardEvent(ctx, id));
}
