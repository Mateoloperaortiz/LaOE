import type { ReactNode } from "react";
import { AlertCircleIcon } from "@/shared/ui/icons/AlertCircleIcon";

// Los estados de una pantalla de trabajo (plan maestro §6.2, con el aspecto de ADR-163; tramo R6-C):
// cargando, vacío y error con reintento. El cuarto, el éxito, es un `Banner` o, si es grande, la pantalla
// de marca. Ninguno trae textos: lo que se lee llega por props.

/** Un bloque gris que guarda el lugar de lo que todavía no llega. No se anima con movimiento reducido. */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block rounded-[0.5rem] bg-relleno motion-safe:animate-pulse ${className}`.trim()}
    />
  );
}

const SHAPES = {
  lista: (index: number) => (
    <div key={index} className="flex items-center gap-3 py-2">
      <Skeleton className="size-9 shrink-0 rounded-control" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Skeleton className={`h-3.5 ${index % 2 ? "w-2/3" : "w-4/5"}`} />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  ),
  tabla: (index: number) => (
    <div key={index} className="flex h-10 items-center gap-4 border-b border-linea-tenue px-3">
      <Skeleton className="size-4 shrink-0" />
      <Skeleton className={`h-3.5 ${index % 2 ? "w-1/3" : "w-1/4"}`} />
      <Skeleton className="h-3.5 w-1/6" />
      <Skeleton className="ml-auto h-3.5 w-12" />
    </div>
  ),
  tarjetas: (index: number) => (
    <div key={index} className="flex flex-col gap-3 rounded-tarjeta border border-linea-tenue p-4">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-3/5" />
    </div>
  ),
} as const;

/**
 * Cargando: la forma de lo que viene, para que la pantalla no salte al llegar. Se anuncia una vez con
 * `label` y queda `aria-busy` mientras dura.
 */
export function LoadingState({
  label,
  shape = "lista",
  rows = 4,
  className = "",
}: {
  label: string;
  shape?: keyof typeof SHAPES;
  rows?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy="true"
      className={`${shape === "tarjetas" ? "grid gap-3 sm:grid-cols-2" : "flex flex-col"} ${className}`.trim()}
    >
      <output className="sr-only">{label}</output>
      {Array.from({ length: rows }, (_, index) => SHAPES[shape](index))}
    </div>
  );
}

type TitleTag = "p" | "h1" | "h2" | "h3";

/** El título de un estado: un párrafo dentro de una sección, o el `h1` cuando el estado es la pantalla. */
function StateTitle({
  as: Tag = "p",
  children,
}: {
  as?: TitleTag | undefined;
  children: ReactNode;
}) {
  return <Tag className={Tag === "h1" ? "titulo-pantalla" : "titulo-tarjeta"}>{children}</Tag>;
}

const TILE = {
  neutral: "bg-relleno text-tinta-secundaria",
  exito: "bg-exito-fondo text-exito",
} as const;

/** Vacío: qué no hay, por qué está bien o qué hacer, y a lo sumo una acción. */
export function EmptyState({
  icon,
  tone = "neutral",
  title,
  titleAs,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  tone?: keyof typeof TILE;
  title: ReactNode;
  titleAs?: TitleTag;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-2 py-6 ${className}`.trim()}>
      {icon ? (
        <span
          aria-hidden="true"
          className={`mb-1 flex size-10 items-center justify-center rounded-full ${TILE[tone]}`}
        >
          {icon}
        </span>
      ) : null}
      <StateTitle as={titleAs}>{title}</StateTitle>
      {description ? (
        <p className="max-w-prose text-secundario text-tinta-secundaria">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/**
 * Error al cargar: qué pasó y qué hacer, con su icono además del color, y la acción de reintentar que
 * pasa quien lo usa. Se anuncia como alerta, porque aparece después de un intento.
 */
export function ErrorState({
  title,
  titleAs,
  description,
  action,
  className = "",
}: {
  title: ReactNode;
  titleAs?: TitleTag;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div role="alert" className={`flex flex-col items-start gap-2 py-6 ${className}`.trim()}>
      <span
        aria-hidden="true"
        className="mb-1 flex size-10 items-center justify-center rounded-full bg-error-fondo text-error"
      >
        <AlertCircleIcon size={20} />
      </span>
      <StateTitle as={titleAs}>{title}</StateTitle>
      {description ? (
        <p className="max-w-prose text-secundario text-tinta-secundaria">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
