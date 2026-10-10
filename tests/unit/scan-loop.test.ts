import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createStartGate,
  readPhoto,
  sendScan,
  startScanLoop,
} from "@/modules/participation/components/scan-loop";
import { t } from "@/shared/copy";

// El lector del carnet (ADR-118 regla 19): el sondeo con temporizadores falsos y el envío de una lectura.
// Y lo que decide con una foto y con un segundo toque a «Escanear» (ADR-120 regla 15).

const FAILED = t("T-3251");
const NO_CODE = t("T-617");
const UNREADABLE = t("T-3256");
const PHOTO = { unreadable: UNREADABLE, noCode: NO_CODE };

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
    // Lo que hace `createImageBitmap` con un HEIC en Chrome o con un archivo dañado.
    const broken = async (): Promise<string | null> => {
      throw new Error("InvalidStateError: The source image could not be decoded.");
    };

    expect(await readPhoto(broken, PHOTO)).toEqual({ kind: "error", message: UNREADABLE });
  });

  it("una foto que abre y no trae un QR responde el texto de siempre, y la que lo trae entrega su token", async () => {
    expect(await readPhoto(async () => null, PHOTO)).toEqual({ kind: "error", message: NO_CODE });
    expect(await readPhoto(async () => "", PHOTO)).toEqual({ kind: "error", message: NO_CODE });
    expect(await readPhoto(async () => "carnet-de-ana", PHOTO)).toEqual({
      kind: "token",
      token: "carnet-de-ana",
    });
  });

  it("dos toques a «Escanear» mientras el navegador pide el permiso abren una sola cámara", async () => {
    const start = createStartGate();
    let grant: () => void = () => {};
    const permission = new Promise<void>((resolve) => {
      grant = resolve;
    });
    // Como `getUserMedia`: cada llamada pide un flujo de video y espera a que la persona responda.
    const open = vi.fn(() => permission);

    const first = start(open);
    const second = start(open);

    expect(await second).toBe(false);
    grant();
    expect(await first).toBe(true);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("cuando el arranque termina, también si falló, «Escanear» vuelve a arrancar", async () => {
    const start = createStartGate();
    const denied = vi.fn(async () => {
      throw new Error("NotAllowedError");
    });
    const granted = vi.fn(async () => {});

    await expect(start(denied)).rejects.toThrow("NotAllowedError");

    expect(await start(granted)).toBe(true);
    expect(await start(granted)).toBe(true);
    expect(granted).toHaveBeenCalledTimes(2);
  });
});
