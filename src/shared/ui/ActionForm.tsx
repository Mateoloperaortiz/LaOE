"use client";

import { type ComponentPropsWithRef, type RefObject, useLayoutEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

type Position = {
  pathname: string;
  hash: string;
  x: number;
  y: number;
  release(): void;
};

function discard(position: RefObject<Position | null>) {
  position.current?.release();
  position.current = null;
}

function capture(position: RefObject<Position | null>) {
  discard(position);
  const followScroll = () => {
    const saved = position.current;
    if (!saved) return;
    saved.x = window.scrollX;
    saved.y = window.scrollY;
  };
  // El scroll del documento también puede venir de la barra o de tecnología de asistencia.
  // Los de elementos internos no burbujean hasta window.
  window.addEventListener("scroll", followScroll, { passive: true });
  position.current = {
    pathname: location.pathname,
    hash: location.hash,
    x: window.scrollX,
    y: window.scrollY,
    release: () => {
      window.removeEventListener("scroll", followScroll);
    },
  };
}

function restore(position: RefObject<Position | null>) {
  const saved = position.current;
  discard(position);
  if (!saved) return;
  // Después de los efectos de la navegación, antes de que el navegador pinte o emita scroll.
  queueMicrotask(() => {
    if (location.pathname !== saved.pathname || location.hash !== saved.hash) return;
    const focused = document.activeElement;
    // Un error puede enfocar el campo que hay que corregir: se conserva esa ayuda.
    if (focused?.matches('[aria-invalid="true"], [role="alert"]')) return;
    window.scrollTo({ left: saved.x, top: saved.y, behavior: "instant" });
  });
}

function ActionScroll({ position }: { position: RefObject<Position | null> }) {
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useLayoutEffect(() => {
    if (pending) wasPending.current = true;
    else if (wasPending.current) {
      wasPending.current = false;
      restore(position);
    }
  }, [pending, position]);
  // Una redirección de la acción puede desmontar el formulario antes de terminar el envío.
  useLayoutEffect(
    () => () => {
      if (wasPending.current) restore(position);
      else discard(position);
    },
    [position],
  );
  return null;
}

/** Un guardado en la misma página conserva el lugar; otra ruta mantiene su navegación normal. */
export function ActionForm({
  action,
  children,
  onSubmitCapture,
  ...props
}: ComponentPropsWithRef<"form">) {
  const position = useRef<Position | null>(null);
  return (
    <form
      {...props}
      action={action}
      onSubmitCapture={(event) => {
        onSubmitCapture?.(event);
        if (event.defaultPrevented || typeof action !== "function") return;
        capture(position);
      }}
    >
      <ActionScroll position={position} />
      {children}
    </form>
  );
}
