import Link from "next/link";
import type { MessageView } from "@/modules/comms";
import type { InteractionView, TaskRow } from "@/modules/crm";
import type { ActorPermission } from "@/modules/identity";
import type { MyMembershipView, Person360 } from "@/modules/people";
import { statusLabel } from "@/modules/people/admin";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { addBusinessDays, formatDate, formatDateTime } from "@/shared/lib/dates";
import { Markdown } from "@/shared/ui/Markdown";
import { completeTaskAction, consentAction, removeAppointmentAction } from "../actions";
import { Bloque, Dato } from "./campos";
import {
  appointmentLabel,
  CONSENT_TEXTS,
  TIMELINE_FILTERS,
  type TimelineFilterKey,
} from "./etiquetas";

// Contenido de cada pestaña de la Persona 360. Las de fases siguientes muestran T-240.

export function TabResumen({
  data,
  permissions,
  committeeNames,
  lastContact,
  openTasks,
  balance,
}: {
  data: Person360;
  permissions: ActorPermission[];
  committeeNames: Map<string, string>;
  lastContact: Date | null;
  openTasks: number;
  /** Saldo del término actual, o null sin término. */
  balance: number | null;
}) {
  const [contacto, tareas, consentimientos, permisos, puntos, asambleas] = tList("T-453") as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const [admin, lider, junta] = tList("T-289") as [string, string, string];
  const vivos = data.consents.filter((item) => item.live !== null).length;
  return (
    <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Dato etiqueta={contacto} valor={lastContact ? formatDateTime(lastContact) : null} />
      <Dato etiqueta={tareas} valor={openTasks} />
      <Dato etiqueta={consentimientos} valor={`${vivos} / ${data.consents.length}`} />
      <Dato
        etiqueta={permisos}
        valor={
          permissions.length === 0
            ? null
            : permissions
                .map((item) =>
                  item.code === "ADMIN"
                    ? admin
                    : item.code === "BOARD"
                      ? junta
                      : `${lider} · ${item.committeeId ? (committeeNames.get(item.committeeId) ?? "") : ""}`,
                )
                .join(", ")
        }
      />
      <Dato etiqueta={puntos} valor={balance} />
      <Dato etiqueta={asambleas} valor={t("T-240")} />
    </dl>
  );
}

export function TabLinea({
  personId,
  interactions,
  filter,
  actorId,
}: {
  personId: string;
  interactions: InteractionView[];
  filter: TimelineFilterKey;
  actorId: string;
}) {
  const filtros = tList("T-454");
  const [, editar, editada] = tList("T-456") as [string, string, string];
  const base = `/admin/personas/${personId}?pestana=linea`;
  return (
    <div className="flex flex-col gap-4">
      <nav aria-label={filtros[0]} className="flex flex-wrap gap-2">
        {TIMELINE_FILTERS.map((key, index) => (
          <Link
            key={key}
            href={key === "ALL" ? base : `${base}&tipo=${key}`}
            aria-current={key === filter ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              key === filter ? "bg-oe-navy text-oe-paper" : "border border-borde text-titulo"
            }`}
          >
            {filtros[index] ?? key}
          </Link>
        ))}
      </nav>
      {interactions.length === 0 ? (
        <p className="text-tinta-suave">{t("T-457")}</p>
      ) : (
        <ol className="flex list-none flex-col gap-3 p-0">
          {interactions.map((item) => (
            <li
              key={item.id}
              className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-tinta-suave">
                <span>
                  {formatDateTime(item.occurredAt)} · {item.actorName ?? t("T-515")}
                  {item.editedAt
                    ? ` · ${editada.replace("{fecha}", formatDate(item.editedAt))}`
                    : ""}
                </span>
                {item.kind === "NOTE" && item.actorId === actorId ? (
                  <Link href={`${base}&accion=nota&nota=${item.id}`} className="font-semibold">
                    {editar}
                  </Link>
                ) : null}
              </div>
              {item.kind === "NOTE" && item.body ? (
                <Markdown source={item.body} className="text-sm" />
              ) : (
                <p className="font-semibold">{item.summary}</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function TabMembresia({ data, my }: { data: Person360; my: MyMembershipView }) {
  const [historial, comitesPorSemestre, cargos, condicion] = tList("T-443") as [
    string,
    string,
    string,
    string,
  ];
  const [agregarCargo, quitar] = tList("T-447") as [string, string];
  const base = `/admin/personas/${data.person.id}`;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloque titulo={historial}>
        {data.events.length === 0 ? (
          <p className="text-sm text-tinta-suave">—</p>
        ) : (
          <ol className="flex list-none flex-col gap-2 p-0 text-sm">
            {data.events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-baseline gap-2">
                <span className="text-tinta-suave">{formatDateTime(event.at)}</span>
                <span className="font-semibold">
                  {event.fromStatus ? statusLabel(event.fromStatus) : "—"} →{" "}
                  {statusLabel(event.toStatus)}
                </span>
                {event.reason ? <span>· {event.reason}</span> : null}
                <span className="text-tinta-suave">· {event.actorName ?? t("T-515")}</span>
              </li>
            ))}
          </ol>
        )}
      </Bloque>
      <Bloque titulo={comitesPorSemestre}>
        {my.term ? (
          <Link
            href={`${base}?pestana=membresia&accion=comites`}
            className="boton-secundario min-h-9 self-start px-4 py-1 text-sm"
          >
            {t("T-448", { término: my.term.code })}
          </Link>
        ) : null}
        {data.committeesByTerm.length === 0 ? (
          <p className="text-sm text-tinta-suave">{t("T-402")}</p>
        ) : (
          data.committeesByTerm.map((group) => (
            <div key={group.termId} className="flex flex-col gap-1">
              <p className="font-semibold">{group.termCode}</p>
              <ul className="flex list-none flex-wrap gap-2 p-0">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Insignia fondo={item.leftAt ? "paper" : item.isLeadership ? "naranja" : "sky"}>
                      {item.committeeName} · {item.roleLabel}
                      {item.transferredIn ? " · ↔" : ""}
                      {item.leftAt ? ` · ${formatDate(item.leftAt)}` : ""}
                    </Insignia>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Bloque>
      <Bloque titulo={cargos}>
        <Link
          href={`${base}?pestana=membresia&accion=cargo`}
          className="boton-secundario min-h-9 self-start px-4 py-1 text-sm"
        >
          {agregarCargo}
        </Link>
        {data.appointments.length === 0 ? (
          <p className="text-sm text-tinta-suave">{t("T-514")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0 text-sm">
            {data.appointments.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <span className="font-semibold">{appointmentLabel(item.kind, item.title)}</span> ·{" "}
                  {item.termCode}
                  {item.committeeName ? ` · ${item.committeeName}` : ""}
                </span>
                <form action={removeAppointmentAction}>
                  <input type="hidden" name="personId" value={data.person.id} />
                  <input type="hidden" name="appointmentId" value={item.id} />
                  <button type="submit" className="boton-secundario min-h-8 px-3 py-1 text-xs">
                    {quitar}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
      <Bloque titulo={condicion}>
        {data.probation.length === 0 ? (
          <p className="text-sm text-tinta-suave">—</p>
        ) : (
          <ul className="flex list-none flex-col gap-1 p-0 text-sm">
            {data.probation.map((item) => (
              <li key={item.termId}>
                <Insignia fondo="naranja">{t("T-449")}</Insignia> {item.termCode}
                {item.reason ? ` · ${item.reason}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Bloque>
    </div>
  );
}

export function TabComunicaciones({ messages }: { messages: MessageView[] }) {
  const [asunto, canal, estado, enviado] = tList("T-506") as [string, string, string, string];
  if (messages.length === 0) {
    return <p className="text-tinta-suave">{t("T-507")}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
      <table className="w-full text-left text-sm">
        <thead className="eyebrow bg-fondo-suave text-xs">
          <tr>
            <th scope="col" className="px-3 py-2">
              {asunto}
            </th>
            <th scope="col" className="px-3 py-2">
              {canal}
            </th>
            <th scope="col" className="px-3 py-2">
              {estado}
            </th>
            <th scope="col" className="px-3 py-2">
              {enviado}
            </th>
          </tr>
        </thead>
        <tbody>
          {messages.map((item) => (
            <tr key={item.id} className="border-t border-borde">
              <td className="px-3 py-2 font-semibold">{item.subject}</td>
              <td className="px-3 py-2">{item.channel}</td>
              <td className="px-3 py-2">
                <Insignia fondo={item.status === "SENT" ? "azul" : "naranja"}>
                  {item.status}
                </Insignia>
              </td>
              <td className="px-3 py-2">{formatDateTime(item.sentAt ?? item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TabTareas({ personId, tasks }: { personId: string; tasks: TaskRow[] }) {
  const [titulo, responsable, vence, estado] = tList("T-459") as [string, string, string, string];
  const [abierta, hecha] = tList("T-460") as [string, string];
  const [, sinAsignar] = tList("T-463") as [string, string, string];
  const [, nuevaTarea] = [null, tList("T-433")[6] ?? ""];
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/admin/personas/${personId}?pestana=tareas&accion=tarea`}
        className="boton-secundario min-h-9 self-start px-4 py-1 text-sm"
      >
        {nuevaTarea}
      </Link>
      {tasks.length === 0 ? (
        <p className="text-tinta-suave">{t("T-256")}</p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde">
          <table className="w-full text-left text-sm">
            <thead className="eyebrow bg-fondo-suave text-xs">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {titulo}
                </th>
                <th scope="col" className="px-3 py-2">
                  {responsable}
                </th>
                <th scope="col" className="px-3 py-2">
                  {vence}
                </th>
                <th scope="col" className="px-3 py-2">
                  {estado}
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">{t("T-462")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((item) => (
                <tr key={item.id} className="border-t border-borde">
                  <td className="px-3 py-2 font-semibold">{item.title}</td>
                  <td className="px-3 py-2">{item.assigneeName ?? sinAsignar}</td>
                  <td className="px-3 py-2">{item.dueAt ? formatDateTime(item.dueAt) : "—"}</td>
                  <td className="px-3 py-2">
                    <Insignia fondo={item.status === "OPEN" ? "amarillo" : "paper"}>
                      {item.status === "OPEN" ? abierta : hecha}
                    </Insignia>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {item.status === "OPEN" ? (
                      <form action={completeTaskAction}>
                        <input type="hidden" name="personId" value={personId} />
                        <input type="hidden" name="taskId" value={item.id} />
                        <button
                          type="submit"
                          className="boton-secundario min-h-8 px-3 py-1 text-xs"
                        >
                          {t("T-462")}
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function TabDatos({ data, deletionDays }: { data: Person360; deletionDays: number }) {
  const [datos, consentimientos, eliminacion] = tList("T-502") as [string, string, string, string];
  const campos = tList("T-427");
  const [estudiante, externo] = tList("T-428") as [string, string];
  const [registrar, retirar] = tList("T-503") as [string, string];
  const { person } = data;
  const base = `/admin/personas/${person.id}`;
  return (
    <div className="flex flex-col gap-4">
      <Bloque titulo={datos}>
        {person.anonymizedAt ? null : (
          <Link
            href={`${base}?pestana=datos&accion=editar`}
            className="boton-secundario min-h-9 self-start px-4 py-1 text-sm"
          >
            {t("T-252")}
          </Link>
        )}
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Dato etiqueta={campos[0] ?? ""} valor={person.firstName} />
          <Dato etiqueta={campos[1] ?? ""} valor={person.lastName} />
          <Dato etiqueta={campos[2] ?? ""} valor={person.email} />
          <Dato etiqueta={campos[3] ?? ""} valor={person.preferredName} />
          <Dato etiqueta={campos[4] ?? ""} valor={person.phone} />
          <Dato etiqueta={campos[5] ?? ""} valor={person.personalEmail} />
          <Dato etiqueta={campos[6] ?? ""} valor={person.program} />
          <Dato
            etiqueta={campos[7] ?? ""}
            valor={person.kind === "STUDENT" ? estudiante : externo}
          />
        </dl>
      </Bloque>
      <Bloque titulo={consentimientos}>
        <ul className="flex list-none flex-col gap-3 p-0">
          {data.consents.map((item, index) => {
            const code = CONSENT_TEXTS[index] ?? "T-150";
            const texto = t(code, { v: item.live?.policyVersion ?? "—" });
            return (
              <li
                key={item.purpose}
                className="flex flex-col gap-2 border-t border-borde pt-3 first:border-t-0 first:pt-0"
              >
                <p className="text-sm">{texto}</p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {item.live ? (
                    <Insignia fondo="amarillo">
                      {t("T-411", {
                        fecha: formatDate(item.live.acceptedAt),
                        v: item.live.policyVersion,
                      })}
                    </Insignia>
                  ) : (
                    <Insignia fondo="paper">{t("T-412")}</Insignia>
                  )}
                  {person.anonymizedAt ? null : (
                    <form action={consentAction}>
                      <input type="hidden" name="personId" value={person.id} />
                      <input type="hidden" name="purpose" value={item.purpose} />
                      <input type="hidden" name="intent" value={item.live ? "revoke" : "grant"} />
                      <button type="submit" className="boton-secundario min-h-8 px-3 py-1 text-xs">
                        {item.live ? retirar : registrar}
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Bloque>
      <Bloque titulo={eliminacion}>
        {person.deletionRequestedAt ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {t("T-504", {
                fecha: formatDate(person.deletionRequestedAt),
                vence: formatDate(addBusinessDays(person.deletionRequestedAt, deletionDays)),
              })}
            </p>
            {person.anonymizedAt ? (
              <Insignia fondo="paper">{t("T-223")}</Insignia>
            ) : (
              <Link
                href={`${base}?pestana=datos&accion=anonimizar`}
                className="boton-calido min-h-9 px-4 py-1 text-sm"
              >
                {t("T-441")}
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-tinta-suave">—</p>
        )}
      </Bloque>
    </div>
  );
}
