import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createCamera,
  createStartGate,
  readPhoto,
  type ScanState,
  sendScan,
  startScanLoop,
} from "@/modules/participation/components/scan-loop";
import { t } from "@/shared/copy";

// El lector del carnet (ADR-118 regla 19): el sondeo con temporizadores falsos y el envío de una lectura.
// Y lo que decide con una foto y con un segundo toque a «Escanear» (ADR-120 regla 15). Abajo, la cámara:
// la secuencia de arranque que vivía en el componente (ADR-127 regla 5).

const FAILED = t("T-3251");
const NO_CODE = t("T-617");
const UNREADABLE = t("T-3256");
const PHOTO = { unreadable: UNREADABLE, noCode: NO_CODE };

/** Lo que hace `createImageBitmap` con un HEIC en Chrome o con un archivo dañado. */
async function broken(): Promise<string | null> {
  throw new Error("InvalidStateError: The source image could not be decoded.");
}

/**
 * La cámara del lector con el cableado del componente: `open` pide un flujo de video y lo deja en la
 * referencia, pisando el que hubiera, y `stop` detiene solo el de la referencia. `live` cuenta los flujos
 * que siguen encendidos, también los que ya nadie puede detener.
 */
function fakeCamera() {
  const opened: { live: boolean }[] = [];
  let current: { live: boolean } | null = null;
  return {
    open: async () => {
      current = { live: true };
      opened.push(current);
    },
    stop: () => {
      if (current) {
        current.live = false;
      }
      current = null;
    },
    live: () => opened.filter((stream) => stream.live).length,
  };
}

/** Un detector que tarda `ms` en responder y siempre ve el mismo carnet. */
function slowDetector(ms: number, token: string | null = "carnet-de-ana") {
  return vi.fn(() => new Promise<string | null>((resolve) => setTimeout(() => resolve(token), ms)));
}

describe("lector del carnet", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("dos lecturas solapadas del mismo carnet mandan una sola acción", async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    // Como en el componente: al llegar un token, el lector se detiene y lo manda.
    const stop = startScanLoop({
      read: slowDetector(250),
      intervalMs: 200,
      onToken: (token) => {
        stop();
        sent.push(token);
      },
    });

    await vi.advanceTimersByTimeAsync(2000);

    expect(sent).toEqual(["carnet-de-ana"]);
  });

  it("no arranca una lectura mientras la anterior sigue esperando al detector", async () => {
    vi.useFakeTimers();
    const read = slowDetector(950, null);
    const stop = startScanLoop({ read, intervalMs: 200, onToken: () => {} });

    await vi.advanceTimersByTimeAsync(1000);
    stop();

    expect(read).toHaveBeenCalledTimes(1);
  });

  it("lo que lea después de «Detener» se descarta", async () => {
    vi.useFakeTimers();
    const onToken = vi.fn();
    const stop = startScanLoop({ read: slowDetector(250), intervalMs: 200, onToken });

    await vi.advanceTimersByTimeAsync(300);
    stop();
    await vi.advanceTimersByTimeAsync(2000);

    expect(onToken).not.toHaveBeenCalled();
  });

  it("un detector que falla en un cuadro no detiene el lector", async () => {
    vi.useFakeTimers();
    const sent: string[] = [];
    const read = vi
      .fn<() => Promise<string | null>>()
      .mockRejectedValueOnce(new Error("InvalidStateError"))
      .mockResolvedValue("carnet-de-ana");
    startScanLoop({ read, intervalMs: 200, onToken: (token) => void sent.push(token) });

    await vi.advanceTimersByTimeAsync(1000);

    expect(sent).toEqual(["carnet-de-ana"]);
  });

  it("si la acción rechaza, queda un error con el texto del inventario y el lector vuelve a estar listo", async () => {
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });

    const state = await sendScan(offline, "carnet-de-ana", FAILED, () => {});

    // «error» pinta role=alert y no deshabilita el botón de escanear: solo «busy» lo hace.
    expect(state).toEqual({ kind: "error", message: FAILED });
  });

  it("la respuesta de la acción pasa tal cual, y una señal del framework no se convierte en error", async () => {
    const registered = async () => ({ ok: true, message: "Ana quedó registrada." });
    expect(await sendScan(registered, "carnet-de-ana", FAILED, () => {})).toEqual({
      kind: "result",
      ok: true,
      message: "Ana quedó registrada.",
    });

    const redirect = new Error("NEXT_REDIRECT");
    const rethrow = (error: unknown) => {
      if (error === redirect) throw error;
    };
    const expired = async () => {
      throw redirect;
    };
    await expect(sendScan(expired, "carnet-de-ana", FAILED, rethrow)).rejects.toBe(redirect);
  });

  it("una foto que el navegador no puede abrir deja un error con su texto del inventario", async () => {
    expect(await readPhoto(broken, PHOTO, () => {})).toEqual({
      kind: "error",
      message: UNREADABLE,
    });
  });

  it("una foto que abre y no trae un QR responde el texto de siempre, y la que lo trae entrega su token", async () => {
    const off = () => {};
    expect(await readPhoto(async () => null, PHOTO, off)).toEqual({
      kind: "error",
      message: NO_CODE,
    });
    expect(await readPhoto(async () => "", PHOTO, off)).toEqual({
      kind: "error",
      message: NO_CODE,
    });
    expect(await readPhoto(async () => "carnet-de-ana", PHOTO, off)).toEqual({
      kind: "token",
      token: "carnet-de-ana",
    });
  });

  it("con la cámara encendida, una foto la apaga antes de responder: la que no abre, la que no trae un QR y la que trae su token", async () => {
    // Un error pinta el botón de «Escanear» en vez del de «Detener»: con la cámara todavía encendida nadie
    // la detiene y el sondeo sigue mandando lecturas debajo del error.
    const left: number[] = [];
    for (const decode of [broken, async () => null, async () => "carnet-de-ana"]) {
      const camera = fakeCamera();
      await createStartGate()(camera.open, camera.stop);

      await readPhoto(decode, PHOTO, camera.stop);

      left.push(camera.live());
    }

    expect(left).toEqual([0, 0, 0]);
  });

  it("dos toques a «Escanear» mientras el navegador pide el permiso abren una sola cámara", async () => {
    const start = createStartGate();
    let grant: () => void = () => {};
    const permission = new Promise<void>((resolve) => {
      grant = resolve;
    });
    // Como `getUserMedia`: cada llamada pide un flujo de video y espera a que la persona responda.
    const open = vi.fn(() => permission);
    const stop = vi.fn();

    const first = start(open, stop);
    const second = start(open, stop);

    expect(open).toHaveBeenCalledTimes(1);
    expect(await second).toBe(false);
    grant();
    expect(await first).toBe(true);
    // El toque que la guardia frenó no apaga nada: la cámara del primero está arrancando.
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("un toque a «Escanear» con una cámara que quedó encendida la apaga antes de abrir otra", async () => {
    const camera = fakeCamera();
    const start = createStartGate();
    await start(camera.open, camera.stop);

    // El arranque ya terminó y la guardia deja pasar: el botón todavía no cambió a «Detener».
    await start(camera.open, camera.stop);

    expect(camera.live()).toBe(1);
  });

  it("cuando el arranque termina, también si falló, «Escanear» vuelve a arrancar", async () => {
    const start = createStartGate();
    const off = () => {};
    const denied = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const granted = vi.fn(async () => {});

    await expect(start(denied, off)).rejects.toThrow("NotAllowedError");

    expect(await start(granted, off)).toBe(true);
    expect(await start(granted, off)).toBe(true);
    expect(granted).toHaveBeenCalledTimes(2);
  });
});

/** Un flujo de video como el de `getUserMedia`: una pista que se puede apagar. */
function fakeStream() {
  let live = true;
  return {
    live: () => live,
    getTracks: () => [
      {
        stop: () => {
          live = false;
        },
      },
    ],
  };
}

type FakeStream = ReturnType<typeof fakeStream>;

/** Una espera que la prueba resuelve cuando quiere: el permiso de la cámara, o el video que arranca. */
function held<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: Error) => void = () => {};
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Los pasos que el componente le pasa a la cámara, con lo que el lector pintó y el sondeo que arrancó. */
function wiring(
  open: (() => Promise<FakeStream>) | null,
  attach: (stream: FakeStream) => Promise<boolean> = async () => true,
) {
  const shown: ScanState[] = [];
  const stopPoll = vi.fn();
  const steps = {
    open,
    attach: vi.fn(attach),
    poll: vi.fn(() => stopPoll),
    show: (state: ScanState) => void shown.push(state),
    cameraError: NO_CODE,
  };
  return { steps, shown, stopPoll };
}

describe("cámara del lector del carnet", () => {
  it("un arranque sin interrupciones pide el flujo, lo engancha al video, pinta «Detener» y arranca el sondeo, en ese orden", async () => {
    const stream = fakeStream();
    const order: string[] = [];

    await createCamera<FakeStream>().start({
      open: async () => {
        order.push("pide el flujo");
        return stream;
      },
      attach: async (given) => {
        order.push(given === stream ? "engancha el flujo al video" : "engancha otro flujo");
        return true;
      },
      poll: () => {
        order.push("arranca el sondeo");
        return () => {};
      },
      show: (state) => void order.push(`pinta ${state.kind}`),
      cameraError: NO_CODE,
    });

    expect(order).toEqual([
      "pide el flujo",
      "engancha el flujo al video",
      "pinta scanning",
      "arranca el sondeo",
    ]);
    expect(stream.live()).toBe(true);
  });

  it("detener apaga el sondeo y el flujo, y detener otra vez no tiene nada que apagar", async () => {
    const stream = fakeStream();
    const camera = createCamera<FakeStream>();
    const { steps, stopPoll } = wiring(async () => stream);
    await camera.start(steps);

    camera.stop();

    expect(stopPoll).toHaveBeenCalledTimes(1);
    expect(stream.live()).toBe(false);
    camera.stop();
    expect(stopPoll).toHaveBeenCalledTimes(1);
  });

  it("sin cómo pedir la cámara, o con el permiso negado, queda el error de la cámara y nada se engancha", async () => {
    const denied = async (): Promise<FakeStream> => {
      throw new Error("NotAllowedError");
    };
    for (const open of [null, denied]) {
      const { steps, shown } = wiring(open);

      await createCamera<FakeStream>().start(steps);

      expect(shown).toEqual([{ kind: "error", message: NO_CODE }]);
      expect(steps.attach).not.toHaveBeenCalled();
      expect(steps.poll).not.toHaveBeenCalled();
    }
  });

  it("un permiso que se niega después de detener el lector pinta igual el error de la cámara", async () => {
    // Conducta de hoy, conservada: qué ve quien sube una foto y después niega el permiso espera la
    // decisión abierta 76 (DT-254, inciso f).
    const permission = held<FakeStream>();
    const camera = createCamera<FakeStream>();
    const { steps, shown } = wiring(() => permission.promise);
    const starting = camera.start(steps);

    camera.stop();
    permission.reject(new Error("NotAllowedError"));
    await starting;

    expect(shown).toEqual([{ kind: "error", message: NO_CODE }]);
  });

  it("si el video no arranca, el arranque falla sin pintar nada y la cámara sigue encendida hasta que detienen el lector", async () => {
    // Conducta de hoy, conservada (DT-254, inciso g): el flujo queda guardado, y lo apaga el siguiente
    // toque a «Escanear» o salir de la pantalla. No espera una decisión: apagar el flujo y pintar el error
    // de la cámara que ya existe es otro ticket, que invierte esta prueba.
    const stream = fakeStream();
    const camera = createCamera<FakeStream>();
    const { steps, shown } = wiring(
      async () => stream,
      async () => {
        throw new Error("AbortError");
      },
    );

    await expect(camera.start(steps)).rejects.toThrow("AbortError");

    expect(shown).toEqual([]);
    expect(steps.poll).not.toHaveBeenCalled();
    expect(stream.live()).toBe(true);
    camera.stop();
    expect(stream.live()).toBe(false);
  });

  it("si el lector se detuvo mientras el navegador pedía el permiso, el flujo que llega se apaga y no arranca el sondeo: al salir de la pantalla y con una foto", async () => {
    // Lo que detiene el lector durante la espera: la limpieza del componente y la foto, que apaga la cámara
    // antes de responder (ADR-120 regla 15).
    const interruptions = [
      async (stop: () => void) => stop(),
      async (stop: () => void) => void (await readPhoto(broken, PHOTO, stop)),
    ];
    const left: { live: boolean; shown: ScanState[]; attached: number; polls: number }[] = [];
    for (const interrupt of interruptions) {
      const permission = held<FakeStream>();
      const stream = fakeStream();
      const camera = createCamera<FakeStream>();
      const { steps, shown } = wiring(() => permission.promise);
      // Como en el componente: el toque pasa por la guardia, que apaga lo que hubiera antes de arrancar.
      const starting = createStartGate()(() => camera.start(steps), camera.stop);

      await interrupt(camera.stop);
      permission.resolve(stream);
      await starting;

      left.push({
        live: stream.live(),
        shown,
        attached: steps.attach.mock.calls.length,
        polls: steps.poll.mock.calls.length,
      });
    }

    const off = { live: false, shown: [], attached: 0, polls: 0 };
    expect(left).toEqual([off, off]);
  });

  it("después de una foto que detuvo el lector, otro toque a «Escanear» con el permiso todavía pendiente no arranca nada, y cuando el permiso llega la cámara no enciende: arranca con el toque siguiente", async () => {
    // Lo que ve el anfitrión desde el arreglo (ADR-127 regla 5): tiene que tocar «Escanear» otra vez.
    // Antes la cámara arrancaba sola al llegar el permiso, encima de lo que la foto había dejado, que
    // era el defecto (DT-254, inciso e).
    const permission = held<FakeStream>();
    const first = fakeStream();
    const second = fakeStream();
    const camera = createCamera<FakeStream>();
    const start = createStartGate();
    const ask = vi.fn(() => permission.promise);
    const pending = wiring(ask);
    const starting = start(() => camera.start(pending.steps), camera.stop);
    await readPhoto(broken, PHOTO, camera.stop);

    // La guardia sigue cerrada: el primer arranque no terminó, porque el navegador no ha contestado.
    const refused = start(() => camera.start(pending.steps), camera.stop);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(await refused).toBe(false);
    permission.resolve(first);
    expect(await starting).toBe(true);

    expect(first.live()).toBe(false);
    expect(pending.shown).toEqual([]);
    expect(pending.steps.poll).not.toHaveBeenCalled();

    const again = wiring(async () => second);
    expect(await start(() => camera.start(again.steps), camera.stop)).toBe(true);
    expect(again.shown).toEqual([{ kind: "scanning" }]);
    expect(second.live()).toBe(true);
  });

  it("si lo detienen mientras el video arranca, la cámara queda apagada y el lector no pinta «Detener» ni arranca el sondeo", async () => {
    const attaching = held<void>();
    const playing = held<boolean>();
    const stream = fakeStream();
    const camera = createCamera<FakeStream>();
    const { steps, shown } = wiring(
      async () => stream,
      () => {
        attaching.resolve();
        return playing.promise;
      },
    );
    const starting = camera.start(steps);
    await attaching.promise;

    camera.stop();
    playing.resolve(true);
    await starting;

    expect(stream.live()).toBe(false);
    expect(shown).toEqual([]);
    expect(steps.poll).not.toHaveBeenCalled();
  });

  it("un flujo que llega sin video donde engancharlo se apaga", async () => {
    const stream = fakeStream();
    const { steps, shown } = wiring(
      async () => stream,
      async () => false,
    );

    await createCamera<FakeStream>().start(steps);

    expect(stream.live()).toBe(false);
    expect(shown).toEqual([]);
    expect(steps.poll).not.toHaveBeenCalled();
  });

  it("el flujo de un arranque detenido que llega tarde no toca la cámara del arranque siguiente", async () => {
    const late = held<FakeStream>();
    const first = fakeStream();
    const second = fakeStream();
    const camera = createCamera<FakeStream>();
    const stale = wiring(() => late.promise);
    const fresh = wiring(async () => second);
    const starting = camera.start(stale.steps);
    camera.stop();
    await camera.start(fresh.steps);

    late.resolve(first);
    await starting;

    expect([first.live(), second.live()]).toEqual([false, true]);
    expect(stale.shown).toEqual([]);
    expect(stale.steps.attach).not.toHaveBeenCalled();
    expect(fresh.shown).toEqual([{ kind: "scanning" }]);
    expect(fresh.stopPoll).not.toHaveBeenCalled();
    // Y detener sigue apagando la que quedó encendida, con su sondeo.
    camera.stop();
    expect(second.live()).toBe(false);
    expect(fresh.stopPoll).toHaveBeenCalledTimes(1);
  });
});
