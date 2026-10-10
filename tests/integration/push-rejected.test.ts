import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { type NotificationRequested, notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import {
  deliverNotification,
  listSubscriptionsFor,
  saveSubscriptionAs,
  setPushSenderForTests,
} from "@/modules/comms";
import { message } from "@/modules/comms/schema";
import { captureLogs, type LoggedLine, recordsOf } from "../helpers/logs";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Lo que queda de un push que el servicio rechaza (ADR-118 regla 25). Antes, un 401 por una clave
// VAPID mala y un 500 del servicio dejaban la misma frase en el registro del mensaje, y el handler
// escribía una línea de información «… entregado» con `sent: 0`. El envío va simulado con lo que
// devuelve el adaptador; el bus, el outbox, el handler y el logger son los de verdad.

type PushSender = NonNullable<Parameters<typeof setPushSenderForTests>[0]>;

const KEYS = { p256dh: "p".repeat(32), auth: "a".repeat(16) };
const DELIVERED = "notificación entregada";
const NOT_DELIVERED = "push sin entregar";

const db = () => getDb();
const device = (name: string) => `https://fcm.googleapis.com/fcm/send/credencial-${name}`;
const subscribe = (personId: string, name: string) =>
  saveSubscriptionAs(
    { personId, ip: null },
    { endpoint: device(name), keys: KEYS },
    "Chrome/140 Android",
  );

function request(personIds: string[], dedupeKey = "announcement:rechazo"): NotificationRequested {
  return {
    kind: "ANNOUNCEMENT",
    recipients: personIds.map((personId) => ({ personId })),
    title: "Anuncio nuevo",
    body: "Primera línea",
    url: "/cartelera/x",
    dedupeKey,
  };
}

/** Lo que el adaptador devuelve cuando el servicio responde ese código. */
const rejectedWith =
  (statusCode: number): PushSender =>
  async () => ({
    ok: false,
    gone: statusCode === 404 || statusCode === 410,
    statusCode,
    error: "Received unexpected response code",
  });
const accepted: PushSender = async () => ({ ok: true, statusCode: 201 });

async function messageOf(personId: string) {
  const [row] = await db().select().from(message).where(eq(message.personId, personId));
  return row;
}

/** Entrega el aviso por el outbox, como en producción, y devuelve lo que quedó en el registro. */
async function deliverThroughOutbox(personIds: string[]): Promise<LoggedLine[]> {
  await enqueueEvent(db(), eventOf(notificationRequested, request(personIds)));
  const { result, lines } = await captureLogs(() => drainOutbox());
  // El rechazo no hace fallar el evento ni lo reintenta: es DT-183 y la decisión abierta 15.
  expect(result).toEqual({ processed: 1, failed: 0 });
  return lines;
}

/** Ni el endpoint, que es la credencial del dispositivo, ni sus claves salen en ninguna línea. */
function expectNoDevice(lines: LoggedLine[]): void {
  for (const { line } of lines) {
    expect(line).not.toContain("credencial-");
    expect(line).not.toContain(KEYS.p256dh);
    expect(line).not.toContain(KEYS.auth);
  }
}

describe("un push que el servicio rechaza", () => {
  beforeEach(async () => {
    await truncateAll();
    setPushSenderForTests(undefined);
  });
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("guarda en el registro del mensaje el código con que respondió el servicio, y el motivo de la red si no respondió", async () => {
    const ana = await seedMember("ana.rechazo@eafit.edu.co");
    const bruno = await seedMember("bruno.red@eafit.edu.co");
    await subscribe(ana, "ana-1");
    await subscribe(ana, "ana-2");
    await subscribe(bruno, "bruno");
    setPushSenderForTests(async (subscription) =>
      subscription.endpoint.endsWith("bruno")
        ? { ok: false, gone: false, statusCode: null, error: "socket hang up" }
        : { ok: false, gone: false, statusCode: 403, error: "Received unexpected response code" },
    );

    const stats = await deliverNotification(request([ana, bruno]));

    expect(stats).toMatchObject({
      sent: 0,
      failed: 2,
      deviceFailures: { "403": 2, "sin respuesta": 1 },
    });
    expect(await messageOf(ana)).toMatchObject({
      status: "FAILED",
      error: "HTTP 403: Received unexpected response code",
    });
    expect(await messageOf(bruno)).toMatchObject({ status: "FAILED", error: "socket hang up" });
  });

  it.each([
    401, 403, 429, 500,
  ])("un %i en todos los dispositivos deja una advertencia con el código, y ninguna línea dice «entregado»", async (statusCode) => {
    const ana = await seedMember("ana.todos@eafit.edu.co");
    await subscribe(ana, "ana-1");
    await subscribe(ana, "ana-2");
    setPushSenderForTests(rejectedWith(statusCode));

    const lines = await deliverThroughOutbox([ana]);

    expect(recordsOf(lines, DELIVERED)).toEqual([]);
    const warnings = recordsOf(lines, NOT_DELIVERED);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      level: 40,
      job: notificationRequested.type,
      sent: 0,
      failed: 1,
      removedDevices: 0,
      deviceFailures: { [String(statusCode)]: 2 },
    });
    expectNoDevice(lines);
    // El dispositivo se queda: solo un 404 o un 410 dicen que ya no existe.
    expect(await listSubscriptionsFor(ana)).toHaveLength(2);
  });

  it("si a una persona le llegó y a otra no, sigue siendo una advertencia, con las dos cuentas", async () => {
    const ana = await seedMember("ana.mixto@eafit.edu.co");
    const bruno = await seedMember("bruno.mixto@eafit.edu.co");
    await subscribe(ana, "ana");
    await subscribe(bruno, "bruno");
    setPushSenderForTests(async (subscription, payload) =>
      subscription.endpoint.endsWith("ana")
        ? rejectedWith(403)(subscription, payload)
        : accepted(subscription, payload),
    );

    const lines = await deliverThroughOutbox([ana, bruno]);

    expect(recordsOf(lines, DELIVERED)).toEqual([]);
    expect(recordsOf(lines, NOT_DELIVERED)).toEqual([
      expect.objectContaining({ level: 40, sent: 1, failed: 1, deviceFailures: { "403": 1 } }),
    ]);
    expectNoDevice(lines);
  });

  it("el dispositivo que ya no existe también deja la advertencia cuando era el único: a esa persona no le llegó", async () => {
    const ana = await seedMember("ana.vencido@eafit.edu.co");
    await subscribe(ana, "vencido");
    setPushSenderForTests(rejectedWith(410));

    const lines = await deliverThroughOutbox([ana]);

    expect(recordsOf(lines, NOT_DELIVERED)).toEqual([
      expect.objectContaining({
        level: 40,
        sent: 0,
        failed: 1,
        removedDevices: 1,
        deviceFailures: { "410": 1 },
      }),
    ]);
    expect(await listSubscriptionsFor(ana)).toEqual([]);
    expect(await messageOf(ana)).toMatchObject({
      status: "FAILED",
      error: "HTTP 410: Received unexpected response code",
    });
  });

  it("si un dispositivo acepta y otro rechaza, el envío llegó: línea de información, con el rechazo contado", async () => {
    const ana = await seedMember("ana.parcial@eafit.edu.co");
    await subscribe(ana, "acepta");
    await subscribe(ana, "rechaza");
    setPushSenderForTests(async (subscription, payload) =>
      subscription.endpoint.endsWith("rechaza")
        ? rejectedWith(403)(subscription, payload)
        : accepted(subscription, payload),
    );

    const lines = await deliverThroughOutbox([ana]);

    expect(recordsOf(lines, NOT_DELIVERED)).toEqual([]);
    expect(recordsOf(lines, DELIVERED)).toEqual([
      expect.objectContaining({ level: 30, sent: 1, failed: 0, deviceFailures: { "403": 1 } }),
    ]);
    expect(await messageOf(ana)).toMatchObject({ status: "SENT", error: null });
    expectNoDevice(lines);
  });

  it("un envío que llegó sigue dejando su línea de información y ninguna advertencia", async () => {
    const ana = await seedMember("ana.llega@eafit.edu.co");
    await subscribe(ana, "ana");
    setPushSenderForTests(accepted);

    const lines = await deliverThroughOutbox([ana]);

    expect(recordsOf(lines, NOT_DELIVERED)).toEqual([]);
    expect(recordsOf(lines, DELIVERED)).toEqual([
      expect.objectContaining({ level: 30, sent: 1, failed: 0 }),
    ]);
  });
});
