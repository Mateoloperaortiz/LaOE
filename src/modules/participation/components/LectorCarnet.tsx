"use client";

import jsQR from "jsqr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Lector del QR del carnet en modo anfitrión (ADR-035 regla 8): BarcodeDetector nativo si existe,
// jsQR sobre un canvas si no; foto como respaldo. El token solo lo valida el servidor.

type Labels = {
  scan: string;
  stop: string;
  upload: string;
  cameraError: string;
};

type ScanResult = { ok: boolean; message: string };

type Props = {
  labels: Labels;
  onScan: (token: string) => Promise<ScanResult>;
};

type State =
  | { kind: "idle" }
  | { kind: "scanning" }
  | { kind: "busy" }
  | { kind: "result"; ok: boolean; message: string }
  | { kind: "error"; message: string };

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
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });

  function stop() {
    if (timer.current !== null) {
      window.clearInterval(timer.current);
      timer.current = null;
    }
    for (const track of stream.current?.getTracks() ?? []) {
      track.stop();
    }
    stream.current = null;
  }

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearInterval(timer.current);
      }
      for (const track of stream.current?.getTracks() ?? []) {
        track.stop();
      }
    },
    [],
  );

  async function handleToken(token: string) {
    stop();
    setState({ kind: "busy" });
    const result = await onScan(token);
    setState({ kind: "result", ok: result.ok, message: result.message });
    router.refresh();
  }

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState({ kind: "error", message: labels.cameraError });
      return;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch {
      setState({ kind: "error", message: labels.cameraError });
      return;
    }
    const element = video.current;
    if (!element) {
      return;
    }
    element.srcObject = stream.current;
    await element.play();
    setState({ kind: "scanning" });
    const detector = window.BarcodeDetector
      ? new window.BarcodeDetector({ formats: ["qr_code"] })
      : null;
    timer.current = window.setInterval(async () => {
      const source = video.current;
      const target = canvas.current;
      if (!source || !target || source.readyState < 2) {
        return;
      }
      let token: string | null = null;
      if (detector) {
        const codes = await detector.detect(source).catch(() => []);
        token = codes[0]?.rawValue ?? null;
      } else {
        target.width = source.videoWidth;
        target.height = source.videoHeight;
        target.getContext("2d")?.drawImage(source, 0, 0);
        token = decodeCanvas(target);
      }
      if (token) {
        await handleToken(token);
      }
    }, 200);
  }

  async function fromFile(file: File) {
    const target = canvas.current;
    if (!target) {
      return;
    }
    const bitmap = await createImageBitmap(file);
    target.width = bitmap.width;
    target.height = bitmap.height;
    target.getContext("2d")?.drawImage(bitmap, 0, 0);
    const token = decodeCanvas(target);
    if (token) {
      await handleToken(token);
    } else {
      setState({ kind: "error", message: labels.cameraError });
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
              stop();
              setState({ kind: "idle" });
            }}
          >
            {labels.stop}
          </button>
        ) : (
          <button
            type="button"
            className="boton-calido"
            onClick={start}
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
