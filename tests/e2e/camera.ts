import type { Page } from "@playwright/test";

// La cámara del lector del carnet en la E2E (ADR-127 regla 5): un `getUserMedia` reemplazado en la
// página, que deja el permiso pendiente hasta que la prueba lo concede. Sin banderas de cámara falsa:
// el flujo sale de un canvas, y sus pistas dicen si la cámara quedó encendida (`live`) o apagada (`ended`).

type HeldCamera = {
  /** Cuántas veces pidió la página un flujo de video. */
  requests: number;
  /** Los flujos que ya se entregaron. La página no los puede soltar: la prueba mira sus pistas. */
  streams: MediaStream[];
  /** Un permiso por contestar por cada pedido que sigue esperando. */
  pending: (() => void)[];
};

type WithCamera = Window & { heldCamera: HeldCamera };

/** Antes de abrir la página: desde ahí todo `getUserMedia` espera a `grantCamera`. */
export async function holdCamera(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const held: HeldCamera = { requests: 0, streams: [], pending: [] };
    (window as unknown as WithCamera).heldCamera = held;
    const getUserMedia = () =>
      new Promise<MediaStream>((resolve) => {
        held.requests += 1;
        held.pending.push(() => {
          const canvas = document.createElement("canvas");
          canvas.width = 64;
          canvas.height = 64;
          const context = canvas.getContext("2d");
          const stream = canvas.captureStream();
          // Un cuadro nuevo cada tanto, mientras la cámara siga encendida: sin cuadros el video no arranca.
          let frame = 0;
          const paint = setInterval(() => {
            if (stream.getTracks().every((track) => track.readyState === "ended")) {
              clearInterval(paint);
              return;
            }
            frame += 1;
            if (context) {
              context.fillStyle = frame % 2 === 0 ? "#123" : "#321";
              context.fillRect(0, 0, canvas.width, canvas.height);
            }
          }, 50);
          held.streams.push(stream);
          resolve(stream);
        });
      });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });
}

/** La persona contesta el permiso: cada pedido que esperaba recibe su flujo de video. */
export async function grantCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const grant of (window as unknown as WithCamera).heldCamera.pending.splice(0)) {
      grant();
    }
  });
}

/** Cuántas veces pidió la cámara esta página. Vuelve a cero si la página se recarga. */
export function cameraRequests(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as WithCamera).heldCamera.requests);
}

/** El estado de cada pista de los flujos entregados: `live` es una cámara encendida. */
export function cameraTracks(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    (window as unknown as WithCamera).heldCamera.streams.flatMap((stream) =>
      stream.getTracks().map((track) => track.readyState),
    ),
  );
}
