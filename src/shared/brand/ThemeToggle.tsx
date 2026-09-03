"use client";

import { useEffect, useState } from "react";

type Tema = "light" | "dark";

const CLAVE = "oe-tema";

function temaActual(): Tema {
  const explicito = document.documentElement.getAttribute("data-theme");
  if (explicito === "dark" || explicito === "light") {
    return explicito;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

type Props = {
  /** Etiquetas accesibles: [cambiar a oscuro, cambiar a claro]. */
  etiquetas: [string, string];
};

export function ThemeToggle({ etiquetas }: Props) {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    setTema(temaActual());
    // Sin tema explícito, sigue a la preferencia del sistema si cambia.
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const alCambiar = () => setTema(temaActual());
    media.addEventListener("change", alCambiar);
    return () => media.removeEventListener("change", alCambiar);
  }, []);

  function alternar() {
    const siguiente: Tema = temaActual() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", siguiente);
    try {
      localStorage.setItem(CLAVE, siguiente);
    } catch {
      // Sin almacenamiento: el tema dura mientras la página esté abierta.
    }
    setTema(siguiente);
  }

  const etiqueta = tema === "dark" ? etiquetas[1] : etiquetas[0];
  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={etiqueta}
      title={etiqueta}
      className="inline-flex size-11 items-center justify-center rounded-full border-2 border-titulo text-titulo transition-colors hover:bg-fondo-suave"
    >
      {tema === "dark" ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4m11.4-11.4 1.4-1.4" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
