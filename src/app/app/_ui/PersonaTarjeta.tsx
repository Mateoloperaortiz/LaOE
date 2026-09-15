import {
  type AppointmentLabelInput,
  appointmentLabel,
  committeeRolesLabel,
  type MembershipStatus,
  type RoleView,
} from "@/modules/people";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { mediaUrl } from "@/shared/lib/media";

// Tarjeta de una persona en el directorio y en los comités internos: nombre, foto con consentimiento
// (o iniciales), comités con cargo y cargos de junta. Nunca correos ni celulares.

const STATUS_CODES: MembershipStatus[] = ["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"];

export function estadoEtiqueta(status: MembershipStatus): string {
  return tList("T-381")[STATUS_CODES.indexOf(status)] ?? status;
}

export function cargoEtiqueta(item: AppointmentLabelInput): string {
  return appointmentLabel(item);
}

/** "{cargos} de {comité}" (T-370): todos los cargos vivos, con codirección; Miembro si no hay ninguno. */
export function cargoEnComite(
  item: { roleLabel: string; roles: readonly RoleView[] },
  committeeName: string,
): string {
  return t("T-370", {
    cargo: committeeRolesLabel(item.roles, item.roleLabel),
    comité: committeeName,
  });
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
  equipos?: string[];
  /** Reconocimientos publicados ("Destacado de agosto"), solo con consentimiento de directorio. */
  insignias?: string[] | undefined;
  /** Insignias destacadas de la colección ("En parche · Nivel 1"), máximo tres (ADR-067 regla 9). */
  destacadas?: string[] | undefined;
};

export function PersonaTarjeta({
  nombre,
  fotoId,
  estado,
  comites,
  cargos,
  equipos = [],
  insignias = [],
  destacadas = [],
}: Props) {
  return (
    <article className="member-directory-card flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5">
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
      {destacadas.length > 0 ? (
        <ul aria-label={t("T-2502")} className="flex list-none flex-wrap gap-2 p-0">
          {destacadas.map((destacada) => (
            <li key={destacada}>
              <Insignia fondo="azul">{destacada}</Insignia>
            </li>
          ))}
        </ul>
      ) : null}
      {equipos.length ? (
        <div className="flex flex-col gap-1">
          <p className="eyebrow text-xs text-tinta-suave">{t("T-2383")}</p>
          <ul className="m-0 list-none space-y-1 p-0 text-sm">
            {equipos.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
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
