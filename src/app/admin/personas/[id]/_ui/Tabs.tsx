import Link from "next/link";
import type { MessageView, PreferencesView } from "@/modules/comms";
import { channelLabel, kindLabel, statusLabel as messageStatusLabel } from "@/modules/comms/admin";
import type { InteractionView, TaskRow } from "@/modules/crm";
import type { ActorPermission } from "@/modules/identity";
import { formatBirthDate, type MyMembershipView, type Person360 } from "@/modules/people";
import { statusLabel } from "@/modules/people/admin";
import { PrivacyPolicyNotice } from "@/modules/system/components/PrivacyPolicyNotice";
import type { WalletPassRecord } from "@/modules/wallet";
import { Bloque, Dato } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { addBusinessDays, formatDate, formatDateTime } from "@/shared/lib/dates";
import { Markdown } from "@/shared/ui/Markdown";
import { IssueGrantPanel } from "../../IssueGrantPanel";
import {
  completeTaskAction,
  consentAction,
  removeAppointmentAction,
  revokeCarnetAction,
} from "../actions";
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
  assemblies,
}: {
  data: Person360;
  permissions: ActorPermission[];
  committeeNames: Map<string, string>;
  lastContact: Date | null;
  openTasks: number;
  /** Saldo del término actual, o null sin término. */
  balance: number | null;
  /** Asambleas obligatorias firmadas ("n de total"), o null sin término. */
  assemblies: string | null;
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
      <Dato etiqueta={asambleas} valor={assemblies} />
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
        {!data.membership && data.person.kind === "STUDENT" ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-tinta-suave">{t("T-1053")}</p>
            <Link
              href={`${base}?pestana=membresia&accion=alta`}
              className="boton-calido min-h-9 px-4 py-1 text-sm"
            >
              {t("T-983")}
            </Link>
          </div>
        ) : null}
        {my.term && data.membership ? (
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
                  <AdminFormBody>
                    <input type="hidden" name="personId" value={data.person.id} />
                    <input type="hidden" name="appointmentId" value={item.id} />
                    <AdminSubmitButton
                      type="submit"
                      className="boton-secundario min-h-8 px-3 py-1 text-xs"
                    >
                      {quitar}
                    </AdminSubmitButton>
                  </AdminFormBody>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Bloque>
      <Bloque titulo={condicion}>
        {data.membership && data.membership.status !== "INACTIVE" ? (
          <Link
            href={`${base}?pestana=membresia&accion=condicion`}
            className="boton-secundario min-h-9 self-start px-4 py-1 text-sm"
          >
            {t("T-2142")}
          </Link>
        ) : null}
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

export function TabComunicaciones({
  personId,
  passes,
  canRevokeCarnet,
  canIssueGrant,
  messages,
  preferences,
  devices,
}: {
  personId: string;
  passes: WalletPassRecord[];
  canRevokeCarnet: boolean;
  canIssueGrant: boolean;
  messages: MessageView[];
  preferences: PreferencesView;
  devices: { devices: number; lastSeenAt: Date | null };
}) {
  const [fecha, canal, tipo, asunto, estado] = tList("T-1155") as [
    string,
    string,
    string,
    string,
    string,
  ];
  const prefLabels = tList("T-1080");
  const [sí, no] = tList("T-1058") as [string, string];
  const flags: Array<[string, boolean]> = [
    [prefLabels[0] ?? "", preferences.pushAnnouncements],
    [prefLabels[1] ?? "", preferences.pushPoints],
    [prefLabels[2] ?? "", preferences.pushReminders],
    [prefLabels[3] ?? "", preferences.emailCampaigns],
  ];
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="comunicaciones-preferencias">
        <h3 id="comunicaciones-preferencias" className="eyebrow text-xs">
          {t("T-1151")}
        </h3>
        <ul className="flex list-none flex-wrap gap-2 p-0">
          {flags.map(([label, on]) => (
            <li key={label}>
              <Insignia fondo={on ? "azul" : "sky"}>
                {label}: {on ? sí : no}
              </Insignia>
            </li>
          ))}
        </ul>
        <p className="text-sm text-tinta-suave">
          {devices.devices > 0
            ? t("T-1152", {
                n: devices.devices,
                fecha: devices.lastSeenAt ? formatDateTime(devices.lastSeenAt) : "",
              })
            : t("T-1153")}
        </p>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="comunicaciones-carnet">
        <h3 id="comunicaciones-carnet" className="eyebrow text-xs">
          {t("T-1209")}
        </h3>
        {passes.length === 0 ? (
          <p className="text-sm text-tinta-suave">{t("T-1211")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0 text-sm">
            {passes.map((pass) => {
              const platform = pass.platform === "APPLE" ? "Apple Wallet" : "Google Wallet";
              const issuedAt = pass.lastIssuedAt ?? pass.issuedAt;
              return (
                <li key={pass.id}>
                  {pass.revokedAt
                    ? t("T-1219", { plataforma: platform, fecha: formatDateTime(pass.revokedAt) })
                    : issuedAt
                      ? t("T-1210", { plataforma: platform, fecha: formatDateTime(issuedAt) })
                      : t("T-1217", { plataforma: platform })}
                </li>
              );
            })}
          </ul>
        )}
        {canIssueGrant ? (
          <div className="mb-6 flex flex-col gap-3 rounded-xl border border-borde p-4">
            <h3 className="text-titulo-lg">{t("T-2119")}</h3>
            <IssueGrantPanel
              personId={personId}
              returnTo={`/admin/personas/${personId}?pestana=comunicaciones`}
              labels={{
                submit: t("T-2119"),
                activation: t("T-2120"),
                recovery: t("T-2121"),
                once: t("T-2122"),
                handover: t("T-2123"),
                copy: t("T-2124"),
                copied: t("T-2125"),
              }}
            />
          </div>
        ) : null}
        {canRevokeCarnet ? (
          <details className="rounded-xl border border-borde p-4">
            <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-titulo">
              {t("T-1212")}
            </summary>
            <form action={revokeCarnetAction} className="mt-4 flex flex-col items-start gap-4">
              <AdminFormBody>
                <input type="hidden" name="personId" value={personId} />
                <input type="hidden" name="confirm" value="1" />
                <p className="max-w-prose text-sm">{t("T-1220")}</p>
                <AdminSubmitButton type="submit" className="boton-secundario text-sm">
                  {t("T-1212")}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
          </details>
        ) : null}
      </section>
      {messages.length === 0 ? (
        <p className="text-tinta-suave">{t("T-1154")}</p>
      ) : (
        <section
          aria-label={t("T-1142")}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: región desplazable que debe poder recorrerse con teclado
          tabIndex={0}
          className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-titulo"
        >
          <table className="admin-data-table w-full text-left text-sm">
            <thead className="eyebrow bg-fondo-suave text-xs">
              <tr>
                <th scope="col" className="px-3 py-2">
                  {fecha}
                </th>
                <th scope="col" className="px-3 py-2">
                  {canal}
                </th>
                <th scope="col" className="px-3 py-2">
                  {tipo}
                </th>
                <th scope="col" className="px-3 py-2">
                  {asunto}
                </th>
                <th scope="col" className="px-3 py-2">
                  {estado}
                </th>
              </tr>
            </thead>
            <tbody>
              {messages.map((item) => (
                <tr key={item.id} className="border-t border-borde">
                  <td data-label={fecha} className="px-3 py-2">
                    {formatDateTime(item.sentAt ?? item.createdAt)}
                  </td>
                  <td data-label={canal} className="px-3 py-2">
                    {channelLabel(item.channel)}
                  </td>
                  <td data-label={tipo} className="px-3 py-2">
                    {kindLabel(item.kind)}
                  </td>
                  <td data-label={asunto} className="px-3 py-2 font-semibold">
                    {item.subject}
                  </td>
                  <td data-label={estado} className="px-3 py-2">
                    <Insignia fondo={item.status === "SENT" ? "azul" : "naranja"}>
                      {messageStatusLabel(item.status)}
                    </Insignia>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
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
          <table className="admin-data-table w-full text-left text-sm">
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
                  <td data-label={titulo} className="px-3 py-2 font-semibold">
                    {item.title}
                  </td>
                  <td data-label={responsable} className="px-3 py-2">
                    {item.assigneeName ?? sinAsignar}
                  </td>
                  <td data-label={vence} className="px-3 py-2">
                    {item.dueAt ? formatDateTime(item.dueAt) : "—"}
                  </td>
                  <td data-label={estado} className="px-3 py-2">
                    <Insignia fondo={item.status === "OPEN" ? "amarillo" : "paper"}>
                      {item.status === "OPEN" ? abierta : hecha}
                    </Insignia>
                  </td>
                  <td data-label={t("T-462")} className="px-3 py-2 text-right">
                    {item.status === "OPEN" ? (
                      <form action={completeTaskAction}>
                        <AdminFormBody>
                          <input type="hidden" name="personId" value={personId} />
                          <input type="hidden" name="taskId" value={item.id} />
                          <AdminSubmitButton
                            type="submit"
                            className="boton-secundario min-h-8 px-3 py-1 text-xs"
                          >
                            {t("T-462")}
                          </AdminSubmitButton>
                        </AdminFormBody>
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

export function TabDatos({
  data,
  deletionDays,
  policyReady,
}: {
  data: Person360;
  deletionDays: number;
  policyReady: boolean;
}) {
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
          <Dato etiqueta={t("T-2010")} valor={person.documentType} />
          <Dato etiqueta={t("T-2011")} valor={person.documentNumber} />
          <Dato etiqueta={t("T-2012")} valor={person.epikId} />
          <Dato
            etiqueta={t("T-2013")}
            valor={person.birthDate ? formatBirthDate(person.birthDate) : null}
          />
          <Dato
            etiqueta={campos[7] ?? ""}
            valor={person.kind === "STUDENT" ? estudiante : externo}
          />
        </dl>
      </Bloque>
      <Bloque titulo={consentimientos}>
        {!policyReady ? <PrivacyPolicyNotice admin /> : null}
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
                      <AdminFormBody>
                        <input type="hidden" name="personId" value={person.id} />
                        <input type="hidden" name="purpose" value={item.purpose} />
                        <input type="hidden" name="intent" value={item.live ? "revoke" : "grant"} />
                        <AdminSubmitButton
                          type="submit"
                          className="boton-secundario min-h-8 px-3 py-1 text-xs"
                          disabled={!item.live && !policyReady}
                        >
                          {item.live ? retirar : registrar}
                        </AdminSubmitButton>
                      </AdminFormBody>
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
