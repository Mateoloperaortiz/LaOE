"use client";

import { useEffect, useState } from "react";
import { MoonIcon } from "@/shared/ui/icons/MoonIcon";
import { SunIcon } from "@/shared/ui/icons/SunIcon";

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
      {tema === "dark" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
    </button>
  );
}
