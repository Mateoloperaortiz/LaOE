import Link from "next/link";
import type { InteractionView } from "@/modules/crm";
import {
  APPOINTMENT_KINDS,
  type CommitteeRoleRow,
  DOCUMENT_TYPE_CODES,
  type MyMembershipView,
  type Person360,
  type TagRow,
} from "@/modules/people";
import { STATUS_CODES, statusLabel } from "@/modules/people/admin";
import { PrivacyPolicyNotice } from "@/modules/system/components/PrivacyPolicyNotice";
import type { TermRow } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminMultiSelect } from "@/shared/admin-kit/AdminMultiSelect";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatDate, todayKey } from "@/shared/lib/dates";
import {
  addAppointmentAction,
  addNoteAction,
  admitAction,
  anonymizeAction,
  changeStatusAction,
  createTaskAction,
  editNoteAction,
  endMembershipAction,
  reactivateAction,
  setCommitteesAction,
  setProbationAction,
  setTagsAction,
  updatePersonAction,
} from "../actions";
import { END_REASONS } from "./etiquetas";

type Props = {
  accion: string;
  data: Person360;
  my: MyMembershipView;
  committees: Array<{ id: string; name: string }>;
  roles: CommitteeRoleRow[];
  terms: TermRow[];
  tags: TagRow[];
  personTagIds: string[];
  assignees: Array<{ value: string; label: string }>;
  note: InteractionView | null;
  /** Término preseleccionado en el panel de condición (`?semestre=`), si existe. */
  semestreId: string | null;
  closeHref: string;
  error: string;
  policyReady: boolean;
};

const MAX_ROWS = 3;

function Botones({
  enviar,
  cancelHref,
  calido = false,
  disabled = false,
}: {
  enviar: string;
  cancelHref: string;
  calido?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="admin-form-actions mt-2 flex flex-wrap items-center gap-3">
      <AdminSubmitButton
        type="submit"
        className={calido ? "boton-calido" : "boton-primario"}
        disabled={disabled}
      >
        {enviar}
      </AdminSubmitButton>
      <Link href={cancelHref} className="boton-secundario">
        {t("T-254")}
      </Link>
    </div>
  );
}

// Paneles laterales de la Persona 360: formularios planos que postean a las acciones de la página.
export function Paneles({
  accion,
  data,
  my,
  committees,
  roles,
  terms,
  tags,
  personTagIds,
  assignees,
  note,
  semestreId,
  closeHref,
  error,
  policyReady,
}: Props) {
  const { person, membership } = data;
  const acciones = tList("T-433");
  const campos = tList("T-427");
  const [estudiante, externo] = tList("T-428") as [string, string];
  const alerta = error ? (
    <p
      role="alert"
      className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
    >
      {error}
    </p>
  ) : null;
  const hidden = <input type="hidden" name="personId" value={person.id} />;

  if (accion === "editar") {
    return (
      <ResourcePanel title={acciones[0] ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <form action={updatePersonAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <Campo id="campo-firstName" label={campos[0] ?? ""}>
              <input
                id="campo-firstName"
                name="firstName"
                defaultValue={person.firstName}
                required
                className={inputClass}
              />
            </Campo>
            <Campo id="campo-lastName" label={campos[1] ?? ""}>
              <input
                id="campo-lastName"
                name="lastName"
                defaultValue={person.lastName}
                required
                className={inputClass}
              />
            </Campo>
            <Campo id="campo-email" label={campos[2] ?? ""} help={t("T-512")}>
              <input
                id="campo-email"
                name="email"
                type="email"
                defaultValue={person.email}
                required
                className={inputClass}
              />
            </Campo>
            <Campo id="campo-kind" label={campos[7] ?? ""}>
              <select id="campo-kind" name="kind" defaultValue={person.kind} className={inputClass}>
                <option value="STUDENT">{estudiante}</option>
                <option value="EXTERNAL">{externo}</option>
              </select>
            </Campo>
            <Campo id="campo-preferredName" label={campos[3] ?? ""}>
              <input
                id="campo-preferredName"
                name="preferredName"
                defaultValue={person.preferredName ?? ""}
                className={inputClass}
              />
            </Campo>
            <Campo id="campo-phone" label={campos[4] ?? ""}>
              <input
                id="campo-phone"
                name="phone"
                defaultValue={person.phone ?? ""}
                className={inputClass}
              />
            </Campo>
            <Campo id="campo-personalEmail" label={campos[5] ?? ""}>
              <input
                id="campo-personalEmail"
                name="personalEmail"
                type="email"
                defaultValue={person.personalEmail ?? ""}
                className={inputClass}
              />
            </Campo>
            <Campo id="campo-program" label={campos[6] ?? ""}>
              <input
                id="campo-program"
                name="program"
                defaultValue={person.program ?? ""}
                className={inputClass}
              />
            </Campo>
            <fieldset className="flex min-w-0 flex-col gap-4">
              <legend className="mb-3 font-semibold">{t("T-2014")}</legend>
              <p className="text-sm text-tinta-suave">{t("T-2016")}</p>
              <Campo id="campo-documentType" label={t("T-2010")}>
                <select
                  id="campo-documentType"
                  name="documentType"
                  defaultValue={person.documentType ?? ""}
                  className={inputClass}
                >
                  <option value="">—</option>
                  {DOCUMENT_TYPE_CODES.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="campo-documentNumber" label={t("T-2011")}>
                <input
                  id="campo-documentNumber"
                  name="documentNumber"
                  defaultValue={person.documentNumber ?? ""}
                  maxLength={80}
                  className={inputClass}
                />
              </Campo>
              <Campo id="campo-epikId" label={t("T-2012")}>
                <input
                  id="campo-epikId"
                  name="epikId"
                  defaultValue={person.epikId ?? ""}
                  maxLength={80}
                  className={inputClass}
                />
              </Campo>
              <Campo id="campo-birthDate" label={t("T-2013")}>
                <input
                  id="campo-birthDate"
                  name="birthDate"
                  type="date"
                  defaultValue={person.birthDate ?? ""}
                  max={todayKey()}
                  className={inputClass}
                />
              </Campo>
            </fieldset>
            <Botones enviar={t("T-253")} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "estado" && membership && membership.status !== "INACTIVE") {
    return (
      <ResourcePanel title={acciones[1] ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <form action={changeStatusAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <Campo id="campo-to" label={t("T-435")} help={t("T-510")}>
              <select id="campo-to" name="to" required className={inputClass} defaultValue="">
                <option value="">—</option>
                {STATUS_CODES.filter(
                  (code) => code !== "INACTIVE" && code !== membership.status,
                ).map((code) => (
                  <option key={code} value={code}>
                    {statusLabel(code)}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="campo-reason" label={t("T-434")}>
              <textarea id="campo-reason" name="reason" required rows={3} className={inputClass} />
            </Campo>
            <Botones enviar={t("T-253")} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "baja" && membership && membership.status !== "INACTIVE") {
    const motivos = tList("T-436");
    const [galeria, contacto] = tList("T-437") as [string, string];
    return (
      <ResourcePanel title={acciones[2] ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <p className="text-sm">{t("T-162", { nombre: person.fullName?.trim() ?? "" })}</p>
        <form action={endMembershipAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <Campo id="campo-endReason" label={t("T-434")}>
              <select
                id="campo-endReason"
                name="endReason"
                required
                className={inputClass}
                defaultValue=""
              >
                <option value="">—</option>
                {END_REASONS.map((code, index) => (
                  <option key={code} value={code}>
                    {motivos[index] ?? code}
                  </option>
                ))}
              </select>
            </Campo>
            <Casilla
              id="campo-memorialConsent"
              name="memorialConsent"
              label={galeria}
              disabled={!policyReady}
            />
            <Casilla
              id="campo-contactConsent"
              name="contactConsent"
              label={contacto}
              disabled={!policyReady}
            />
            {!policyReady ? <PrivacyPolicyNotice admin /> : null}
            <Campo id="campo-personalEmail-baja" label={campos[5] ?? ""}>
              <input
                id="campo-personalEmail-baja"
                name="personalEmail"
                type="email"
                defaultValue={person.personalEmail ?? ""}
                className={inputClass}
              />
            </Campo>
            <Botones enviar={t("T-438")} cancelHref={closeHref} calido />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "reactivar" && membership?.status === "INACTIVE") {
    return (
      <ResourcePanel title={acciones[3] ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <p className="text-sm">{t("T-439", { nombre: person.fullName?.trim() ?? "" })}</p>
        <form action={reactivateAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <Campo id="campo-email-reactivar" label={campos[2] ?? ""}>
              <input
                id="campo-email-reactivar"
                name="email"
                type="email"
                defaultValue={person.email}
                className={inputClass}
              />
            </Campo>
            <Campo id="campo-reason-reactivar" label={t("T-434")}>
              <input id="campo-reason-reactivar" name="reason" className={inputClass} />
            </Campo>
            <Botones enviar={t("T-253")} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "anonimizar" && person.deletionRequestedAt && !person.anonymizedAt) {
    return (
      <ResourcePanel title={acciones[4] ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <p className="text-sm">
          {t("T-440", {
            nombre: person.fullName?.trim() ?? "",
            fecha: formatDate(person.deletionRequestedAt),
          })}
        </p>
        <form action={anonymizeAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <Botones enviar={t("T-441")} cancelHref={closeHref} calido />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  // "Dar de alta" (ADR-037 regla 8): solo estudiantes sin membresía; de 1 a 3 comités como Miembro.
  if (accion === "alta" && !membership && person.kind === "STUDENT") {
    const term = my.term;
    return (
      <ResourcePanel title={t("T-983")} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        {!policyReady ? <PrivacyPolicyNotice admin /> : null}
        <form action={admitAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <input type="hidden" name="termId" value={term?.id ?? ""} />
            <p className="text-sm">
              {term
                ? t("T-984", {
                    nombre: `${person.firstName} ${person.lastName}`.trim(),
                    término: term.code,
                    min: 1,
                    max: MAX_ROWS,
                  })
                : t("T-989")}
            </p>
            <AdminMultiSelect
              name="committeeIds"
              label={t("T-985")}
              options={committees.map((item) => ({ value: item.id, label: item.name }))}
              required
            />
            <Botones enviar={t("T-983")} cancelHref={closeHref} calido disabled={!policyReady} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "comites" && my.term) {
    const [comite, cargo, transferencia] = tList("T-450") as [string, string, string];
    const rows = Array.from({ length: MAX_ROWS }, (_, index) => my.committees[index] ?? null);
    return (
      <ResourcePanel
        title={t("T-448", { término: my.term.code })}
        closeHref={closeHref}
        closeLabel={t("T-291")}
      >
        {alerta}
        <form action={setCommitteesAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <input type="hidden" name="termId" value={my.term.id} />
            {rows.map((row, index) => {
              const n = index + 1;
              return (
                <fieldset
                  key={n}
                  className="flex flex-col gap-3 rounded-xl border border-borde p-3"
                >
                  <legend className="eyebrow px-1 text-xs">{n}</legend>
                  <Campo id={`campo-committeeId${n}`} label={comite}>
                    <select
                      id={`campo-committeeId${n}`}
                      name={`committeeId${n}`}
                      defaultValue={row?.committeeId ?? ""}
                      className={inputClass}
                    >
                      <option value="">—</option>
                      {committees.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </Campo>
                  <fieldset className="flex flex-col gap-2">
                    <legend className="eyebrow px-1 text-xs">{cargo}</legend>
                    {roles
                      .filter((item) => item.code !== "MIEMBRO")
                      .map((item) => {
                        const mine = row?.roles.find((role) => role.roleCode === item.code);
                        return (
                          <div
                            key={item.code}
                            className="flex flex-wrap items-center gap-x-6 gap-y-1"
                          >
                            <Casilla
                              id={`campo-role${n}-${item.code}`}
                              name={`role${n}-${item.code}`}
                              label={item.label}
                              defaultChecked={mine !== undefined}
                            />
                            {item.isLeadership ? (
                              <Casilla
                                id={`campo-co${n}-${item.code}`}
                                name={`co${n}-${item.code}`}
                                label={t("T-2153")}
                                defaultChecked={mine?.coDirector ?? false}
                              />
                            ) : null}
                          </div>
                        );
                      })}
                  </fieldset>
                  <Casilla
                    id={`campo-transferredIn${n}`}
                    name={`transferredIn${n}`}
                    label={transferencia}
                    defaultChecked={row?.transferredIn ?? false}
                  />
                </fieldset>
              );
            })}
            <Botones enviar={t("T-253")} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  // Condición del semestre (ADR-056): periodo de prueba por término, con motivo, sobre una membresía viva.
  if (accion === "condicion" && membership && membership.status !== "INACTIVE") {
    const [, , , condicion] = tList("T-443") as [string, string, string, string];
    const [, término] = tList("T-262") as [string, string];
    const selected = terms.find((item) => item.id === semestreId) ?? my.term ?? terms[0] ?? null;
    const onProbation = selected
      ? data.probation.some((item) => item.termId === selected.id)
      : false;
    return (
      <ResourcePanel title={condicion} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <p className="text-sm">{t("T-2143")}</p>
        <form action={setProbationAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <Campo id="campo-termId-condicion" label={término}>
              <select
                id="campo-termId-condicion"
                name="termId"
                required
                className={inputClass}
                defaultValue={selected?.id ?? ""}
              >
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.code}
                  </option>
                ))}
              </select>
            </Campo>
            <Casilla
              id="campo-probation"
              name="probation"
              label={t("T-449")}
              defaultChecked={onProbation}
            />
            <Campo id="campo-reason-condicion" label={t("T-434")}>
              <textarea
                id="campo-reason-condicion"
                name="reason"
                required
                rows={3}
                className={inputClass}
              />
            </Campo>
            <Botones enviar={t("T-253")} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "cargo") {
    const kinds = tList("T-444");
    const [agregar] = tList("T-447") as [string, string];
    const [, , cargosTitulo] = tList("T-443") as [string, string, string, string];
    return (
      <ResourcePanel title={cargosTitulo} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <form action={addAppointmentAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <Campo id="campo-kind-cargo" label={cargosTitulo}>
              <select
                id="campo-kind-cargo"
                name="kind"
                required
                className={inputClass}
                defaultValue=""
              >
                <option value="">—</option>
                {APPOINTMENT_KINDS.map((kind, index) => (
                  <option key={kind} value={kind}>
                    {kinds[index] ?? kind}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="campo-termId-cargo" label={tList("T-262")[1] ?? ""}>
              <select
                id="campo-termId-cargo"
                name="termId"
                required
                className={inputClass}
                defaultValue={my.term?.id ?? ""}
              >
                <option value="">—</option>
                {terms.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.code}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="campo-committeeId-cargo" label={tList("T-450")[0] ?? ""}>
              <select
                id="campo-committeeId-cargo"
                name="committeeId"
                className={inputClass}
                defaultValue=""
              >
                <option value="">—</option>
                {committees.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="campo-title-cargo" label={t("T-445")}>
              <input id="campo-title-cargo" name="title" className={inputClass} />
            </Campo>
            <Casilla id="campo-grantBoard" name="grantBoard" label={t("T-446")} />
            <Botones enviar={agregar} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "nota") {
    const [guardarNota] = tList("T-456") as [string, string, string];
    return (
      <ResourcePanel title={acciones[5] ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <form action={note ? editNoteAction : addNoteAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            {note ? <input type="hidden" name="noteId" value={note.id} /> : null}
            <Campo id="campo-body" label={acciones[5] ?? ""} help={t("T-455")}>
              <textarea
                id="campo-body"
                name="body"
                required
                rows={6}
                defaultValue={note?.body ?? ""}
                className={inputClass}
              />
            </Campo>
            <Botones enviar={guardarNota} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "tarea") {
    const [titulo, responsable, vence, , , tipo] = tList("T-459") as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const [general, eliminacion] = tList("T-461") as [string, string];
    return (
      <ResourcePanel title={acciones[6] ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <form action={createTaskAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <Campo id="campo-title" label={titulo}>
              <input id="campo-title" name="title" required className={inputClass} />
            </Campo>
            <Campo id="campo-assigneeId" label={responsable}>
              <select
                id="campo-assigneeId"
                name="assigneeId"
                className={inputClass}
                defaultValue=""
              >
                <option value="">—</option>
                {assignees.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo id="campo-dueAt" label={vence}>
              <input id="campo-dueAt" name="dueAt" type="datetime-local" className={inputClass} />
            </Campo>
            <Campo id="campo-kind-tarea" label={tipo}>
              <select
                id="campo-kind-tarea"
                name="kind"
                className={inputClass}
                defaultValue="GENERAL"
              >
                <option value="GENERAL">{general}</option>
                <option value="DELETION_REQUEST">{eliminacion}</option>
              </select>
            </Campo>
            <Botones enviar={t("T-253")} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  if (accion === "etiquetas") {
    return (
      <ResourcePanel title={acciones[7] ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
        {alerta}
        <form action={setTagsAction} className="flex flex-col gap-4">
          <AdminFormBody>
            {hidden}
            <AdminMultiSelect
              name="tagIds"
              label={acciones[7] ?? ""}
              options={tags.map((item) => ({ value: item.id, label: item.name }))}
              defaultValue={personTagIds}
            />
            <Botones enviar={t("T-253")} cancelHref={closeHref} />
          </AdminFormBody>
        </form>
      </ResourcePanel>
    );
  }

  return null;
}
