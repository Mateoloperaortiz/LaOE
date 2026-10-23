import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activateSubscription,
  checkSubscription,
  saveSubscription,
} from "@/modules/comms/components/push-client";
import { readPushEndpoint } from "@/shared/ui/push-endpoint";

// El navegador se simula con lo mínimo de PushSubscription y ServiceWorkerRegistration: lo que se
// prueba es qué hace el cliente con cada respuesta de la casa (ADR-113 regla 6).

const KEY = new Uint8Array([4, 1, 2, 3]).buffer;

function subscription(endpoint: string, applicationServerKey: ArrayBuffer | null = KEY) {
  return {
    endpoint,
    options: { userVisibleOnly: true, applicationServerKey },
    toJSON: () => ({ endpoint, keys: { p256dh: "p".repeat(32), auth: "a".repeat(16) } }),
    unsubscribe: vi.fn(async () => true),
  };
}

function registration(renewed: unknown) {
  const subscribe = vi.fn(async () => {
    if (renewed instanceof Error) {
      throw renewed;
    }
    return renewed;
  });
  return { pushManager: { subscribe } };
}

/** La casa responde, en orden, con estos estados; devuelve los endpoints que recibió. */
function house(...statuses: number[]): string[] {
  const received: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: { body: string }) => {
      received.push((JSON.parse(init.body) as { endpoint: string }).endpoint);
      return new Response(null, { status: statuses.shift() ?? 500 });
    }),
  );
  return received;
}

describe("registrar la suscripción del navegador", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("guardada a la primera, no toca la suscripción del navegador", async () => {
    const received = house(200);
    const current = subscription("https://fcm.googleapis.com/fcm/send/actual");
    const sw = registration(null);

    expect(await saveSubscription(sw as never, current as never)).toBe(true);
    expect(received).toEqual([current.endpoint]);
    expect(current.unsubscribe).not.toHaveBeenCalled();
    expect(sw.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it("si el endpoint es de otra persona, suelta esa suscripción y registra una nueva", async () => {
    const received = house(409, 200);
    const current = subscription("https://fcm.googleapis.com/fcm/send/de-otra-persona");
    const renewed = subscription("https://fcm.googleapis.com/fcm/send/nueva");
    const sw = registration(renewed);

    expect(await saveSubscription(sw as never, current as never)).toBe(true);
    expect(current.unsubscribe).toHaveBeenCalledTimes(1);
    expect(sw.pushManager.subscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: KEY,
    });
    expect(received).toEqual([current.endpoint, renewed.endpoint]);
  });

  it("un rechazo que no es por dueño no renueva nada", async () => {
    for (const status of [400, 401, 500]) {
      const received = house(status);
      const current = subscription("https://fcm.googleapis.com/fcm/send/actual");
      const sw = registration(null);

      expect(await saveSubscription(sw as never, current as never)).toBe(false);
      expect(received).toHaveLength(1);
      expect(current.unsubscribe).not.toHaveBeenCalled();
      expect(sw.pushManager.subscribe).not.toHaveBeenCalled();
    }
  });

  it("si la nueva tampoco se guarda, o el navegador no la da, responde que no y no insiste", async () => {
    const twice = house(409, 409);
    const current = subscription("https://fcm.googleapis.com/fcm/send/de-otra-persona");
    const sw = registration(subscription("https://fcm.googleapis.com/fcm/send/nueva"));
    expect(await saveSubscription(sw as never, current as never)).toBe(false);
    expect(twice).toHaveLength(2);
    expect(sw.pushManager.subscribe).toHaveBeenCalledTimes(1);

    house(409);
    const blocked = subscription("https://fcm.googleapis.com/fcm/send/de-otra-persona");
    const failing = registration(new Error("NotAllowedError"));
    expect(await saveSubscription(failing as never, blocked as never)).toBe(false);
    expect(blocked.unsubscribe).toHaveBeenCalledTimes(1);

    const once = house(409);
    const keyless = subscription("https://fcm.googleapis.com/fcm/send/de-otra-persona", null);
    const unused = registration(null);
    expect(await saveSubscription(unused as never, keyless as never)).toBe(false);
    expect(keyless.unsubscribe).toHaveBeenCalledTimes(1);
    expect(unused.pushManager.subscribe).not.toHaveBeenCalled();
    expect(once).toHaveLength(1);
  });
});

// El panel de Ajustes no puede decir «este dispositivo recibe» solo porque el navegador tiene una
// suscripción local: si la casa no la conoce y tampoco acepta registrarla, es una suscripción huérfana
// y la persona no recibe nada (le pasaba a una miembro con iPhone: local sí, en el servidor nunca).

function registrationWith(current: unknown, renewed: unknown = null) {
  const subscribe = vi.fn(async () => {
    if (renewed instanceof Error) {
      throw renewed;
    }
    return renewed;
  });
  return {
    pushManager: {
      getSubscription: vi.fn(async () => current),
      subscribe,
    },
  };
}

describe("qué sabe la casa de la suscripción de este navegador", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sin suscripción local no hay dispositivo", async () => {
    house();
    const sw = registrationWith(null);
    expect(await checkSubscription(sw as never, [])).toBe("none");
  });

  it("si el servidor ya conoce el endpoint, está suscrito y no se vuelve a guardar", async () => {
    const received = house(200);
    const current = subscription("https://web.push.apple.com/conocida");
    const sw = registrationWith(current);

    expect(await checkSubscription(sw as never, [current.endpoint])).toBe("subscribed");
    expect(received).toHaveLength(0);
  });

  it("si el servidor no la conoce pero acepta registrarla, queda suscrito", async () => {
    const received = house(200);
    const current = subscription("https://web.push.apple.com/nueva-para-la-casa");
    const sw = registrationWith(current);

    expect(await checkSubscription(sw as never, [])).toBe("subscribed");
    expect(received).toEqual([current.endpoint]);
  });

  it("si el servidor no la conoce ni la acepta, es huérfana y no cuenta como suscrita", async () => {
    house(400);
    const current = subscription("https://web.push.apple.com/huerfana");
    const sw = registrationWith(current);

    expect(await checkSubscription(sw as never, [])).toBe("unregistered");
  });
});

describe("activar con el gesto de la persona", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const bytes = new Uint8Array([4, 9, 9]);

  it("sin suscripción local, pide una y la registra", async () => {
    const received = house(200);
    const fresh = subscription("https://web.push.apple.com/fresca");
    const sw = registrationWith(null, fresh);

    expect(await activateSubscription(sw as never, bytes as never)).toBe(true);
    expect(received).toEqual([fresh.endpoint]);
  });

  it("una huérfana se suelta y se reemplaza por una nueva registrable", async () => {
    const received = house(400, 200);
    const orphan = subscription("https://web.push.apple.com/huerfana");
    const fresh = subscription("https://web.push.apple.com/reemplazo");
    const sw = registrationWith(orphan, fresh);

    expect(await activateSubscription(sw as never, bytes as never)).toBe(true);
    expect(orphan.unsubscribe).toHaveBeenCalledTimes(1);
    expect(received).toEqual([orphan.endpoint, fresh.endpoint]);
  });

  it("si ni la nueva se guarda, responde que no y no insiste", async () => {
    const received = house(400, 500);
    const orphan = subscription("https://web.push.apple.com/huerfana");
    const fresh = subscription("https://web.push.apple.com/reemplazo");
    const sw = registrationWith(orphan, fresh);

    expect(await activateSubscription(sw as never, bytes as never)).toBe(false);
    expect(received).toHaveLength(2);
    expect(sw.pushManager.subscribe).toHaveBeenCalledTimes(1);
  });
});

// Cerrar sesión retira el dispositivo (ADR-118 regla 17): lo que hace el navegador antes de salir. Solo
// dice cuál es su suscripción; no la suelta.

const NEVER = new Promise<never>(() => {});

/** Un navegador con push cuyo service worker responde con esa suscripción. */
function browser(current: unknown) {
  vi.stubGlobal("window", { PushManager: {}, Notification: {} });
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: async () => ({ pushManager: { getSubscription: () => current } }),
    },
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("cerrar sesión en este navegador", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("devuelve el endpoint para que la casa retire el dispositivo y no suelta la suscripción del navegador: entrar la vuelve a registrar sin gesto (decisión abierta 43)", async () => {
    const current = subscription("https://fcm.googleapis.com/fcm/send/de-quien-sale");
    browser(current);

    expect(await readPushEndpoint()).toBe(current.endpoint);
    expect(current.unsubscribe).not.toHaveBeenCalled();
  });

  it("sin suscripción, o en un navegador sin push, no hay dispositivo que retirar", async () => {
    browser(null);
    expect(await readPushEndpoint()).toBeNull();

    vi.unstubAllGlobals();
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    expect(await readPushEndpoint()).toBeNull();
  });

  it("un navegador que no responde no frena la salida más que el plazo", async () => {
    vi.useFakeTimers();
    browser(NEVER);
    const silent = readPushEndpoint(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await silent).toBeNull();
  });

  it("los «Cerrar sesión» de la casa salen todos por el formulario que retira el dispositivo", () => {
    const callers = sourceFiles("src")
      .filter((path) => readFileSync(path, "utf8").includes("signOutAction"))
      .sort();

    expect(callers).toEqual([
      "src/modules/identity/actions.ts",
      "src/modules/identity/components/SignOutForm.tsx",
    ]);
    const forms = sourceFiles("src/app").filter((path) =>
      readFileSync(path, "utf8").includes("<SignOutForm>"),
    );
    expect(forms.sort()).toEqual([
      "src/app/admin/layout.tsx",
      "src/app/app/layout.tsx",
      "src/app/autorizacion/page.tsx",
    ]);
  });
});
