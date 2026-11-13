// Un solo lector para la casa (ADR-191 regla 7): el QR del carnet y el Code 128 de las etiquetas.
// Usa el lector nativo del navegador cuando existe y entiende el formato; si no, como en Safari de
// iPhone, la librería ZXing, que se carga solo cuando se abre la cámara.

export type Lectura = (texto: string) => void;

export interface LectorAbierto {
  detener: () => void;
}

interface NativeDetector {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}

interface NativeDetectorClass {
  new (options?: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

const FORMATOS = ["code_128", "qr_code"];

async function detectorNativo(): Promise<NativeDetector | null> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (!Native) return null;
  try {
    const soportados = (await Native.getSupportedFormats?.()) ?? [];
    const formatos = FORMATOS.filter((formato) => soportados.includes(formato));
    return formatos.includes("code_128") ? new Native({ formats: formatos }) : null;
  } catch {
    return null;
  }
}

/** Abre la cámara trasera en `video` y llama a `alLeer` con cada código, hasta que se detenga. */
export async function abrirLector(
  video: HTMLVideoElement,
  alLeer: Lectura,
): Promise<LectorAbierto> {
  const nativo = await detectorNativo();
  if (nativo) {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    let activo = true;
    const ciclo = window.setInterval(async () => {
      if (!activo || video.readyState < 2) return;
      try {
        for (const leido of await nativo.detect(video)) alLeer(leido.rawValue);
      } catch {
        // Un cuadro que no se pudo leer no detiene el lector.
      }
    }, 250);
    return {
      detener: () => {
        activo = false;
        window.clearInterval(ciclo);
        for (const track of stream.getTracks()) track.stop();
        video.srcObject = null;
      },
    };
  }
  const { BrowserMultiFormatReader } = await import("@zxing/browser");
  const lector = new BrowserMultiFormatReader(undefined, {
    delayBetweenScanAttempts: 250,
    delayBetweenScanSuccess: 1200,
  });
  const controles = await lector.decodeFromConstraints(
    { video: { facingMode: "environment" }, audio: false },
    video,
    (resultado) => {
      if (resultado) alLeer(resultado.getText());
    },
  );
  return {
    detener: () => {
      controles.stop();
      const stream = video.srcObject;
      if (stream instanceof MediaStream) for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}
