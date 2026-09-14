import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Executor } from "@/db/tx";
import { event, eventEdition } from "../schema";
import { MACROEVENT_SLUGS } from "./macroevents-pure";

export async function listMacroevents() {
  const rows = await getDb()
    .select({ id: event.id, slug: event.slug, name: event.name, summary: event.summary })
    .from(event)
    .where(inArray(event.slug, [...MACROEVENT_SLUGS]));
  return rows.sort(
    (a, b) =>
      MACROEVENT_SLUGS.indexOf(a.slug as (typeof MACROEVENT_SLUGS)[number]) -
      MACROEVENT_SLUGS.indexOf(b.slug as (typeof MACROEVENT_SLUGS)[number]),
  );
}

export async function getEventRef(id: string, exec: Executor = getDb()) {
  const [row] = await exec
    .select({ id: event.id, slug: event.slug, name: event.name })
    .from(event)
    .where(eq(event.id, id));
  return row ?? null;
}

/** Contexto comprobado dentro de la transacción que registra el cargo o vincula el GT. */
export async function getMacroeventEdition(id: string, exec: Executor = getDb()) {
  const [row] = await exec
    .select({
      id: eventEdition.id,
      eventId: event.id,
      eventSlug: event.slug,
      eventName: event.name,
      name: eventEdition.name,
      startsAt: eventEdition.startsAt,
    })
    .from(eventEdition)
    .innerJoin(event, eq(event.id, eventEdition.eventId))
    .where(eq(eventEdition.id, id));
  return row ?? null;
}
