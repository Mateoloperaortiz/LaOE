import { APPOINTMENT_KINDS, type AppointmentKind, type MembershipStatus } from "@/modules/people";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { mediaUrl } from "@/shared/lib/media";

// Tarjeta de una persona en el directorio y en los comités internos: nombre, foto con consentimiento
// (o iniciales), comités con cargo y cargos de junta. Nunca correos ni celulares.

const STATUS_CODES: MembershipStatus[] = ["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"];

export function estadoEtiqueta(status: MembershipStatus): string {
  return tList("T-381")[STATUS_CODES.indexOf(status)] ?? status;
}

export function cargoEtiqueta(item: { kind: AppointmentKind; title: string | null }): string {
  const label = tList("T-444")[APPOINTMENT_KINDS.indexOf(item.kind)] ?? item.kind;
  return item.kind === "OTHER" && item.title ? item.title : label;
}

/** "{cargo} de {comité}" (T-370) para todos los cargos, también para Miembro. */
export function cargoEnComite(roleLabel: string, committeeName: string): string {
  return t("T-370", { cargo: roleLabel, comité: committeeName });
}

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((palabra) => palabra[0]?.toUpperCase() ?? "")
    .join("");
}

type Props = {
  nombre: string;
  fotoId: string | null;
  estado: MembershipStatus;
  /** Líneas ya formateadas, por ejemplo "General de A3". */
  comites: string[];
  cargos: string[];
  /** Reconocimientos publicados ("Destacado de agosto"), solo con consentimiento de directorio. */
  insignias?: string[] | undefined;
};

export function PersonaTarjeta({ nombre, fotoId, estado, comites, cargos, insignias = [] }: Props) {
  return (
    <article className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5">
      <div className="flex items-center gap-4">
        {fotoId ? (
          // biome-ignore lint/performance/noImgElement: ADR-022, los bytes no atraviesan la app
          <img
            src={mediaUrl(fotoId, 480)}
            alt={t("T-388", { nombre })}
            width={56}
            height={56}
            loading="lazy"
            className="size-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-oe-blue-soft font-bold text-oe-navy"
          >
            {iniciales(nombre)}
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-display-md leading-tight">{nombre}</h3>
          {estado !== "ACTIVE" ? (
            <span>
              <Insignia fondo="amarillo">{estadoEtiqueta(estado)}</Insignia>
            </span>
          ) : null}
        </div>
      </div>
      {comites.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {comites.map((linea) => (
            <li key={linea}>
              <Insignia fondo="sky">{linea}</Insignia>
            </li>
          ))}
        </ul>
      ) : null}
      {insignias.length > 0 ? (
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {insignias.map((insignia) => (
            <li key={insignia}>
              <Insignia fondo="naranja">{insignia}</Insignia>
            </li>
          ))}
        </ul>
      ) : null}
      {cargos.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="eyebrow text-xs text-tinta-suave">{t("T-374")}</p>
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {cargos.map((cargo) => (
              <li key={cargo}>
                <Insignia fondo="amarillo">{cargo}</Insignia>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
