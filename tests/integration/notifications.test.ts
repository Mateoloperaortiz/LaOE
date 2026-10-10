import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { type NotificationRequested, notificationRequested } from "@/domain-events/comms";
import { eventOf } from "@/domain-events/define";
import {
  deliverNotification,
  getPreferences,
  listSubscriptionsFor,
  saveSubscriptionAs,
  setPushSenderForTests,
  updatePreferencesAs,
} from "@/modules/comms";
import { pushChallengePublished } from "@/modules/comms/domain/events";
import { message, notificationPreference, pushSubscription } from "@/modules/comms/schema";
import { endMembership } from "@/modules/people";
import { t } from "@/shared/copy";
import { captureLogs, recordsOf } from "../helpers/logs";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

const db = () => getDb();

function keys() {
  return { p256dh: "p".repeat(32), auth: "a".repeat(16) };
}

async function subscribe(personId: string, endpoint: string) {
  return saveSubscriptionAs(
    { personId, ip: null },
    { endpoint, keys: keys() },
    "Chrome/140 Android",
  );
}

function request(personIds: string[], overrides: Partial<NotificationRequested> = {}) {
  return {
    kind: "ANNOUNCEMENT" as const,
    recipients: personIds.map((personId) => ({ personId })),
    title: "Anuncio nuevo",
    body: "Primera línea",
    url: "/cartelera/x",
    dedupeKey: "announcement:x",
    ...overrides,
  };
}

describe("bus de notificaciones (ADR-038 regla 2)", () => {
  beforeEach(async () => {
    await truncateAll();
    setPushSenderForTests(undefined);
  });
  afterAll(async () => {
    setPushSenderForTests(undefined);
    await closeDb();
  });

  it("entrega una vez por persona aunque el evento se procese dos veces y registra un message por persona", async () => {
    const ana = await seedMember("ana.push@eafit.edu.co");
    const bruno = await seedMember("bruno.push@eafit.edu.co");
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/ana-1");
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/ana-2");
    await subscribe(bruno, "https://fcm.googleapis.com/fcm/send/bruno");
    const sent: string[] = [];
    setPushSenderForTests(async (subscription) => {
      sent.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
    const first = await deliverNotification(request([ana, bruno]));
    expect(first).toMatchObject({ sent: 2, failed: 0, alreadySent: 0, withoutDevice: 0 });
    expect(sent).toHaveLength(3);
    const second = await deliverNotification(request([ana, bruno]));
    expect(second).toMatchObject({ sent: 0, alreadySent: 2 });
    expect(sent).toHaveLength(3);
    const rows = await db().select().from(message);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.channel === "PUSH" && row.kind === "ANNOUNCEMENT")).toBe(true);
    expect(rows.every((row) => row.provider === "webpush" && row.status === "SENT")).toBe(true);
    expect(rows.every((row) => row.dedupeKey === "announcement:x")).toBe(true);
  });

  it("respeta la preferencia del tipo, no registra a quien no tiene dispositivo y lo transaccional llega siempre", async () => {
    const ana = await seedMember("ana.pref@eafit.edu.co");
    const sinDispositivo = await seedMember("sin.dispositivo@eafit.edu.co");
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/ana");
    await updatePreferencesAs(
      { personId: ana, ip: null },
      {
        emailCampaigns: true,
        pushAnnouncements: false,
        pushPoints: true,
        pushReminders: true,
        pushWordle: true,
      },
    );
    expect((await getPreferences(ana)).pushAnnouncements).toBe(false);
    setPushSenderForTests(async () => ({ ok: true, statusCode: 201 }));
    const stats = await deliverNotification(request([ana, sinDispositivo]));
    expect(stats).toMatchObject({ sent: 0, skippedByPreference: 1, withoutDevice: 1 });
    expect(await db().select().from(message)).toHaveLength(0);
    const transactional = await deliverNotification(
      request([ana], { kind: "TRANSACTIONAL", dedupeKey: "request:1" }),
    );
    expect(transactional.sent).toBe(1);
  });

  it("borra la suscripción que responde 410 y marca FAILED cuando ningún dispositivo aceptó", async () => {
    const ana = await seedMember("ana.gone@eafit.edu.co");
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/vieja");
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/viva");
    setPushSenderForTests(async (subscription) =>
      subscription.endpoint.endsWith("vieja")
        ? { ok: false, gone: true, statusCode: 410, error: "Received unexpected response code" }
        : { ok: true, statusCode: 201 },
    );
    const stats = await deliverNotification(request([ana]));
    expect(stats).toMatchObject({ sent: 1, removedDevices: 1 });
    const left = await listSubscriptionsFor(ana);
    expect(left.map((item) => item.endpoint)).toEqual(["https://fcm.googleapis.com/fcm/send/viva"]);

    setPushSenderForTests(async () => ({
      ok: false,
      gone: false,
      statusCode: 500,
      error: "Received unexpected response code",
    }));
    const failed = await deliverNotification(request([ana], { dedupeKey: "announcement:y" }));
    expect(failed).toMatchObject({ sent: 0, failed: 1 });
    const [row] = await db().select().from(message).where(eq(message.dedupeKey, "announcement:y"));
    expect(row).toMatchObject({
      status: "FAILED",
      error: "HTTP 500: Received unexpected response code",
    });
  });

  it("a un dispositivo guardado con una dirección que no es de un servicio de push conocido no se le envía", async () => {
    const ana = await seedMember("ana.vieja@eafit.edu.co");
    const bruno = await seedMember("bruno.viejo@eafit.edu.co");
    // Filas de antes de ADR-113 regla 6: hoy `saveSubscriptionAs` no las guardaría.
    await db()
      .insert(pushSubscription)
      .values([
        { personId: ana, endpoint: "http://169.254.169.254/latest/meta-data/", ...keys() },
        { personId: bruno, endpoint: "https://push.example/de-antes", ...keys() },
      ]);
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/ana-de-hoy");
    const sent: string[] = [];
    setPushSenderForTests(async (subscription) => {
      sent.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });

    const stats = await deliverNotification(request([ana, bruno]));

    expect(sent).toEqual(["https://fcm.googleapis.com/fcm/send/ana-de-hoy"]);
    // Bruno no tiene a dónde: cuenta como quien no tiene dispositivo y no deja mensaje.
    expect(stats).toMatchObject({ sent: 1, failed: 0, withoutDevice: 1, removedDevices: 0 });
    expect((await db().select().from(message)).map((row) => row.personId)).toEqual([ana]);
    // Las filas se quedan: no enviar se deshace sumando el servicio a la lista; borrar, no.
    const [left] = await db().select({ n: count() }).from(pushSubscription);
    expect(left?.n).toBe(3);
  });

  it("sin VAPID el proveedor es console y el mensaje queda SENT; el handler del outbox lo entrega", async () => {
    const ana = await seedMember("ana.console@eafit.edu.co");
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/consola");
    await enqueueEvent(db(), eventOf(notificationRequested, request([ana])));
    expect(await drainOutbox()).toEqual({ processed: 1, failed: 0 });
    const [row] = await db().select().from(message);
    expect(row).toMatchObject({ personId: ana, provider: "console", status: "SENT" });
  });

  // El endpoint completo es la credencial del dispositivo: el registro lleva solo el servicio, como
  // la línea de `PUSH_SERVICES` (ADR-118 regla 25, DT-262).
  it("sin VAPID el push de consola registra el servicio, no el endpoint ni las claves del dispositivo", async () => {
    const ana = await seedMember("ana.registro@eafit.edu.co");
    const endpoint = "https://fcm.googleapis.com/fcm/send/credencial-del-dispositivo";
    await subscribe(ana, endpoint);

    const { result, lines } = await captureLogs(() => deliverNotification(request([ana])));

    expect(result).toMatchObject({ sent: 1, failed: 0 });
    const [line] = recordsOf(lines, "push (consola)");
    expect(line?.push).toMatchObject({ host: "fcm.googleapis.com", title: "Anuncio nuevo" });
    expect(line?.push).not.toHaveProperty("endpoint");
    const written = lines.map((entry) => entry.line).join("\n");
    for (const secret of [endpoint, "credencial-del-dispositivo", keys().p256dh, keys().auth]) {
      expect(written).not.toContain(secret);
    }
  });

  it("un reto con una audiencia que comms no conoce no le llega a nadie; con ALL llega a los miembros", async () => {
    const ana = await seedMember("ana.audiencia@eafit.edu.co");
    await subscribe(ana, "https://fcm.googleapis.com/fcm/send/audiencia");
    const reto = {
      challengeId: "reto-1",
      termId: "termino-1",
      title: "Reto de prueba",
      kind: "MISSION",
      closesAt: "2026-10-01T00:00:00.000Z",
      audienceCommitteeIds: [],
      basePoints: 10,
    };
    const desconocida = await pushChallengePublished({ ...reto, audience: "AUDIENCIA_FUTURA" });
    expect(desconocida.sent).toBe(0);
    expect(await db().select().from(message)).toHaveLength(0);

    const todos = await pushChallengePublished({ ...reto, audience: "ALL" });
    expect(todos.sent).toBe(1);
  });

  it("el endpoint de otra persona no se reasigna y salir de la OE borra suscripciones y preferencias", async () => {
    const ana = await seedMember("ana.upsert@eafit.edu.co");
    const bruno = await seedMember("bruno.upsert@eafit.edu.co");
    const first = await subscribe(ana, "https://fcm.googleapis.com/fcm/send/compartido");
    expect(first.created).toBe(true);
    // ADR-113 regla 6: el mismo endpoint desde otra persona se rechaza y sigue siendo de quien era.
    await expect(
      subscribe(bruno, "https://fcm.googleapis.com/fcm/send/compartido"),
    ).rejects.toMatchObject({ message: t("T-3208") });
    expect(await listSubscriptionsFor(ana)).toHaveLength(1);
    expect(await listSubscriptionsFor(bruno)).toHaveLength(0);
    const own = await subscribe(bruno, "https://fcm.googleapis.com/fcm/send/de-bruno");
    expect(own.created).toBe(true);
    expect(await listSubscriptionsFor(bruno)).toHaveLength(1);
    await updatePreferencesAs(
      { personId: bruno, ip: null },
      {
        emailCampaigns: false,
        pushAnnouncements: true,
        pushPoints: true,
        pushReminders: true,
        pushWordle: true,
      },
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      endMembership(ctx, bruno, {
        endReason: "OTHER",
        memorialConsent: false,
        contactConsent: false,
      }),
    );
    await drainOutbox();
    const [subs] = await db()
      .select({ n: count() })
      .from(pushSubscription)
      .where(eq(pushSubscription.personId, bruno));
    const [prefs] = await db()
      .select({ n: count() })
      .from(notificationPreference)
      .where(eq(notificationPreference.personId, bruno));
    expect(subs?.n).toBe(0);
    expect(prefs?.n).toBe(0);
  });
});
