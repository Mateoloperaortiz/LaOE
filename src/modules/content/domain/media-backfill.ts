import { and, asc, eq, gt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { mediaBackfill, mediaProcess } from "@/domain-events/content";
import { eventOf } from "@/domain-events/define";
import { FULL_VARIANT } from "@/shared/lib/media";
import { mediaAsset } from "../schema";

// Relleno de la variante completa (ADR-114 regla 8). Los medios que quedaron READY antes de esa regla no
// la tienen y se siguen sirviendo desde su original. Cada hora el scheduler arranca una pasada: recorre
// por id los medios READY que no la tienen, de a pocos, y a cada uno le encola su `media.process`, que es
// quien la escribe. Es transitorio: se quita con el respaldo al original (DT-105).

/** Medios por lote. El poller corre los trabajos de a uno: un lote chico no tapa el resto del outbox. */
export const BACKFILL_BATCH = 5;
/** Lo que espera el lote siguiente, para que entre lote y lote corra lo demás. */
export const BACKFILL_PAUSE_MS = 60_000;

/**
 * Encola un lote del relleno y, si salió lleno, el siguiente. Avanza con cursor: un medio que no se
 * puede recodificar queda atrás y no frena a los demás, y la pasada termina siempre. Repetir un lote no
 * duplica trabajo: un `media.process` pendiente del mismo medio no se encola dos veces y uno que ya tiene
 * su variante no entra en la consulta.
 */
export async function queueFullVariantBackfill(
  input: { cursor: string | undefined; eventId: string },
  now = new Date(),
): Promise<{ queued: number; more: boolean }> {
  return getDb().transaction(async (tx) => {
    const rows = await tx
      .select({ id: mediaAsset.id })
      .from(mediaAsset)
      .where(
        and(
          eq(mediaAsset.status, "READY"),
          sql`(${mediaAsset.variants} -> ${FULL_VARIANT}) is null`,
          ...(input.cursor ? [gt(mediaAsset.id, input.cursor)] : []),
        ),
      )
      .orderBy(asc(mediaAsset.id))
      .limit(BACKFILL_BATCH);
    for (const row of rows) {
      await enqueueEvent(
        tx,
        eventOf(mediaProcess, { assetId: row.id }, { dedupeKey: `media.process:${row.id}` }),
        now,
      );
    }
    const last = rows.at(-1);
    const more = rows.length === BACKFILL_BATCH && last !== undefined;
    if (more) {
      // Agendado para después: `nextAttemptAt` es la hora desde la que el poller lo toma.
      await enqueueEvent(
        tx,
        eventOf(
          mediaBackfill,
          { cursor: last.id },
          { dedupeKey: `media.backfill:${input.eventId}` },
        ),
        new Date(now.getTime() + BACKFILL_PAUSE_MS),
      );
    }
    return { queued: rows.length, more };
  });
}
