import Link from "next/link";
import type { SubmissionListRow } from "@/modules/forms";
import { Bloque } from "@/shared/admin-kit/AdminFields";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

// Pestaña Formularios de la Persona 360 (02-crm.md, ADR-037): respuestas enviadas, inscripciones a
// ediciones y tarjetas de pipeline (las tarjetas llegan en el tramo 4).

export interface RegistrationLine {
  id: string;
  editionName: string;
  status: "REGISTERED" | "CANCELLED";
  createdAt: Date;
  eventSlug: string;
  editionSlug: string;
}

export interface CardLine {
  id: string;
  pipelineId: string;
  pipelineName: string;
  stageName: string;
  closedAt: Date | null;
  enteredStageAt: Date;
}

export function TabFormularios({
  submissions,
  registrations,
  cards,
}: {
  submissions: SubmissionListRow[];
  registrations: RegistrationLine[];
  cards: CardLine[];
}) {
  const [respuestas, inscripciones, tarjetas] = tList("T-944") as [string, string, string];
  const [sinRespuestas, sinInscripciones, sinTarjetas] = tList("T-945") as [string, string, string];
  const [inscrito, cancelada] = tList("T-942") as [string, string];
  return (
    <div className="flex flex-col gap-6">
      <Bloque titulo={respuestas}>
        {submissions.length === 0 ? (
          <p className="text-tinta-suave">{sinRespuestas}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {submissions.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <Link
                  href={`/admin/formularios/${row.formId}/respuestas?ver=${row.id}`}
                  className="font-semibold underline"
                >
                  {t("T-946", { formulario: row.formTitle })}
                </Link>
                <span className="text-tinta-suave">{formatDateTime(row.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
      <Bloque titulo={inscripciones}>
        {registrations.length === 0 ? (
          <p className="text-tinta-suave">{sinInscripciones}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {registrations.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="font-semibold">{row.editionName}</span>
                <span className="text-tinta-suave">
                  {row.status === "REGISTERED" ? inscrito : cancelada} ·{" "}
                  {formatDateTime(row.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
      <Bloque titulo={tarjetas}>
        {cards.length === 0 ? (
          <p className="text-tinta-suave">{sinTarjetas}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {cards.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <Link
                  href={`/admin/pipelines/${row.pipelineId}?tarjeta=${row.id}`}
                  className="font-semibold underline"
                >
                  {row.pipelineName} · {row.stageName}
                </Link>
                <span className="text-tinta-suave">
                  {formatDateTime(row.closedAt ?? row.enteredStageAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
    </div>
  );
}
