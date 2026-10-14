import Link from "next/link";
import type { SanctionView } from "@/modules/people";
import { Bloque } from "@/shared/admin-kit/AdminFields";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate } from "@/shared/lib/dates";

/**
 * Faltas y sanciones de la pestaña Membresía (ADR-060 regla 6): cada sanción con su estado y, si la
 * membresía sigue viva, el camino para registrar otra o revocar una vigente. La suspensión se dice
 * con el texto de la ficha (T-3218), que no afirma que siga: el estado lo dice la insignia, y el
 * texto de Mi OE (T-2237) le habla a la persona suspendida (ADR-116 regla 13).
 */
export function Sanciones({
  personId,
  canRecord,
  sanctions,
}: {
  personId: string;
  /** Solo se sanciona a quien tiene la membresía viva (T-2244). */
  canRecord: boolean;
  sanctions: SanctionView[];
}) {
  const [sancionesTitulo, sinSanciones] = tList("T-2239");
  const [registrarSancion, revocarSancion] = tList("T-2232");
  const base = `/admin/personas/${personId}`;
  return (
    <Bloque titulo={sancionesTitulo}>
      {canRecord ? (
        <Link
          href={`${base}?pestana=membresia&accion=sancion`}
          className="boton-secundario min-h-9 self-start px-4 py-1 text-sm"
        >
          {registrarSancion}
        </Link>
      ) : null}
      {sanctions.length === 0 ? (
        <p className="text-sm text-tinta-suave">{sinSanciones}</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0 text-sm">
          {sanctions.map((item) => (
            <li key={item.id} className="flex flex-wrap items-baseline gap-2">
              <Insignia fondo={item.state === "LIVE" ? "naranja" : "paper"}>
                {item.stateLabel}
              </Insignia>
              <span className="font-semibold">{item.kindLabel}</span>
              <span className="text-tinta-suave">
                {formatDate(new Date(`${item.occurredOn}T12:00:00Z`))}
              </span>
              <span>· {item.cause}</span>
              {item.reference ? <span className="text-tinta-suave">· {item.reference}</span> : null}
              {item.committeeName ? (
                <span className="text-tinta-suave">· {item.committeeName}</span>
              ) : null}
              {item.suspendedUntil ? (
                <span className="text-tinta-suave">
                  ·{" "}
                  {t("T-3218", {
                    fecha: formatDate(new Date(`${item.suspendedUntil}T12:00:00Z`)),
                  })}
                </span>
              ) : null}
              {item.revokeReason ? (
                <span className="text-tinta-suave">· {item.revokeReason}</span>
              ) : null}
              {item.state === "LIVE" ? (
                <Link
                  href={`${base}?pestana=membresia&accion=revocar-sancion&sancion=${item.id}`}
                  className="underline"
                >
                  {revocarSancion}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Bloque>
  );
}
