"use client";

import { useEffect, useState } from "react";

// La consola de una ocasión en el proyector (ADR-181): el QR, el código rotativo y cuántos van
// registrados, en vivo por SSE (ADR-179). Nunca muestra nombres: está a la vista de todos.

export interface PresentationSnapshot {
  qrSvg: string;
  code: { value: string; secondsLeft: number } | null;
  counts: Record<string, number>;
}

export function PresentacionOcasion({
  occasionId,
  initial,
  labels,
}: {
  occasionId: string;
  initial: PresentationSnapshot;
  labels: { scan: string; registered: string };
}) {
  const [data, setData] = useState(initial);
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/ocasiones/${occasionId}/vivo`);
    source.onmessage = (event) => {
      try {
        const next = JSON.parse(event.data) as PresentationSnapshot;
        setData({ qrSvg: next.qrSvg, code: next.code, counts: next.counts });
      } catch {
        // Un evento mal formado no borra la pantalla.
      }
    };
    return () => source.close();
  }, [occasionId]);
  const registered = (data.counts.APPROVED ?? 0) + (data.counts.PENDING ?? 0);
  return (
    <div className="presentacion-qr">
      <div
        className="presentacion-qr-imagen"
        // El SVG lo arma el servidor con la dirección de registro (ADR-035): no trae nada del usuario.
        // biome-ignore lint/security/noDangerouslySetInnerHtml: SVG del QR generado en el servidor.
        dangerouslySetInnerHTML={{ __html: data.qrSvg }}
      />
      <div className="flex flex-col gap-6">
        <p className="presentacion-titulo">{labels.scan}</p>
        {data.code ? <p className="presentacion-codigo">{data.code.value}</p> : null}
        <p aria-live="polite">
          <span className="presentacion-cifra">{registered}</span> {labels.registered}
        </p>
      </div>
    </div>
  );
}
