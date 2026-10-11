import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  countSubscriptionsFor,
  deliverNotification,
  listSubscriptionsFor,
  removeSubscriptionAs,
  saveSubscriptionAs,
  setPushSenderForTests,
} from "@/modules/comms";
import { resolveActor, signOut } from "@/modules/identity";
import { createSession } from "@/modules/identity/domain/session";
import { t } from "@/shared/copy";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Qué suscripción de push se guarda (ADR-113 regla 6), por la interfaz pública de `comms`.

const FCM = "https://fcm.googleapis.com/fcm/send/";
const MAX_DEVICES = 10;

function save(personId: string, endpoint: string, userAgent = "Chrome/140 Android", now?: Date) {
  return saveSubscriptionAs(
    { personId, ip: null },
    { endpoint, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } },
    userAgent,
    now,
  );
}

async function saveMany(personId: string, howMany: number): Promise<string[]> {
  const endpoints: string[] = [];
  for (let index = 0; index < howMany; index += 1) {
    const endpoint = `${FCM}dispositivo-${index}`;
    await save(personId, endpoint);
    endpoints.push(endpoint);
  }
  return endpoints;
}

function rejectedMessages(results: PromiseSettledResult<unknown>[]): string[] {
  return results.flatMap((result) =>
    result.status === "rejected" ? [(result.reason as Error).message] : [],
  );
}

describe("suscripciones de push", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("no guarda un endpoint que no sea https de un servicio de push conocido", async () => {
    const ana = await seedMember("ana.endpoint@eafit.edu.co");

    for (const endpoint of [
      "https://push.example/cualquiera",
      "http://fcm.googleapis.com/fcm/send/sin-tls",
      "https://169.254.169.254/latest/meta-data/",
      "https://localhost:3000/api/health",
      "https://fcm.googleapis.com.push.example/fcm/send/x",
      "https://push.example/?siguiente=https://fcm.googleapis.com/fcm/send/x",
      "https://fcm.googleapis.com@push.example/fcm/send/x",
      "https://fcm.googleapis.com:8443/fcm/send/x",
      "https://notify.windows.com/w/?token=x",
    ]) {
      await expect(save(ana, endpoint), endpoint).rejects.toThrow();
    }
    expect(await countSubscriptionsFor(ana)).toBe(0);
  });

  it("guarda el endpoint de cada servicio conocido", async () => {
    const ana = await seedMember("ana.servicios@eafit.edu.co");
    const endpoints = [
      `${FCM}cXVlLXBhc2E6QVBBOTFi`,
      "https://updates.push.services.mozilla.com/wpush/v2/gAAAAABm",
      "https://web.push.apple.com/QGkz1nJ2",
      "https://wns2-by3p.notify.windows.com/w/?token=BQYAAAC%2fx%2b",
    ];

    for (const endpoint of endpoints) {
      expect(await save(ana, endpoint)).toMatchObject({ created: true });
    }
    expect((await listSubscriptionsFor(ana)).map((item) => item.endpoint).sort()).toEqual(
      [...endpoints].sort(),
    );
  });

  it("un endpoint que ya es de otra persona no se reasigna", async () => {
    const ana = await seedMember("ana.dueña@eafit.edu.co");
    const bruno = await seedMember("bruno.ajeno@eafit.edu.co");
    const endpoint = `${FCM}compartido`;
    const before = new Date("2026-10-01T15:00:00Z");
    await save(ana, endpoint, "Firefox/130", before);

    await expect(
      save(bruno, endpoint, "Chrome/140 Android", new Date("2026-10-07T15:00:00Z")),
    ).rejects.toMatchObject({ message: t("T-3208") });

    expect(await listSubscriptionsFor(bruno)).toEqual([]);
    expect(await listSubscriptionsFor(ana)).toMatchObject([
      { endpoint, userAgent: "Firefox/130", lastSeenAt: before },
    ]);
    // Cuando su dueña lo quita, queda libre para quien lo registre.
    expect(await removeSubscriptionAs({ personId: ana, ip: null }, { endpoint })).toBe(true);
    expect(await save(bruno, endpoint)).toMatchObject({ created: true });
  });

  it("la misma persona vuelve a registrar su endpoint sin duplicarlo", async () => {
    const ana = await seedMember("ana.repite@eafit.edu.co");
    const endpoint = `${FCM}propio`;
    const first = await save(ana, endpoint, "Firefox/130", new Date("2026-10-01T15:00:00Z"));
    const later = new Date("2026-10-07T15:00:00Z");

    expect(await save(ana, endpoint, "Firefox/131", later)).toEqual({
      id: first.id,
      created: false,
    });
    expect(await listSubscriptionsFor(ana)).toMatchObject([
      { id: first.id, userAgent: "Firefox/131", lastSeenAt: later },
    ]);
  });

  it("una persona tiene hasta diez dispositivos", async () => {
    const ana = await seedMember("ana.tope@eafit.edu.co");
    const bruno = await seedMember("bruno.tope@eafit.edu.co");
    const endpoints = await saveMany(ana, MAX_DEVICES);

    await expect(save(ana, `${FCM}el-once`)).rejects.toMatchObject({ message: t("T-3209") });
    expect(await countSubscriptionsFor(ana)).toBe(MAX_DEVICES);

    // El tope es de cada persona, y volver a registrar uno propio no cuenta como nuevo.
    expect(await save(bruno, `${FCM}de-bruno`)).toMatchObject({ created: true });
    expect(await save(ana, endpoints[0] ?? "")).toMatchObject({ created: false });
    // Quitar uno deja entrar otro.
    expect(
      await removeSubscriptionAs({ personId: ana, ip: null }, { endpoint: endpoints[1] ?? "" }),
    ).toBe(true);
    expect(await save(ana, `${FCM}el-once`)).toMatchObject({ created: true });
    expect(await countSubscriptionsFor(ana)).toBe(MAX_DEVICES);
  });

  it("registros simultáneos de la misma persona no pasan del tope", async () => {
    const ana = await seedMember("ana.carrera@eafit.edu.co");
    await saveMany(ana, MAX_DEVICES - 2);
    // Conexiones ya abiertas: sin esto la primera transacción cierra antes de que las demás empiecen.
    await warmPool(6);

    const results = await Promise.allSettled(
      [1, 2, 3, 4, 5, 6].map((index) => save(ana, `${FCM}a-la-vez-${index}`)),
    );

    // Quedaban dos cupos: entran dos y los otros cuatro reciben el tope.
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    expect(rejectedMessages(results)).toEqual([1, 2, 3, 4].map(() => t("T-3209")));
    expect(await countSubscriptionsFor(ana)).toBe(MAX_DEVICES);
  });

  it("dos personas que registran el mismo endpoint a la vez: queda de una sola", async () => {
    const ana = await seedMember("ana.misma@eafit.edu.co");
    const bruno = await seedMember("bruno.misma@eafit.edu.co");
    const endpoint = `${FCM}disputado`;
    // Conexiones ya abiertas, para que las dos transacciones corran de verdad a la vez.
    await warmPool();

    const results = await Promise.allSettled([save(ana, endpoint), save(bruno, endpoint)]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(rejectedMessages(results)).toEqual([t("T-3208")]);
    expect((await countSubscriptionsFor(ana)) + (await countSubscriptionsFor(bruno))).toBe(1);
  });

  // Cerrar sesión retira el dispositivo (ADR-118 regla 17).

  async function openSession(personId: string): Promise<string> {
    const { token } = await createSession(getDb(), {
      personId,
      remember: false,
      userAgent: "Chrome/140 Android",
      ip: null,
    });
    return token;
  }

  /** A qué endpoints le escribe la casa un aviso para esa persona. */
  async function notified(personId: string): Promise<string[]> {
    const sent: string[] = [];
    setPushSenderForTests(async (subscription) => {
      sent.push(subscription.endpoint);
      return { ok: true, statusCode: 201 };
    });
    try {
      await deliverNotification({
        kind: "ANNOUNCEMENT",
        recipients: [{ personId }],
        title: "Anuncio nuevo",
        body: "Primera línea",
        url: "/cartelera/x",
        dedupeKey: `announcement:${personId}`,
      });
    } finally {
      setPushSenderForTests(undefined);
    }
    return sent.sort();
  }

  it("cerrar sesión retira el dispositivo de ese navegador y sus avisos dejan de llegarle", async () => {
    const ana = await seedMember("ana.salida@eafit.edu.co");
    await save(ana, `${FCM}equipo-compartido`);
    await save(ana, `${FCM}celular-de-ana`);
    const token = await openSession(ana);

    await signOut(token, { pushEndpoint: `${FCM}equipo-compartido`, ip: null });

    expect(await resolveActor(token)).toBeNull();
    expect((await listSubscriptionsFor(ana)).map((device) => device.endpoint)).toEqual([
      `${FCM}celular-de-ana`,
    ]);
    expect(await notified(ana)).toEqual([`${FCM}celular-de-ana`]);
  });

  it("cerrar sesión no retira el dispositivo de otra persona", async () => {
    const ana = await seedMember("ana.ajena@eafit.edu.co");
    const bruno = await seedMember("bruno.ajeno@eafit.edu.co");
    await save(bruno, `${FCM}celular-de-bruno`);
    const token = await openSession(ana);

    await signOut(token, { pushEndpoint: `${FCM}celular-de-bruno`, ip: null });

    expect(await resolveActor(token)).toBeNull();
    expect(await notified(bruno)).toEqual([`${FCM}celular-de-bruno`]);
  });

  it("un token que no abre ninguna sesión no retira nada, y salir sin dispositivo solo cierra la sesión", async () => {
    const ana = await seedMember("ana.token@eafit.edu.co");
    await save(ana, `${FCM}celular-de-ana`);
    const token = await openSession(ana);

    await signOut("un-token-que-no-existe", { pushEndpoint: `${FCM}celular-de-ana`, ip: null });
    expect(await resolveActor(token)).not.toBeNull();
    expect(await countSubscriptionsFor(ana)).toBe(1);

    await signOut(token, { pushEndpoint: null, ip: null });
    expect(await resolveActor(token)).toBeNull();
    expect(await countSubscriptionsFor(ana)).toBe(1);
  });
});
