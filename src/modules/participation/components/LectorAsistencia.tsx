"use client";

import { useRouter } from "next/navigation";
import { checkInPathFrom } from "@/shared/lib/occasion-public-id";
import { LectorCarnet } from "./LectorCarnet";

// El lector de «Asistencia» en Mi OE (ADR-160 regla 4): lee el QR que muestra el anfitrión y abre la
// pantalla de registro de siempre, `/a/<id público>`, en esta misma casa. No registra nada: el registro,
// el código rotativo y sus estados siguen en esa pantalla. Un QR que no es de una ocasión se rechaza
// con su mensaje y la cámara sigue leyendo.

type Labels = {
  scan: string;
  stop: string;
  upload: string;
  cameraError: string;
  photoError: string;
  scanError: string;
  /** El QR no es de una ocasión de la OE. */
  notOccasion: string;
};

export function LectorAsistencia({ labels }: { labels: Labels }) {
  const router = useRouter();
  const { notOccasion, ...reader } = labels;
  return (
    <LectorCarnet
      labels={reader}
      onScan={async (token) => {
        const path = checkInPathFrom(token, window.location.origin);
        if (!path) {
          return { ok: false, message: notOccasion };
        }
        router.push(path);
        return { ok: true, message: "" };
      }}
    />
  );
}
