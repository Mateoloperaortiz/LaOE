import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { type NotificationRequested, notificationRequested } from "@/domain-events/comms";
import { announcementPushRequested } from "@/domain-events/content";
import { eventOf } from "@/domain-events/define";
import { accessGrantIssued } from "@/domain-events/identity";
import { registerHandler } from "@/jobs/registry";
import {
  deliverNotification,
  getPreferences,
  listMessagesFor,
  listSubscriptionsFor,
  removeSubscriptionAs,
  saveSubscriptionAs,
  setPushSenderForTests,
  updatePreferencesAs,
} from "@/modules/comms";
import { recordMessage } from "@/modules/comms/domain/messages";
import { message, pushDelivery } from "@/modules/comms/schema";
import { createAnnouncement, getAnnouncement, publishAndPushAnnouncement } from "@/modules/content";
import { anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import { outbox } from "@/modules/system/schema";
import { seedMember } from "../factories";
import { deferred, waitingForLock } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

const MINUTE = 60_000;
const db = () => getDb();
const afterBackoff = (minutes = 2) => new Date(Date.now() + minutes * MINUTE);
const endpoint = (name: string) => `https://fcm.googleapis.com/fcm/send/reintento-${name}`;
const subscribe = (personId: string, name: string) =>
  saveSubscriptionAs(
    { personId, ip: null },
    { endpoint: endpoint(name), keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
    null,
  );

function request(
  personId: string,
  overrides: Partial<NotificationRequested> = {},
): NotificationRequested {
  return {
    kind: "ANNOUNCEMENT",
    recipients: [{ personId }],
    title: "Aviso",
    body: "Un aviso de prueba",
    url: "/app",
    dedupeKey: "retry:aviso",
    ...overrides,
  };
}

async function enqueueNotification(
  personId: string,
  overrides: Partial<NotificationRequested> = {},
) {
  await enqueueEvent(db(), eventOf(notificationRequested, request(personId, overrides)));
}

let neighbourFailures = 0;
let neighbourRuns = 0;

describe("reintentos de push por dispositivo (ADR-144)", () => {
  beforeAll(() => {
    const neighbour = async () => {
      neighbourRuns += 1;
      if (neighbourFailures > 0) {
        neighbourFailures -= 1;
        throw new Error("vecino caído");
      }
    };
    registerHandler(notificationRequested.type, neighbour);
    registerHandler(announcementPushRequested.type, neighbour);
  });
  beforeEach(async () => {
    await truncateAll();
    neighbourFailures = 0;
    neighbourRuns = 0;
    setPushSenderForTests(undefined);
  });
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it.each([
    429, 500,
  ])("el rechazo %i del aviso de acceso reintenta el evento con backoff y actualiza el mismo mensaje al aceptar", async (statusCode) => {
    const personId = await seedMember("acceso.reintento@eafit.edu.co");
    await subscribe(personId, "acceso");
    let down = true;
    let attempts = 0;
    setPushSenderForTests(async () => {
      attempts += 1;
      return down
        ? { ok: false, gone: false, statusCode, error: "servicio caído" }
        : { ok: true, statusCode: 201 };
    });
    await enqueueEvent(
      db(),
      eventOf(accessGrantIssued, { personId, kind: "ACTIVATION", issuedById: null }),
    );

    expect(await drainOutbox({ expectFailures: [accessGrantIssued] })).toEqual({
      processed: 0,
      failed: 1,
    });
    const [pending] = await db()
      .select()
      .from(outbox)
      .where(eq(outbox.eventType, accessGrantIssued.type));
    expect(pending).toMatchObject({ attempts: 1, processedAt: null, deadLetterAt: null });
    expect(pending?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now() + 50_000);
    const [first] = await listMessagesFor(personId);
    expect(first).toMatchObject({ status: "FAILED", kind: "TRANSACTIONAL" });
    down = false;
    expect(await drainOutbox({ expectFailures: [accessGrantIssued] })).toEqual({
      processed: 0,
      failed: 0,
    });
    expect(attempts).toBe(1);

    expect(await drainOutbox({ now: afterBackoff() })).toEqual({ processed: 1, failed: 0 });
    expect(attempts).toBe(2);
    expect(await listMessagesFor(personId)).toEqual([
      expect.objectContaining({ id: first?.id, status: "SENT", kind: "TRANSACTIONAL" }),
    ]);
    const [saved] = await db().select().from(message).where(eq(message.personId, personId));
    expect(saved?.dedupeKey).toBe(`access-grant:${personId}:${pending?.id}`);
    expect(saved?.error).toBeNull();
  });

  it("retoma solo el dispositivo transitorio aunque otro dispositivo y otra persona ya recibieron, y un vecino obliga a otro reintento", async () => {
    const ana = await seedMember("ana.parcial.reintento@eafit.edu.co");
    const bruno = await seedMember("bruno.parcial.reintento@eafit.edu.co");
    await subscribe(ana, "ana-acepta");
    await subscribe(ana, "ana-transitorio");
    await subscribe(bruno, "bruno-acepta");
    const sent: string[] = [];
    let down = true;
    setPushSenderForTests(async (subscription) => {
      sent.push(subscription.endpoint);
      return down && subscription.endpoint.endsWith("transitorio")
        ? { ok: false, gone: false, statusCode: 500, error: "servicio caído" }
        : { ok: true, statusCode: 201 };
    });
    await enqueueEvent(
      db(),
      eventOf(notificationRequested, {
        kind: "ANNOUNCEMENT",
        recipients: [{ personId: ana }, { personId: bruno }],
        title: "Aviso",
        body: "Un aviso de prueba",
        url: "/app",
        dedupeKey: "retry:parcial",
      }),
    );

    await drainOutbox({ expectFailures: [notificationRequested] });
    expect(sent).toHaveLength(3);
    expect(neighbourRuns).toBe(0);
    down = false;
    neighbourFailures = 1;
    await drainOutbox({ now: afterBackoff(), expectFailures: [notificationRequested] });
    expect(sent).toHaveLength(4);
    expect(sent.filter((value) => value === endpoint("ana-transitorio"))).toHaveLength(2);
    await drainOutbox({ now: afterBackoff(8) });
    expect(neighbourRuns).toBe(2);
    expect(sent).toHaveLength(4);
    expect((await db().select().from(message)).map((row) => row.status)).toEqual(["SENT", "SENT"]);
  });

  it.each([
    401, 403, 404, 410,
  ])("el rechazo permanente %i no se repite aunque falle un vecino; 404/410 además retiran la suscripción", async (statusCode) => {
    const personId = await seedMember("permanente.reintento@eafit.edu.co");
    await subscribe(personId, "permanente");
    let attempts = 0;
    setPushSenderForTests(async () => {
      attempts += 1;
      return {
        ok: false,
        gone: statusCode === 404 || statusCode === 410,
        statusCode,
        error: "rechazo permanente",
      };
    });
    await enqueueNotification(personId);
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [notificationRequested] });
    expect(await listSubscriptionsFor(personId)).toHaveLength(statusCode >= 404 ? 0 : 1);
    await drainOutbox({ now: afterBackoff() });
    expect(attempts).toBe(1);
    expect(neighbourRuns).toBe(2);
    expect(await listMessagesFor(personId)).toEqual([
      expect.objectContaining({ status: "FAILED" }),
    ]);
  });

  it("limpia el 410 antes de dejar pendiente otro dispositivo transitorio de la misma persona", async () => {
    const personId = await seedMember("limpieza.reintento@eafit.edu.co");
    await subscribe(personId, "vencido");
    await subscribe(personId, "transitorio");
    const attempts: string[] = [];
    let down = true;
    setPushSenderForTests(async (subscription) => {
      attempts.push(subscription.endpoint);
      if (subscription.endpoint.endsWith("vencido")) {
        return { ok: false, gone: true, statusCode: 410, error: "suscripción vencida" };
      }
      return down
        ? { ok: false, gone: false, statusCode: 429, error: "ráfaga" }
        : { ok: true, statusCode: 201 };
    });
    await enqueueNotification(personId);
    await drainOutbox({ expectFailures: [notificationRequested] });
    expect((await listSubscriptionsFor(personId)).map((row) => row.endpoint)).toEqual([
      endpoint("transitorio"),
    ]);
    down = false;
    await drainOutbox({ now: afterBackoff() });
    expect(attempts.filter((value) => value === endpoint("vencido"))).toHaveLength(1);
    expect(attempts.filter((value) => value === endpoint("transitorio"))).toHaveLength(2);
    expect((await listMessagesFor(personId))[0]?.status).toBe("SENT");
  });

  it.each([
    null,
    408,
  ])("la falta de respuesta o un HTTP %s se retoma, conservando el éxito del dispositivo anterior aunque el sender lance", async (statusCode) => {
    const personId = await seedMember("red.reintento@eafit.edu.co");
    await subscribe(personId, "exitoso");
    await subscribe(personId, "red");
    const attempts: string[] = [];
    let down = true;
    setPushSenderForTests(async (subscription) => {
      attempts.push(subscription.endpoint);
      if (down && subscription.endpoint.endsWith("red")) {
        if (statusCode === null) throw new Error("socket cerrado");
        return { ok: false, gone: false, statusCode, error: "sin respuesta" };
      }
      return { ok: true, statusCode: 201 };
    });
    await enqueueNotification(personId);
    await drainOutbox({ expectFailures: [notificationRequested] });
    const [initial] = await listMessagesFor(personId);
    down = false;
    await drainOutbox({ now: afterBackoff() });
    expect(attempts.filter((value) => value === endpoint("exitoso"))).toHaveLength(1);
    expect(attempts.filter((value) => value === endpoint("red"))).toHaveLength(2);
    expect((await listMessagesFor(personId))[0]?.sentAt).toEqual(initial?.sentAt);
  });

  it("agota cinco intentos y deja dead letter sin repetir el dispositivo que ya aceptó", async () => {
    const personId = await seedMember("limite.reintento@eafit.edu.co");
    await subscribe(personId, "aceptado");
    await subscribe(personId, "caido");
    const attempts: string[] = [];
    setPushSenderForTests(async (subscription) => {
      attempts.push(subscription.endpoint);
      return subscription.endpoint.endsWith("caido")
        ? { ok: false, gone: false, statusCode: 503, error: "servicio caído" }
        : { ok: true, statusCode: 201 };
    });
    await enqueueNotification(personId);
    let now = new Date();
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(await drainOutbox({ now, expectFailures: [notificationRequested] })).toEqual({
        processed: 0,
        failed: 1,
      });
      const [pending] = await db()
        .select()
        .from(outbox)
        .where(eq(outbox.eventType, notificationRequested.type));
      expect(pending?.attempts).toBe(attempt);
      if (attempt === 5) expect(pending?.deadLetterAt).not.toBeNull();
      now = pending?.nextAttemptAt ?? now;
    }
    expect(await drainOutbox({ now, expectFailures: [notificationRequested] })).toEqual({
      processed: 0,
      failed: 0,
    });
    expect(attempts.filter((value) => value === endpoint("aceptado"))).toHaveLength(1);
    expect(attempts.filter((value) => value === endpoint("caido"))).toHaveLength(5);
  });

  it("quitar el dispositivo pendiente no lo recrea y uno nuevo no recibe el aviso anterior", async () => {
    const personId = await seedMember("retirado.reintento@eafit.edu.co");
    const subscription = await subscribe(personId, "retirado");
    let attempts = 0;
    setPushSenderForTests(async () => {
      attempts += 1;
      return { ok: false, gone: false, statusCode: 500, error: "caído" };
    });
    await enqueueNotification(personId);
    await drainOutbox({ expectFailures: [notificationRequested] });
    await removeSubscriptionAs({ personId, ip: null }, { id: subscription.id });
    await subscribe(personId, "nuevo");
    await drainOutbox({ now: afterBackoff() });
    expect(attempts).toBe(1);
    expect((await db().select().from(pushDelivery))[0]?.subscriptionId).toBeNull();
    expect((await listSubscriptionsFor(personId)).map((row) => row.endpoint)).toEqual([
      endpoint("nuevo"),
    ]);
  });

  it("cada reintento respeta la preferencia vigente y el vencimiento del aviso", async () => {
    const personId = await seedMember("preferencia.reintento@eafit.edu.co");
    await subscribe(personId, "preferencia");
    let attempts = 0;
    setPushSenderForTests(async () => {
      attempts += 1;
      return { ok: false, gone: false, statusCode: 429, error: "ráfaga" };
    });
    await enqueueNotification(personId);
    await drainOutbox({ expectFailures: [notificationRequested] });
    await updatePreferencesAs(
      { personId, ip: null },
      { ...(await getPreferences(personId)), pushAnnouncements: false },
    );
    await drainOutbox({ now: afterBackoff() });
    expect(attempts).toBe(1);

    await enqueueNotification(personId, {
      kind: "TRANSACTIONAL",
      dedupeKey: "retry:vence",
      expiresAt: new Date(Date.now() + MINUTE).toISOString(),
    });
    await drainOutbox({ expectFailures: [notificationRequested] });
    expect(attempts).toBe(2);
    await drainOutbox({ now: afterBackoff() });
    expect(attempts).toBe(2);
  });

  it("anonimizar borra el detalle en cascada y el reintento no vuelve a enviar ni registra nada", async () => {
    const personId = await seedMember("anonima.reintento@eafit.edu.co");
    await subscribe(personId, "anonima");
    let attempts = 0;
    setPushSenderForTests(async () => {
      attempts += 1;
      return { ok: false, gone: false, statusCode: 500, error: "caído" };
    });
    await enqueueNotification(personId);
    await drainOutbox({ expectFailures: [notificationRequested] });
    expect(await db().select().from(pushDelivery)).toHaveLength(1);
    await requestDeletionAs({ personId, ip: null });
    await anonymizePersonAs({ personId: null, ip: null }, personId);
    await drainOutbox({ now: afterBackoff() });
    expect(attempts).toBe(1);
    expect(await db().select().from(pushDelivery)).toEqual([]);
    expect(await listMessagesFor(personId)).toEqual([]);
  });

  it("retirar un segundo dispositivo y reasignarlo mientras sale el primero impide enviarle el aviso de la persona anterior", async () => {
    const ana = await seedMember("ana.retiro.en.vuelo@eafit.edu.co");
    const bruno = await seedMember("bruno.retiro.en.vuelo@eafit.edu.co");
    await subscribe(ana, "primero");
    const second = await subscribe(ana, "segundo");
    const hold = deferred<void>();
    const entered = deferred<void>();
    const attempts: string[] = [];
    setPushSenderForTests(async (subscription) => {
      attempts.push(subscription.endpoint);
      if (subscription.endpoint.endsWith("primero")) {
        entered.resolve();
        await hold.promise;
      }
      return { ok: true, statusCode: 201 };
    });
    const sending = deliverNotification(request(ana));
    try {
      await entered.promise;
      await removeSubscriptionAs({ personId: ana, ip: null }, { id: second.id });
      await subscribe(bruno, "segundo");
    } finally {
      hold.resolve();
    }
    await sending;
    expect(attempts).toEqual([endpoint("primero")]);
  });

  it("un 410 confirmado queda limpio aunque falle el checkpoint del dispositivo siguiente", async () => {
    const personId = await seedMember("checkpoint.reintento@eafit.edu.co");
    await subscribe(personId, "vencido");
    await subscribe(personId, "siguiente");
    setPushSenderForTests(async (subscription) => {
      if (subscription.endpoint.endsWith("vencido"))
        return { ok: false, gone: true, statusCode: 410, error: "vencido" };
      await db().execute(sql`create function h4_fail_checkpoint() returns trigger language plpgsql as $$
        begin raise exception 'checkpoint sintético fallido'; end; $$`);
      await db().execute(
        sql`create trigger h4_fail_checkpoint before update on message for each row execute function h4_fail_checkpoint()`,
      );
      return { ok: true, statusCode: 201 };
    });
    try {
      await expect(deliverNotification(request(personId))).rejects.toThrow();
    } finally {
      await db().execute(sql`drop trigger if exists h4_fail_checkpoint on message`);
      await db().execute(sql`drop function if exists h4_fail_checkpoint()`);
    }
    setPushSenderForTests(async () => ({ ok: true, statusCode: 201 }));
    await deliverNotification(request(personId));
    expect((await listSubscriptionsFor(personId)).map((row) => row.endpoint)).toEqual([
      endpoint("siguiente"),
    ]);
    expect(
      (await db().select().from(pushDelivery)).find((row) => row.error?.includes("410"))
        ?.subscriptionId,
    ).toBeNull();
  });

  it("el alcance de un anuncio conserva todas las personas que recibieron aunque se reintente por un dispositivo y después por un vecino", async () => {
    const ana = await seedMember("ana.alcance.reintento@eafit.edu.co");
    const bruno = await seedMember("bruno.alcance.reintento@eafit.edu.co");
    await subscribe(ana, "ana-alcance");
    await subscribe(bruno, "bruno-alcance");
    let down = true;
    setPushSenderForTests(async (subscription) =>
      down && subscription.endpoint.endsWith("bruno-alcance")
        ? { ok: false, gone: false, statusCode: 500, error: "caído" }
        : { ok: true, statusCode: 201 },
    );
    const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createAnnouncement(ctx, {
        title: "Aviso con reintento",
        body: "Un aviso de prueba",
        audience: "MEMBERS",
        pinned: false,
      }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) => publishAndPushAnnouncement(ctx, id));
    await drainOutbox({ expectFailures: [announcementPushRequested] });
    down = false;
    neighbourFailures = 1;
    await drainOutbox({ now: afterBackoff(), expectFailures: [announcementPushRequested] });
    await drainOutbox({ now: afterBackoff(8) });
    expect((await getAnnouncement(id))?.pushCount).toBe(2);
  });

  it.each([
    "SENT",
    "FAILED",
  ] as const)("un mensaje histórico %s sin detalle conserva su id y solo el fallido vuelve a enviar", async (status) => {
    const personId = await seedMember("historico.reintento@eafit.edu.co");
    await subscribe(personId, "historico");
    const id = await recordMessage({
      personId,
      channel: "PUSH",
      kind: "ANNOUNCEMENT",
      subject: "Aviso",
      status,
      provider: "webpush",
      dedupeKey: "retry:aviso",
      sentAt: status === "SENT" ? new Date() : null,
    });
    let attempts = 0;
    setPushSenderForTests(async () => {
      attempts += 1;
      return { ok: true, statusCode: 201 };
    });
    await deliverNotification(request(personId));
    expect(attempts).toBe(status === "SENT" ? 0 : 1);
    expect(await listMessagesFor(personId)).toEqual([
      expect.objectContaining({ id, status: "SENT" }),
    ]);
    expect(await db().select().from(pushDelivery)).toHaveLength(status === "SENT" ? 0 : 1);
  });

  it("la reserva es visible antes del primer envío y cada éxito está confirmado antes del siguiente", async () => {
    const personId = await seedMember("durable.reintento@eafit.edu.co");
    await subscribe(personId, "durable-1");
    await subscribe(personId, "durable-2");
    const visible: string[][] = [];
    setPushSenderForTests(async () => {
      visible.push((await db().select().from(pushDelivery)).map((row) => row.status).sort());
      return { ok: true, statusCode: 201 };
    });
    await deliverNotification(request(personId));
    expect(visible).toEqual([
      ["FAILED", "FAILED"],
      ["FAILED", "SENT"],
    ]);
  });

  it("entrega y confirma con una sola conexión disponible sin pedir una segunda mientras retiene a la persona", async () => {
    const personId = await seedMember("pool.reintento@eafit.edu.co");
    await subscribe(personId, "pool");
    await closeDb();
    const pool = db().$client;
    pool.options.max = 1;
    pool.options.connectionTimeoutMillis = 150;
    setPushSenderForTests(async () => ({ ok: true, statusCode: 201 }));
    try {
      await expect(deliverNotification(request(personId))).resolves.toMatchObject({
        sent: 1,
        failed: 0,
      });
      expect(await listMessagesFor(personId)).toEqual([
        expect.objectContaining({ status: "SENT" }),
      ]);
    } finally {
      await closeDb();
    }
  });

  it("dos avisos de claves distintas que reciben 410 del mismo dispositivo lo limpian sin interbloquearse", async () => {
    const personId = await seedMember("dos.avisos.reintento@eafit.edu.co");
    await subscribe(personId, "dos-avisos");
    const hold = deferred<void>();
    let entered = 0;
    setPushSenderForTests(async () => {
      entered += 1;
      await hold.promise;
      return { ok: false, gone: true, statusCode: 410, error: "vencido" };
    });
    const first = deliverNotification(request(personId, { dedupeKey: "retry:primero" }));
    await expect.poll(() => entered).toBe(1);
    const second = deliverNotification(request(personId, { dedupeKey: "retry:segundo" }));
    try {
      await expect.poll(async () => entered === 2 || (await waitingForLock()) > 0).toBe(true);
    } finally {
      hold.resolve();
    }
    const results = await Promise.allSettled([first, second]);
    expect(results.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await listSubscriptionsFor(personId)).toEqual([]);
  });

  it("dos entregas simultáneas con la misma clave esperan el resultado confirmado y no duplican el push", async () => {
    const personId = await seedMember("simultanea.reintento@eafit.edu.co");
    await subscribe(personId, "simultaneo");
    const held = deferred<void>();
    const entered = deferred<void>();
    let attempts = 0;
    setPushSenderForTests(async () => {
      attempts += 1;
      entered.resolve();
      await held.promise;
      return { ok: true, statusCode: 201 };
    });
    const first = deliverNotification(request(personId));
    await entered.promise;
    const second = deliverNotification(request(personId));
    try {
      await expect.poll(waitingForLock).toBeGreaterThan(0);
    } finally {
      held.resolve();
    }
    const results = await Promise.all([first, second]);
    expect(attempts).toBe(1);
    expect(results.map((result) => result.alreadySent)).toEqual([0, 1]);
    expect(await db().select().from(message)).toHaveLength(1);
  });
});
