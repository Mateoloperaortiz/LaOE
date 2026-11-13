"use client";

import { useEffect, useId, useState } from "react";

// La bienvenida a la barra nueva (ADR-160 regla 6): una tarjeta arriba de «Hoy», la primera vez que la
// persona ve la barra en este navegador, que dice dónde quedó cada cosa. No es modal: no tapa la barra
// que explica. Recordarla es una comodidad, no un dato: vive en `localStorage` y, sin almacenamiento,
// no se muestra (mejor nada que cada vez).

const SEEN_KEY = "oe.mi-oe.barra-nueva";

function alreadySeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "vista";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(SEEN_KEY, "vista");
  } catch {
    // Sin almacenamiento no hay nada que recordar.
  }
}

export function NewBarWelcome({
  title,
  text,
  button,
}: {
  title: string;
  text: string;
  button: string;
}) {
  const titleId = useId();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(!alreadySeen());
  }, []);
  if (!visible) {
    return null;
  }
  return (
    <section
      aria-labelledby={titleId}
      className="mb-6 flex flex-col items-start gap-3 rounded-tarjeta border border-superficie-borde bg-superficie p-5 sombra-flota sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id={titleId} className="titulo-seccion">
          {title}
        </h2>
        <p className="text-secundario text-tinta-secundaria">{text}</p>
      </div>
      <button
        type="button"
        className="boton-primario shrink-0"
        onClick={() => {
          markSeen();
          setVisible(false);
        }}
      >
        {button}
      </button>
    </section>
  );
}
