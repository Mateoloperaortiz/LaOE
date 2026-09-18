import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import {
  DEFAULT_PREFERENCES,
  saveSubscriptionAs,
  setPushSenderForTests,
  updatePreferencesAs,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { runWordleReminder, startWordleAs } from "@/modules/participation";
import { wordleDay } from "@/modules/participation/domain/wordle-pure";
import { outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { truncateAll } from "./db";
import { seedMember, seedTerm } from "./factories";

// Aviso diario del Wordle (ADR-074): a los activos que todavía no abrieron la partida, una sola vez
// por día, con el interruptor propio `pushWordle` y solo mientras haya puntos abiertos.

const db = () => getDb();

async function subscribe(personId: string, endpoint: string) {
  await saveSubscriptionAs(
    { personId },
    { endpoint, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
    null,
  );
}

describe("aviso diario del Wordle", () => {
  const delivered: string[] = [];
  beforeEach(async () => {
    await truncateAll();
    delivered.length = 0;
    setPushSenderForTests(async (subscription) => {
      delivered.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
  });
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("avisa a quien no jugó, salta a quien ya abrió la partida y no repite en el día", async () => {
    await seedTerm();
    const juega = await seedMember("juega@eafit.edu.co");
    const yaJugo = await seedMember("yajugo@eafit.edu.co");
    const sinGanas = await seedMember("singanas@eafit.edu.co");
    for (const [personId, endpoint] of [
      [juega, "juega"],
      [yaJugo, "yajugo"],
      [sinGanas, "singanas"],
    ] as const) {
      await subscribe(personId, `https://push.example/${endpoint}`);
    }
    // El interruptor propio apaga solo esto (regla 4).
    await updatePreferencesAs(
      { personId: sinGanas },
      { ...DEFAULT_PREFERENCES, pushWordle: false },
    );
    expect((await startWordleAs({ personId: yaJugo })).ok).toBe(true);

    const day = wordleDay();
    expect(await runWordleReminder()).toEqual({ day, audience: 2, enqueued: 1 });
    expect((await drain(20)).failed).toBe(0);
    const rows = await db().select().from(message);
    expect(rows.map((row) => row.personId)).toEqual([juega]);
    expect(rows[0]).toMatchObject({
      channel: "PUSH",
      kind: "WORDLE",
      status: "SENT",
      dedupeKey: `wordle:${day}`,
      subject: "El Wordle de hoy te espera",
    });
    expect(delivered).toEqual(["https://push.example/juega"]);
    // El aviso lleva al tablero, que desde ADR-075 vive en la biblioteca de juegos.
    const encolados = await db().select().from(outbox);
    const aviso = encolados.find((row) => row.eventType === "notification.requested");
    expect((aviso?.payload as { url?: string } | null)?.url).toBe("/app/juegos/wordle");

    // El mismo día otra vez: el outbox no duplica y comms descarta la clave ya entregada.
    expect((await runWordleReminder()).enqueued).toBe(1);
    await drain(20);
    expect(await db().select().from(message)).toHaveLength(1);
    expect(delivered).toHaveLength(1);
  });

  it("no encola nada sin término vigente ni con los puntos del término ya cerrados", async () => {
    expect(await runWordleReminder()).toEqual({ day: wordleDay(), audience: 0, enqueued: 0 });

    const termId = await seedTerm();
    const persona = await seedMember("cerrado@eafit.edu.co");
    await subscribe(persona, "https://push.example/cerrado");
    await db().update(term).set({ pointsClosedAt: new Date() }).where(eq(term.id, termId));

    expect(await runWordleReminder()).toEqual({ day: wordleDay(), audience: 0, enqueued: 0 });
    await drain(20);
    expect(await db().select().from(message)).toHaveLength(0);
    expect(delivered).toHaveLength(0);
  });
});
