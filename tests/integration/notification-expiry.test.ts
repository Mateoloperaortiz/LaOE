import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import { deliverNotification, saveSubscriptionAs, setPushSenderForTests } from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { runReminders } from "@/modules/participation";
import { outbox } from "@/modules/system/schema";
import { captureLogs, recordsOf } from "../helpers/logs";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "./factories";

// Un aviso puede traer su vencimiento y, vencido, no se entrega (ADR-122 regla 9; DT-216, inciso c).
// El reloj es el del poller: `drainOutbox` lo adelanta con `now` y nada espera de verdad. La fecha del
// proceso queda quieta en el tick para que lo encolado nazca ahí y no a la hora en que corre la prueba.

const db = () => getDb();

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Lunes 14 de septiembre de 2026 en Bogotá (UTC-5).
/** El tick de las 07:00, la hora `today` de `reminders.hours`. */
const MORNING_TICK = new Date("2026-09-14T12:00:00Z");
/** El tick de las 18:00, la hora `eve`. */
const EVE_TICK = new Date("2026-09-14T23:00:00Z");
/** Una actividad de ese día a las 18:00. */
const STARTS_AT = new Date("2026-09-14T23:00:00Z");

const EXPIRED = "notificación vencida: no se entrega";
const DELIVERED = "notificación entregada";

async function subscribed(email: string): Promise<string> {
  const personId = await seedMember(email);
  await saveSubscriptionAs(
    { personId, ip: null },
    {
      endpoint: `https://fcm.googleapis.com/fcm/send/${personId}`,
      keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) },
    },
    null,
  );
  return personId;
}

/** El recordatorio «hoy» de una actividad de las 18:00, ya en la cola desde el tick de las 07:00. */
async function reminderQueued() {
  const termId = await seedTerm();
  const personId = await subscribed("ana@eafit.edu.co");
  const occasion = await seedOccasion(termId, {
    title: "Taller de marca",
    startsAt: STARTS_AT,
    checkInOpensAt: new Date(STARTS_AT.getTime() - 30 * MINUTE),
    checkInClosesAt: new Date(STARTS_AT.getTime() + 3 * HOUR),
  });
  expect(await runReminders(MORNING_TICK)).toEqual({ due: 1, enqueued: 1 });
  return { termId, personId, occasion };
}

function notice(personId: string, dedupeKey: string, expiresAt?: string) {
  return {
    kind: "REMINDER" as const,
    recipients: [{ personId }],
    title: "Taller de marca",
    body: "",
    url: "/app",
    dedupeKey,
    ...(expiresAt === undefined ? {} : { expiresAt }),
  };
}

function notificationRows() {
  return db().select().from(outbox).where(eq(outbox.eventType, notificationRequested.type));
}

describe("el vencimiento de un aviso", () => {
  const delivered: string[] = [];
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MORNING_TICK);
    await truncateAll();
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

  it("un recordatorio con hora que se drena cuando la ocasión ya empezó no se entrega, y el registro dice que venció sin nombrar a nadie", async () => {
    const { personId, occasion } = await reminderQueued();

    const { lines } = await captureLogs(() =>
      drainOutbox({ now: new Date(STARTS_AT.getTime() + MINUTE) }),
    );

    expect(delivered).toEqual([]);
    expect(await db().select().from(message)).toEqual([]);
    const [expired, ...more] = recordsOf(lines, EXPIRED);
    expect(more).toEqual([]);
    expect(expired).toMatchObject({
      level: 40,
      job: notificationRequested.type,
      kind: "REMINDER",
      expiresAt: STARTS_AT.toISOString(),
      expired: 1,
    });
    expect(recordsOf(lines, DELIVERED)).toEqual([]);
    // El rastro no lleva a la persona ni la clave del aviso, que en otros avisos trae su id.
    const trace = lines.filter((entry) => entry.record.msg === EXPIRED).map((entry) => entry.line);
    expect(trace.join("\n")).not.toContain(personId);
    expect(trace.join("\n")).not.toContain(occasion.id);
    // Descartado no es fallido: el evento queda procesado y no vuelve.
    const [row, ...rest] = await notificationRows();
    expect(rest).toEqual([]);
    expect(row).toMatchObject({ lastError: null, deadLetterAt: null });
    expect(row?.processedAt).not.toBeNull();
  });

  it("el mismo recordatorio, drenado antes de que empiece la ocasión, se entrega como siempre y lleva la hora del poller", async () => {
    const { personId, occasion } = await reminderQueued();
    const before = new Date(STARTS_AT.getTime() - MINUTE);

    const { lines } = await captureLogs(() => drainOutbox({ now: before }));

    expect(delivered).toEqual([`https://fcm.googleapis.com/fcm/send/${personId}`]);
    expect(
      (await db().select().from(message)).map((row) => ({
        personId: row.personId,
        dedupeKey: row.dedupeKey,
        status: row.status,
        sentAt: row.sentAt,
      })),
    ).toEqual([
      { personId, dedupeKey: `reminder:TODAY:${occasion.id}`, status: "SENT", sentAt: before },
    ]);
    expect(recordsOf(lines, EXPIRED)).toEqual([]);
    expect(recordsOf(lines, DELIVERED)).toEqual([
      expect.objectContaining({ level: 30, sent: 1, expired: 0 }),
    ]);
  });

  it("vence en el instante que dice: un milisegundo antes sale, y desde ese instante no", async () => {
    const personId = await subscribed("ana@eafit.edu.co");
    const expiresAt = STARTS_AT.toISOString();

    expect(
      await deliverNotification(
        notice(personId, "antes", expiresAt),
        new Date(STARTS_AT.getTime() - 1),
      ),
    ).toMatchObject({ sent: 1, expired: 0 });
    expect(
      await deliverNotification(notice(personId, "justo", expiresAt), STARTS_AT),
    ).toMatchObject({ sent: 0, expired: 1 });
    expect(
      await deliverNotification(
        notice(personId, "después", expiresAt),
        new Date(STARTS_AT.getTime() + 1),
      ),
    ).toMatchObject({ sent: 0, expired: 1 });

    expect(delivered).toHaveLength(1);
    expect((await db().select().from(message)).map((row) => row.dedupeKey)).toEqual(["antes"]);
  });

  it("un aviso sin vencimiento, como los que deja en la cola la versión anterior, se entrega igual por tarde que se drene", async () => {
    const personId = await subscribed("ana@eafit.edu.co");
    await enqueueEvent(db(), eventOf(notificationRequested, notice(personId, "sin-vencimiento")));

    const { lines } = await captureLogs(() =>
      drainOutbox({ now: new Date(MORNING_TICK.getTime() + 30 * DAY) }),
    );

    expect(delivered).toHaveLength(1);
    expect((await db().select().from(message)).map((row) => row.dedupeKey)).toEqual([
      "sin-vencimiento",
    ]);
    expect(recordsOf(lines, EXPIRED)).toEqual([]);
  });

  it("un vencimiento que no es un instante legible no se entrega ni se da por bueno: el evento falla", async () => {
    const personId = await subscribed("ana@eafit.edu.co");
    await enqueueEvent(
      db(),
      eventOf(notificationRequested, notice(personId, "ilegible", "mañana a las seis")),
    );

    const result = await drainOutbox({ expectFailures: [notificationRequested] });

    expect(result).toEqual({ processed: 0, failed: 1 });
    expect(delivered).toEqual([]);
    expect(await db().select().from(message)).toEqual([]);
  });

  it("los cuatro recordatorios de una ocasión vencen cuando la ocasión empieza", async () => {
    const termId = await seedTerm();
    const committeeId = await seedCommittee("c10-pixel", "Pixel");
    const personId = await subscribed("ana@eafit.edu.co");
    await seedCommitteeMembership(personId, committeeId, termId);
    const at = (iso: string) => {
      const startsAt = new Date(iso);
      return {
        startsAt,
        checkInOpensAt: new Date(startsAt.getTime() - 30 * MINUTE),
        checkInClosesAt: new Date(startsAt.getTime() + 3 * HOUR),
      };
    };
    // Hoy a las 18:00; mañana a las 10:00 y a las 17:00; y hoy a las 20:30, dos horas y media después
    // del tick de la víspera.
    const today = await seedOccasion(termId, at(STARTS_AT.toISOString()));
    const meeting = await seedOccasion(termId, {
      ...at("2026-09-15T15:00:00Z"),
      category: "COMMITTEE_MEETING",
      committeeId,
    });
    const assemblyTomorrow = await seedOccasion(termId, {
      ...at("2026-09-15T22:00:00Z"),
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
    });
    const assemblySoon = await seedOccasion(termId, {
      ...at("2026-09-15T01:30:00Z"),
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      points: 0,
    });

    expect(await runReminders(MORNING_TICK)).toEqual({ due: 1, enqueued: 1 });
    expect(await runReminders(EVE_TICK)).toEqual({ due: 3, enqueued: 3 });

    const expiry = Object.fromEntries(
      (await notificationRows()).map((row) => {
        const payload = row.payload as { dedupeKey: string; expiresAt?: string };
        return [payload.dedupeKey, payload.expiresAt];
      }),
    );
    expect(expiry).toEqual({
      [`reminder:TODAY:${today.id}`]: "2026-09-14T23:00:00.000Z",
      [`reminder:MEETING_EVE:${meeting.id}`]: "2026-09-15T15:00:00.000Z",
      [`reminder:ASSEMBLY_EVE:${assemblyTomorrow.id}`]: "2026-09-15T22:00:00.000Z",
      [`reminder:ASSEMBLY_SOON:${assemblySoon.id}`]: "2026-09-15T01:30:00.000Z",
    });
  });

  it.each([
    ["no trae su hora", {}],
    ["trae una hora que no se lee", { at: "a las siete" }],
  ])("un tick de recordatorios que %s toma la del poller, no la del proceso", async (_case, payload) => {
    const termId = await seedTerm();
    const personId = await subscribed("ana@eafit.edu.co");
    const occasion = await seedOccasion(termId, {
      title: "Taller de marca",
      startsAt: STARTS_AT,
      checkInOpensAt: new Date(STARTS_AT.getTime() - 30 * MINUTE),
      checkInClosesAt: new Date(STARTS_AT.getTime() + 3 * HOUR),
    });
    // El proceso va una hora antes del tick de las 07:00: con su hora no hay nada que recordar.
    vi.setSystemTime(new Date(MORNING_TICK.getTime() - HOUR));
    await enqueueEvent(db(), { type: "participation.reminders", payload });

    await drainOutbox({ now: MORNING_TICK });

    expect(delivered).toEqual([`https://fcm.googleapis.com/fcm/send/${personId}`]);
    expect((await db().select().from(message)).map((row) => row.dedupeKey)).toEqual([
      `reminder:TODAY:${occasion.id}`,
    ]);
  });
});
