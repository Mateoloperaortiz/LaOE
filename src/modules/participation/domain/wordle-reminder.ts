import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { listActiveMemberRefs } from "@/modules/people";
import { findTermContaining } from "@/modules/terms";
import { t } from "@/shared/copy";
import { splitTitleBody } from "@/shared/copy/render";
import { wordleGame } from "../schema";
import { wordleDay } from "./wordle-pure";

// Aviso diario del Wordle (ADR-074): el programado `wordle` recuerda la partida del día a los activos
// y honorarios que todavía no la abrieron, y solo mientras el término vigente tenga los puntos
// abiertos. comms entrega por push con la preferencia `pushWordle` y descarta a quien ya recibió la
// clave del día; la clave del outbox evita encolar dos veces el mismo aviso.

const MAX_RECIPIENTS = 1000;

export interface WordleReminderResult {
  day: string;
  audience: number;
  enqueued: number;
}

/** Un tick del programado `wordle`; `now` es la hora del tick (el scheduler la manda en `at`). */
export async function runWordleReminder(now = new Date()): Promise<WordleReminderResult> {
  const day = wordleDay(now);
  const db = getDb();
  const term = await findTermContaining(day, db);
  // La misma condición de `AVAILABLE` (ADR-041 regla 1): sin esto el push abre un tablero apagado.
  if (!term || term.pointsClosedAt) {
    return { day, audience: 0, enqueued: 0 };
  }
  const [members, games] = await Promise.all([
    listActiveMemberRefs(true),
    db.select({ personId: wordleGame.personId }).from(wordleGame).where(eq(wordleGame.day, day)),
  ]);
  // Quien ya abrió el tablero hoy —ganó, perdió o está a medias— no necesita que se lo recuerden.
  const played = new Set(games.map((row) => row.personId));
  const recipients = members
    .filter((ref) => !ref.anonymized && !played.has(ref.personId))
    .map((ref) => ref.personId);
  const { title, body } = splitTitleBody(t("T-2620"));
  let enqueued = 0;
  for (let start = 0; start < recipients.length; start += MAX_RECIPIENTS) {
    await enqueueEvent(db, {
      type: "notification.requested",
      payload: {
        kind: "WORDLE",
        recipients: recipients
          .slice(start, start + MAX_RECIPIENTS)
          .map((personId) => ({ personId })),
        title,
        body,
        url: "/app/juegos/wordle",
        tag: "wordle",
        dedupeKey: `wordle:${day}`,
      },
      dedupeKey: `wordle-reminder:${day}:${start / MAX_RECIPIENTS}`,
    });
    enqueued += 1;
  }
  return { day, audience: recipients.length, enqueued };
}
