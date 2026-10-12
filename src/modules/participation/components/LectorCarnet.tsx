"use client";

import jsQR from "jsqr";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  createCamera,
  createStartGate,
  readPhoto,
  type ScanResult,
  type ScanState,
  sendScan,
  startScanLoop,
} from "./scan-loop";

// Lector del QR del carnet en modo anfitrión (ADR-035 regla 8): BarcodeDetector nativo si existe,
// jsQR sobre un canvas si no; foto como respaldo. El token solo lo valida el servidor. El sondeo y el
// envío viven en `scan-loop.ts` (ADR-118 regla 19): una lectura a la vez y un rechazo con su mensaje.
// También lo que decide con una foto y con un segundo toque a «Escanear» (ADR-120 regla 15): los dos
// reciben `camera.stop`, porque una foto apaga la cámara antes de responder y un arranque, antes de abrir
// otra. Y la cámara misma (`createCamera`): acá quedan solo los pasos que tocan el DOM.

type Labels = {
  scan: string;
  stop: string;
  upload: string;
  cameraError: string;
  /** El navegador no pudo abrir la foto: un formato que no lee o un archivo dañado. */
  photoError: string;
  /** La acción no respondió: se cayó la red o el servidor falló. */
  scanError: string;
};

type Props = {
  labels: Labels;
  onScan: (token: string) => Promise<ScanResult>;
};

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement | HTMLCanvasElement): Promise<DetectedBarcode[]>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats: string[] }) => BarcodeDetectorLike;
  }
}

function decodeCanvas(canvas: HTMLCanvasElement): string | null {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return null;
  }
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height)?.data ?? null;
}

export function LectorCarnet({ labels, onScan }: Props) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [camera] = useState(() => createCamera<MediaStream>());
  const [startOnce] = useState(createStartGate);
  const [state, setState] = useState<ScanState>({ kind: "idle" });

  // Salir de la pantalla detiene el lector, como «Detener»: apaga la cámara y cancela el arranque que
  // siga esperando el permiso, que es cuando todavía no hay un flujo que apagar (ADR-127 regla 5).
  useEffect(() => camera.stop, [camera]);

  async function handleToken(token: string) {
    camera.stop();
    setState({ kind: "busy" });
    const next = await sendScan(onScan, token, labels.scanError, unstable_rethrow);
    setState(next);
    if (next.kind === "result") {
      router.refresh();
    }
  }

  function start() {
    const media = navigator.mediaDevices;
    return camera.start({
      open: media?.getUserMedia
        ? () => media.getUserMedia({ video: { facingMode: "environment" }, audio: false })
        : null,
      attach: async (stream) => {
        const element = video.current;
        if (!element) {
          return false;
        }
        element.srcObject = stream;
        await element.play();
        return true;
      },
      poll: () => {
        const detector = window.BarcodeDetector
          ? new window.BarcodeDetector({ formats: ["qr_code"] })
          : null;
        return startScanLoop({
          intervalMs: 200,
          read: async () => {
            const source = video.current;
            const target = canvas.current;
            if (!source || !target || source.readyState < 2) {
              return null;
            }
            if (detector) {
              const codes = await detector.detect(source);
              return codes[0]?.rawValue ?? null;
            }
            target.width = source.videoWidth;
            target.height = source.videoHeight;
            target.getContext("2d")?.drawImage(source, 0, 0);
            return decodeCanvas(target);
          },
          onToken: (token) => void handleToken(token),
        });
      },
      show: setState,
      cameraError: labels.cameraError,
    });
  }

  async function fromFile(file: File) {
    const target = canvas.current;
    if (!target) {
      return;
    }
    const photo = await readPhoto(
      async () => {
        const bitmap = await createImageBitmap(file);
        target.width = bitmap.width;
        target.height = bitmap.height;
        target.getContext("2d")?.drawImage(bitmap, 0, 0);
        return decodeCanvas(target);
      },
      { unreadable: labels.photoError, noCode: labels.cameraError },
      camera.stop,
    );
    if (photo.kind === "token") {
      await handleToken(photo.token);
    } else {
      setState(photo);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        {state.kind === "scanning" ? (
          <button
            type="button"
            className="boton-secundario"
            onClick={() => {
              camera.stop();
              setState({ kind: "idle" });
            }}
          >
            {labels.stop}
          </button>
        ) : (
          <button
            type="button"
            className="boton-calido"
            onClick={() => void startOnce(start, camera.stop)}
            disabled={state.kind === "busy"}
          >
            {labels.scan}
          </button>
        )}
        <label className="boton-secundario cursor-pointer">
          <span>{labels.upload}</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void fromFile(file);
              }
              event.target.value = "";
            }}
          />
        </label>
      </div>
      <video
        ref={video}
        playsInline
        muted
        className={`w-full max-w-md rounded-[var(--radius-cartel)] bg-black ${state.kind === "scanning" ? "" : "hidden"}`}
      >
        <track kind="captions" />
      </video>
      <canvas ref={canvas} className="hidden" />
      {state.kind === "result" ? (
        <output className={`block text-lg font-semibold ${state.ok ? "" : "text-oe-orange"}`}>
          {state.message}
        </output>
      ) : null}
      {state.kind === "error" ? (
        <p role="alert" className="text-oe-orange">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
