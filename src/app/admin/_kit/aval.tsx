import type { EventApprovalDetail, RiskLevel } from "@/modules/finance";
import { riskLevelLabel } from "@/modules/finance";
import { tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";

// Piezas del aval de evento que comparten «Avales», la página de finanzas del comité y la hoja para
// imprimir (ADR-197 reglas 1 y 2): el semáforo, el aviso del rojo y la historia de versiones.

const RISK_TONE = { GREEN: "exito", YELLOW: "aviso", RED: "error" } as const;

export function RiesgoBadge({ level }: { level: RiskLevel | null }) {
  if (!level) {
    const [, , sinSemaforo] = tList("T-5103");
    return <span className="text-tinta-secundaria">{sinSemaforo}</span>;
  }
  return (
    <Badge tone={RISK_TONE[level]} className="whitespace-nowrap">
      {riskLevelLabel(level)}
    </Badge>
  );
}

/** El rojo enlaza el protocolo de crisis publicado en la Normativa (ADR-197 regla 2). */
export function RiesgoRojo({ protocol }: { protocol: { id: string } | null }) {
  const [titulo, texto, enlace, sinProtocolo] = tList("T-5105");
  return (
    <Banner tone="aviso" title={titulo}>
      <p>{texto}</p>
      {protocol ? (
        <p>
          <Link href={`/app/normativa/${protocol.id}`}>{enlace}</Link>
        </p>
      ) : (
        <p>{sinProtocolo}</p>
      )}
    </Banner>
  );
}

/** La historia del aval, de la versión 1 a lo último, con quién hizo cada paso. */
export function AvalHistoria({
  entries,
  names,
  headingId,
}: {
  entries: EventApprovalDetail["entries"];
  names: Map<string, string>;
  headingId: string;
}) {
  const [titulo, enviada, devuelto, semaforo] = tList("T-5108");
  const [, porQue] = tList("T-5103");
  const day = (key: string) => formatDate(new Date(`${key}T12:00:00Z`));
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h3 id={headingId} className="text-sm font-semibold">
        {titulo}
      </h3>
      <ol className="m-0 flex list-none flex-col gap-3 p-0 text-sm">
        {entries.map((entry) => {
          const who = entry.authorId ? (names.get(entry.authorId) ?? "—") : "—";
          const heading =
            entry.kind === "SUBMITTED"
              ? (enviada ?? "").replace("{versión}", String(entry.version))
              : entry.kind === "RETURNED"
                ? devuelto
                : (semaforo ?? "").replace(
                    "{nivel}",
                    entry.riskLevel ? riskLevelLabel(entry.riskLevel).toLowerCase() : "",
                  );
          return (
            <li key={entry.id} className="flex flex-col gap-1 border-l-2 border-borde pl-3">
              <p className="m-0 font-semibold">{heading}</p>
              <p className="m-0 text-tinta-secundaria">
                {who} · {formatDateTime(entry.createdAt)}
              </p>
              {entry.kind === "SUBMITTED" ? (
                <>
                  <p className="m-0">
                    {entry.title}
                    {entry.eventOn ? ` · ${day(entry.eventOn)}` : ""}
                  </p>
                  {entry.riskLevel ? (
                    <p className="m-0 flex flex-wrap items-center gap-2">
                      <RiesgoBadge level={entry.riskLevel} />
                      {entry.riskJustification ? (
                        <span>
                          <span className="text-tinta-secundaria">{porQue}: </span>
                          {entry.riskJustification}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {entry.description ? <p className="m-0">{entry.description}</p> : null}
                </>
              ) : (
                <p className="m-0">{entry.note}</p>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
