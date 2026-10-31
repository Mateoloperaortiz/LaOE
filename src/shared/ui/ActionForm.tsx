"use client";

import { useRouter } from "next/navigation";
import {
  type ComponentPropsWithRef,
  type SubmitEvent as ReactSubmitEvent,
  type RefObject,
  startTransition,
  useLayoutEffect,
  useRef,
} from "react";
import { useFormStatus } from "react-dom";
import { preservePageScroll } from "@/shared/lib/navigation-scroll";

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
  onSubmit,
  onSubmitCapture,
  ...props
}: ComponentPropsWithRef<"form">) {
  const router = useRouter();
  const position = useRef<Position | null>(null);

  function submit(event: ReactSubmitEvent<HTMLFormElement>) {
    onSubmit?.(event);
    if (event.defaultPrevented || typeof action === "function") return;
    const form = event.currentTarget;
    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    const method = (submitter?.getAttribute("formmethod") ?? form.method).toLowerCase();
    const target = (submitter?.getAttribute("formtarget") ?? form.target).toLowerCase();
    if (method !== "get" || (target && target !== "_self")) return;
    const href = submitter?.getAttribute("formaction") ?? form.getAttribute("action") ?? "";
    if (!preservePageScroll(href, location.pathname, location.origin)) return;
    const destination = new URL(href, location.href);
    const search = new URLSearchParams();
    // FormData conserva campos repetidos, controles habilitados y el botón que envió el GET.
    for (const [name, value] of new FormData(form, submitter)) {
      search.append(name, typeof value === "string" ? value : value.name);
    }
    // El GET nativo reemplaza la consulta de action con los controles del formulario.
    destination.search = search.toString();
    event.preventDefault();
    startTransition(() => {
      router.push(`${destination.pathname}${destination.search}${destination.hash}`, {
        scroll: false,
      });
    });
  }

  return (
    <form
      {...props}
      action={action}
      onSubmit={submit}
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
