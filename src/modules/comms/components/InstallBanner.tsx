"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "oe-aviso-notificaciones";

type Props = {
  title: string;
  text: string;
  button: string;
  dismiss: string;
  href: string;
};

// Aviso del inicio de Mi OE para quien no tiene ningún dispositivo con notificaciones (ADR-038 regla 5):
// se oculta por dispositivo con localStorage hasta que la persona lo cierre o active el push.
export function InstallBanner({ title, text, button, dismiss, href }: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(KEY) !== "1");
    } catch {
      setVisible(true);
    }
  }, []);
  if (!visible) {
    return null;
  }
  return (
    <section
      aria-label={title}
      className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-cartel)] bg-oe-yellow p-5 text-oe-navy textura-granito"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-display-md">{title}</h2>
        <p className="max-w-prose text-sm">{text}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={href} className="boton-primario text-sm">
          {button}
        </Link>
        <button
          type="button"
          className="text-sm font-semibold underline"
          onClick={() => {
            try {
              window.localStorage.setItem(KEY, "1");
            } catch {
              // Sin almacenamiento el aviso vuelve la próxima vez.
            }
            setVisible(false);
          }}
        >
          {dismiss}
        </button>
      </div>
    </section>
  );
}
