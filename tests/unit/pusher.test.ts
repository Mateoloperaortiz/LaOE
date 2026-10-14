import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendPush } from "@/shared/adapters/pusher";

// Lo que el adaptador de push devuelve cuando el servicio rechaza un envío (ADR-118 regla 25). La
// librería rechaza toda respuesta que no sea 2xx con el mismo mensaje, «Received unexpected response
// code», y deja el código en una propiedad del error: el adaptador lo descartaba, y un 401 de una
// clave VAPID mala quedaba igual que un 500 del servicio. El error es el de la librería de verdad.

const webPush = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: webPush }));
vi.mock("@/env", () => ({
  getEnv: () => ({
    VAPID_PUBLIC_KEY: "publica-sintetica",
    VAPID_PRIVATE_KEY: "privada-sintetica",
    VAPID_SUBJECT: "mailto:prueba@example.invalid",
  }),
}));

const { WebPushError } = await vi.importActual<typeof import("web-push")>("web-push");

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/credencial-del-dispositivo";
const subscription = { endpoint: ENDPOINT, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } };
const payload = { title: "Aviso", body: "Cuerpo", url: "/app" };

/** El rechazo tal como lo arma la librería: mensaje fijo, y el código, el cuerpo y el endpoint aparte. */
const rejected = (statusCode: number) =>
  new WebPushError(
    "Received unexpected response code",
    statusCode,
    {},
    '{"reason":"BadJwtToken"}',
    ENDPOINT,
  );

describe("el adaptador de push cuando el servicio rechaza", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each([
    401, 403, 413, 429, 500,
  ])("un %i vuelve con su código de respuesta y no pide borrar el dispositivo", async (statusCode) => {
    webPush.sendNotification.mockRejectedValue(rejected(statusCode));
    expect(await sendPush(subscription, payload)).toEqual({
      ok: false,
      gone: false,
      statusCode,
      error: "Received unexpected response code",
    });
  });

  it.each([
    404, 410,
  ])("un %i vuelve con su código y pide borrar el dispositivo, que ya no existe", async (statusCode) => {
    webPush.sendNotification.mockRejectedValue(rejected(statusCode));
    expect(await sendPush(subscription, payload)).toMatchObject({
      ok: false,
      gone: true,
      statusCode,
    });
  });

  it("un servicio que no respondió vuelve sin código, con el motivo de la red", async () => {
    webPush.sendNotification.mockRejectedValue(
      Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
    );
    expect(await sendPush(subscription, payload)).toEqual({
      ok: false,
      gone: false,
      statusCode: null,
      error: "socket hang up",
    });
  });

  it("lo que devuelve no trae el endpoint ni las claves del dispositivo, que sí vienen en el error de la librería", async () => {
    webPush.sendNotification.mockRejectedValue(rejected(403));
    const written = JSON.stringify(await sendPush(subscription, payload));
    expect(written).not.toContain("credencial-del-dispositivo");
    expect(written).not.toContain(subscription.keys.p256dh);
    expect(written).not.toContain(subscription.keys.auth);
    expect(written).not.toContain("BadJwtToken");
  });

  it("un envío aceptado vuelve con el código del servicio", async () => {
    webPush.sendNotification.mockResolvedValue({ statusCode: 201, body: "", headers: {} });
    expect(await sendPush(subscription, payload)).toEqual({ ok: true, statusCode: 201 });
  });
});
