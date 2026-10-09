import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  releaseBrowserSubscription,
  saveSubscription,
} from "@/modules/comms/components/push-client";

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

// Cerrar sesión retira el dispositivo (ADR-118 regla 17): lo que hace el navegador antes de salir.

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

  it("suelta la suscripción del navegador y devuelve su endpoint para que la casa retire el dispositivo", async () => {
    const current = subscription("https://fcm.googleapis.com/fcm/send/de-quien-sale");
    browser(current);

    expect(await releaseBrowserSubscription()).toBe(current.endpoint);
    expect(current.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("sin suscripción, o en un navegador sin push, no hay dispositivo que retirar", async () => {
    browser(null);
    expect(await releaseBrowserSubscription()).toBeNull();

    vi.unstubAllGlobals();
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    expect(await releaseBrowserSubscription()).toBeNull();
  });

  it("si el navegador no logra soltarla, igual devuelve el endpoint: la casa retira la fila", async () => {
    const current = subscription("https://fcm.googleapis.com/fcm/send/de-quien-sale");
    current.unsubscribe.mockRejectedValue(new Error("AbortError"));
    browser(current);

    expect(await releaseBrowserSubscription()).toBe(current.endpoint);
  });

  it("un navegador que no responde no frena la salida más que el plazo", async () => {
    vi.useFakeTimers();
    browser(NEVER);
    const silent = releaseBrowserSubscription(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await silent).toBeNull();

    const current = subscription("https://fcm.googleapis.com/fcm/send/de-quien-sale");
    current.unsubscribe.mockReturnValue(NEVER);
    browser(current);
    const stuck = releaseBrowserSubscription(2000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await stuck).toBe(current.endpoint);
  });

  it("los «Cerrar sesión» de la casa salen todos por el formulario que retira el dispositivo", () => {
    const callers = sourceFiles("src")
      .filter((path) => readFileSync(path, "utf8").includes("signOutAction"))
      .sort();

    expect(callers).toEqual(["src/app/_lib/SignOutForm.tsx", "src/modules/identity/actions.ts"]);
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
