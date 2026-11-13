"use client";

import { useEffect, useState } from "react";
import styles from "./tabla-en-vivo.module.css";

// La tabla general de The Games en vivo por SSE (ADR-179, ADR-181): la misma pieza va en la sala de
// operación y, en grande, en la pantalla de presentación. Sin flujo, se queda con lo que llegó.

export interface LiveStandingRow {
  rank: number;
  teamId: string;
  number: number;
  name: string;
  color: string | null;
  points: number;
}

type Props = {
  url: string;
  initial: LiveStandingRow[];
  labels: { points: string; empty: string };
  big?: boolean;
};

export function TablaEnVivo({ url, initial, labels, big = false }: Props) {
  const [rows, setRows] = useState(initial);
  useEffect(() => {
    if (typeof EventSource === "undefined") return;
    const source = new EventSource(url);
    source.onmessage = (event) => {
      try {
        setRows(JSON.parse(event.data) as LiveStandingRow[]);
      } catch {
        // Un evento mal formado no borra la tabla.
      }
    };
    return () => source.close();
  }, [url]);
  if (rows.length === 0) return <p>{labels.empty}</p>;
  return (
    <ol className={styles.tabla} data-grande={big ? "true" : undefined} aria-live="polite">
      {rows.map((row) => (
        <li key={row.teamId} className={styles.fila}>
          <span className={styles.puesto}>{row.rank}</span>
          <span
            className={styles.color}
            aria-hidden="true"
            style={{ background: row.color ?? "currentColor" }}
          />
          <span className={styles.nombre}>
            {row.number} · {row.name}
          </span>
          <span className={styles.puntos}>
            {row.points} <span className={styles.unidad}>{labels.points}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
