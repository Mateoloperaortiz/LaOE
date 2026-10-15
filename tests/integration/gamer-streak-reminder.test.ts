import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { SYSTEM_ACTOR } from "@/db/tx";
import {
  DEFAULT_PREFERENCES,
  deliverNotification,
  getPreferences,
  saveSubscriptionAs,
  setPushSenderForTests,
  updatePreferencesAs,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import {
  setGamificationEnabledAs,
  startWordleAs,
  submitWordleGuessAs,
} from "@/modules/participation";
import { runGamerStreakReminder } from "@/modules/participation/domain/gamer-streak-reminder";
import { wordleGame } from "@/modules/participation/schema";
import { writeConfig } from "@/modules/system";
import { outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { tList } from "@/shared/copy";
import { seedMember, seedPerson, seedTerm } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

const NOW = new Date("2026-10-14T01:00:00Z"); // Martes 13, 20:00 de Colombia.
const db = () => getDb();

async function winOn(personId: string, day: string): Promise<void> {
  vi.setSystemTime(new Date(`${day}T15:00:00Z`));
  const started = await startWordleAs({ personId, ip: null });
  if (!started.ok || !started.game) throw new Error("No empezó el Wordle sintético");
  const [game] = await db()
    .select({ answer: wordleGame.answer })
    .from(wordleGame)
    .where(eq(wordleGame.id, started.game.id));
  if (!game) throw new Error("No existe el Wordle sintético");
  const result = await submitWordleGuessAs(
    { personId, ip: null },
    {
      gameId: started.game.id,
      guess: game.answer,
      requestId: randomUUID(),
      expectedAttempt: 1,
    },
  );
  expect(result.ok).toBe(true);
}

async function subscribe(personId: string, suffix: string, optIn = true): Promise<void> {
  await saveSubscriptionAs(
    { personId, ip: null },
    {
      endpoint: `https://fcm.googleapis.com/fcm/send/${suffix}`,
      keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) },
    },
    null,
  );
  if (optIn) {
    await updatePreferencesAs(
      { personId, ip: null },
      { ...DEFAULT_PREFERENCES, pushGamerStreak: true },
    );
  }
}

describe("aviso nocturno de racha gamer", () => {
  const delivered: string[] = [];
  let configActor: { personId: string; ip: null };
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await truncateAll();
    configActor = { personId: await seedPerson("config-gamer@example.test"), ip: null };
    await setGamificationEnabledAs(configActor, false);
    delivered.length = 0;
    setPushSenderForTests(async (subscription) => {
      delivered.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("avisa con opt-in a rachas vivas, distingue comodín y no repite ni avisa a quien ya cumplió", async () => {
    await seedTerm();
    const available = await seedMember("comodin-gamer@eafit.edu.co");
    const used = await seedMember("riesgo-gamer@eafit.edu.co");
    const played = await seedMember("cumplio-gamer@eafit.edu.co");
    const off = await seedMember("sin-aviso-gamer@eafit.edu.co");
    const noStreak = await seedMember("sin-racha-gamer@eafit.edu.co");
    const broken = await seedMember("racha-rota-gamer@eafit.edu.co");
    await winOn(broken, "2026-10-09");
    await winOn(used, "2026-10-11");
    await winOn(available, "2026-10-12");
    await winOn(played, "2026-10-12");
    await winOn(off, "2026-10-12");
    await winOn(played, "2026-10-13");
    vi.setSystemTime(NOW);
    // Los eventos históricos se atienden antes de activar, sin premiarlos ni avisarlos retroactivamente.
    await drainOutbox();
    await setGamificationEnabledAs(configActor, true);
    for (const [id, suffix] of [
      [available, "comodin"],
      [used, "riesgo"],
      [played, "cumplio"],
      [off, "apagado"],
      [noStreak, "sin-racha"],
      [broken, "rota"],
    ] as const) {
      await subscribe(id, suffix, id !== off);
    }
    expect((await getPreferences(off)).pushGamerStreak).toBe(false);
    expect(await runGamerStreakReminder(NOW)).toEqual({
      day: "2026-10-13",
      audience: 3,
      enqueued: 2,
    });
    const queued = await db()
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.eventType, "notification.requested"));
    const request = queued.find((row) => {
      const payload = row.payload;
      return (
        typeof payload === "object" &&
        payload !== null &&
        "kind" in payload &&
        payload.kind === "GAMER_STREAK"
      );
    });
    expect(request?.payload).toMatchObject({
      url: "/app/juegos",
      expiresAt: "2026-10-14T05:00:00.000Z",
    });
    await drainOutbox();
    const rows = await db().select().from(message).where(eq(message.kind, "GAMER_STREAK"));
    expect(new Set(rows.map((row) => row.personId))).toEqual(new Set([available, used]));
    expect(rows.find((row) => row.personId === available)?.subject).toBe(tList("T-3453")[0]);
    expect(rows.find((row) => row.personId === used)?.subject).toBe(tList("T-3454")[0]);
    expect(delivered).toHaveLength(2);
    await runGamerStreakReminder(NOW);
    await drainOutbox();
    expect(await db().select().from(message).where(eq(message.kind, "GAMER_STREAK"))).toHaveLength(
      2,
    );
    expect(delivered).toHaveLength(2);
  });

  it("no encola con gamificación apagada, sin término o con puntos cerrados", async () => {
    await setGamificationEnabledAs(configActor, true);
    expect((await runGamerStreakReminder(NOW)).enqueued).toBe(0);
    await setGamificationEnabledAs(configActor, false);
    const termId = await seedTerm();
    const personId = await seedMember("sin-lanzamiento-gamer@eafit.edu.co");
    await winOn(personId, "2026-10-12");
    vi.setSystemTime(NOW);
    await subscribe(personId, "espera-lanzamiento");
    expect((await runGamerStreakReminder(NOW)).enqueued).toBe(0);
    await setGamificationEnabledAs(configActor, true);
    await db().update(term).set({ pointsClosedAt: NOW }).where(eq(term.id, termId));
    expect((await runGamerStreakReminder(NOW)).enqueued).toBe(0);
  });

  it("un aviso retrasado hasta medianoche vence sin envío ni registro", async () => {
    const personId = await seedMember("aviso-vencido-gamer@eafit.edu.co");
    await subscribe(personId, "vencido");
    const result = await deliverNotification(
      {
        kind: "GAMER_STREAK",
        recipients: [{ personId }],
        title: "Racha gamer sintética",
        url: "/app/juegos",
        dedupeKey: "gamer-streak:2026-10-13",
        expiresAt: "2026-10-14T05:00:00.000Z",
      },
      new Date("2026-10-14T05:00:00Z"),
    );
    expect(result.expired).toBe(1);
    expect(delivered).toHaveLength(0);
    expect(await db().select().from(message).where(eq(message.kind, "GAMER_STREAK"))).toHaveLength(
      0,
    );
  });

  it("no avisa antes del primer lanzamiento aunque una escritura genérica haya encendido la bandera", async () => {
    const personId = await seedMember("sin-primer-lanzamiento-gamer@example.test");
    await winOn(personId, "2026-10-12");
    vi.setSystemTime(NOW);
    await subscribe(personId, "sin-primer-lanzamiento");
    // La bandera sola no sustituye la activación de dominio ni fija una fecha de lanzamiento.
    await writeConfig(SYSTEM_ACTOR, "gamification.enabled", true);
    expect(await runGamerStreakReminder(NOW)).toEqual({
      day: "2026-10-13",
      audience: 0,
      enqueued: 0,
    });
  });
});
