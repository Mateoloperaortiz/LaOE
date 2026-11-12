import type { ReactNode } from "react";
import { AlertCircleIcon } from "@/shared/ui/icons/AlertCircleIcon";
import { AlertTriangleIcon } from "@/shared/ui/icons/AlertTriangleIcon";
import { CircleCheckIcon } from "@/shared/ui/icons/CircleCheckIcon";
import { InfoCircleIcon } from "@/shared/ui/icons/InfoCircleIcon";

// Aviso de estado de la capa funcional (ADR-158 regla 4). Un estado nunca se indica solo con color:
// lleva icono y texto. Error y éxito usan sus colores nuevos; aviso e información, los del manual,
// siempre con texto navy, también en tema oscuro. Con el aspecto sobrio no lleva borde y su título
// baja a peso 600 (ADR-163 reglas 3 y 7).

type Tone = "error" | "exito" | "aviso" | "info";

const TONE: Record<
  Tone,
  { box: string; accent: string; body: string; Icon: typeof InfoCircleIcon }
> = {
  error: {
    box: "bg-error-fondo",
    accent: "text-error",
    body: "text-tinta",
    Icon: AlertCircleIcon,
  },
  exito: {
    box: "bg-exito-fondo",
    accent: "text-exito",
    body: "text-tinta",
    Icon: CircleCheckIcon,
  },
  aviso: {
    box: "bg-aviso-fondo",
    accent: "text-estado-tinta",
    body: "text-estado-tinta",
    Icon: AlertTriangleIcon,
  },
  info: {
    box: "bg-info-fondo",
    accent: "text-estado-tinta",
    body: "text-estado-tinta",
    Icon: InfoCircleIcon,
  },
};

export function Banner({
  tone,
  title,
  children,
  className = "",
}: {
  tone: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { box, accent, body, Icon } = TONE[tone];
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-control p-4 text-cuerpo ${box} ${body} ${className}`.trim()}
    >
      <span className={`mt-0.5 ${accent}`}>
        <Icon size={20} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        {title ? <p className={`font-semibold ${accent}`}>{title}</p> : null}
        {children ? <div>{children}</div> : null}
      </div>
    </div>
  );
}
