import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import {
  deliverNotification,
  getPreferences,
  listSubscriptionsFor,
  saveSubscriptionAs,
  setPushSenderForTests,
  updatePreferencesAs,
} from "@/modules/comms";
import { message, notificationPreference, pushSubscription } from "@/modules/comms/schema";
import { endMembership } from "@/modules/people";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

const db = () => getDb();

function keys() {
  return { p256dh: "p".repeat(32), auth: "a".repeat(16) };
}

async function subscribe(personId: string, endpoint: string) {
  return saveSubscriptionAs({ personId }, { endpoint, keys: keys() }, "Chrome/140 Android");
}

function request(personIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    kind: "ANNOUNCEMENT",
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
    await subscribe(ana, "https://push.example/ana-1");
    await subscribe(ana, "https://push.example/ana-2");
    await subscribe(bruno, "https://push.example/bruno");
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
    await subscribe(ana, "https://push.example/ana");
    await updatePreferencesAs(
      { personId: ana },
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
    await subscribe(ana, "https://push.example/vieja");
    await subscribe(ana, "https://push.example/viva");
    setPushSenderForTests(async (subscription) =>
      subscription.endpoint.endsWith("vieja")
        ? { ok: false, gone: true, error: "410 Gone" }
        : { ok: true, statusCode: 201 },
    );
    const stats = await deliverNotification(request([ana]));
    expect(stats).toMatchObject({ sent: 1, removedDevices: 1 });
    const left = await listSubscriptionsFor(ana);
    expect(left.map((item) => item.endpoint)).toEqual(["https://push.example/viva"]);

    setPushSenderForTests(async () => ({ ok: false, gone: false, error: "500" }));
    const failed = await deliverNotification(request([ana], { dedupeKey: "announcement:y" }));
    expect(failed).toMatchObject({ sent: 0, failed: 1 });
    const [row] = await db().select().from(message).where(eq(message.dedupeKey, "announcement:y"));
    expect(row).toMatchObject({ status: "FAILED", error: "500" });
  });

  it("sin VAPID el proveedor es console y el mensaje queda SENT; el handler del outbox lo entrega", async () => {
    const ana = await seedMember("ana.console@eafit.edu.co");
    await subscribe(ana, "https://push.example/consola");
    await enqueueEvent(db(), { type: "notification.requested", payload: request([ana]) });
    const result = await drain(10);
    expect(result).toEqual({ processed: 1, failed: 0 });
    const [row] = await db().select().from(message);
    expect(row).toMatchObject({ personId: ana, provider: "console", status: "SENT" });
  });

  it("el upsert por endpoint reasigna la persona y salir de la OE borra suscripciones y preferencias", async () => {
    const ana = await seedMember("ana.upsert@eafit.edu.co");
    const bruno = await seedMember("bruno.upsert@eafit.edu.co");
    const first = await subscribe(ana, "https://push.example/compartido");
    expect(first.created).toBe(true);
    const second = await subscribe(bruno, "https://push.example/compartido");
    expect(second).toEqual({ id: first.id, created: false });
    expect(await listSubscriptionsFor(ana)).toHaveLength(0);
    expect(await listSubscriptionsFor(bruno)).toHaveLength(1);
    await updatePreferencesAs(
      { personId: bruno },
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
    await drain(20);
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
