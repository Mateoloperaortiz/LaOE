import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import {
  getBoard,
  getCard,
  getPipeline,
  listInteractions,
  listOrganizationInteractions,
  listOrganizationOptions,
  listTasks,
  PIPELINE_KINDS,
} from "@/modules/crm";
import { assigneeOptions } from "@/modules/crm/admin";
import { Kanban, type KanbanColumn } from "@/modules/crm/components/Kanban";
import { listEditionOptions } from "@/modules/events";
import { getFormView, getSubmission } from "@/modules/forms";
import { requireAdminActor } from "@/modules/identity";
import {
  getMembershipRef,
  getPersonRecord,
  listCommitteesForSelection,
  searchPeople,
} from "@/modules/people";
import { getPrivacyPolicyState } from "@/modules/system";
import { PrivacyPolicyNotice } from "@/modules/system/components/PrivacyPolicyNotice";
import { getCurrentTerm } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { Campo, Casilla, Dato, inputClass } from "@/shared/admin-kit/AdminFields";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminMultiSelect } from "@/shared/admin-kit/AdminMultiSelect";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/money";
import {
  addCardNoteAction,
  admitFromCardAction,
  createCardAction,
  createCardTaskAction,
  deleteStageAction,
  moveCardAction,
  moveStageAction,
  saveStageAction,
  updateCardAction,
} from "./actions";

// Kanban de un pipeline (ADR-037 reglas 7 y 8): columnas por etapa con tarjetas que se mueven con
// "Mover a…" o arrastrando; paneles por URL: ?tarjeta=<id> (datos, respuesta, notas, tareas y "dar de
// alta" en admisión), ?nueva=1 (tarjeta nueva con buscador) y ?etapas=1 (renombrar, ordenar, marcar).

const ID = /^[a-z0-9-]{10,40}$/;

type Search = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
}: PageProps<"/admin/pipelines/[id]">): Promise<Metadata> {
  const { id } = await params;
  const pipeline = ID.test(id) ? await getPipeline(id) : null;
  return { title: pipeline?.name ?? tList("T-962")[1] };
}

function daysSince(date: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000));
}

export default async function Page({ params, searchParams }: PageProps<"/admin/pipelines/[id]">) {
  const { id } = await params;
  await requireAdminActor(`/admin/pipelines/${id}`);
  const pipeline = ID.test(id) ? await getPipeline(id) : null;
  if (!pipeline) {
    notFound();
  }
  const search: Search = await searchParams;
  const tarjetaId = single(search.tarjeta);
  const nueva = single(search.nueva) === "1";
  const etapas = single(search.etapas) === "1";
  const alta = single(search.alta);
  const guardado = single(search.guardado) === "1";
  const movida = single(search.movida);
  const error = single(search.error);
  const q = single(search.q).trim();
  const now = new Date();
  const policy = await getPrivacyPolicyState();
  const base = `/admin/pipelines/${id}`;
  const kindLabels = tList("T-964");
  const [moverA] = tList("T-971");
  const [respuestaTitulo, notasTitulo, tareasTitulo, datosTitulo] = tList("T-975");
  const [monto, contraprestacion] = tList("T-976");
  const [nombreEtapa, ganada, perdida] = tList("T-978");
  const [subir, bajar, borrar] = tList("T-929");
  const [nPersona, nOrganizacion, nEdicion, nTitulo, nResponsable, nVence] = tList("T-973");
  const [tTitulo, tResponsable, tVence] = tList("T-459");

  const board = await getBoard(id);
  const card = tarjetaId && ID.test(tarjetaId) ? await getCard(tarjetaId) : null;
  const columns: KanbanColumn[] = board.map((column) => ({
    id: column.id,
    name: column.name,
    isWon: column.isWon,
    isLost: column.isLost,
    cards: column.cards.map((item) => ({
      id: item.id,
      title: item.title,
      subject: item.subjectName,
      edition: item.editionName,
      amount: item.amount !== null ? formatMoney(item.amount) : null,
      owner: item.ownerName,
      days: daysSince(item.enteredStageAt, now),
      closedAt: item.closedAt ? formatDate(item.closedAt) : null,
      href: `${base}?tarjeta=${item.id}`,
    })),
  }));
  const movedTo = movida ? board.find((column) => column.id === movida) : null;

  // Datos del panel de la tarjeta.
  const [submission, subjectTimeline, cardTasks, assignees, person, membership, committees, term] =
    await Promise.all([
      card?.submissionId ? getSubmission(card.submissionId) : Promise.resolve(null),
      card?.personId
        ? listInteractions(card.personId, "ALL", 20)
        : card?.organizationId
          ? listOrganizationInteractions(card.organizationId, 20)
          : Promise.resolve([]),
      card
        ? listTasks({
            q: "",
            page: 1,
            pageSize: 20,
            ...(card.personId
              ? { personId: card.personId }
              : { organizationId: card.organizationId ?? "" }),
          })
        : Promise.resolve({ rows: [], total: 0 }),
      card || nueva ? assigneeOptions() : Promise.resolve([]),
      card?.personId ? getPersonRecord(card.personId) : Promise.resolve(null),
      card?.personId ? getMembershipRef(card.personId) : Promise.resolve(null),
      alta === "1" ? listCommitteesForSelection() : Promise.resolve([]),
      alta === "1" ? getCurrentTerm(now) : Promise.resolve(null),
    ]);
  const formView = submission ? await getFormView(submission.formId) : null;
  // Solo desde una tarjeta abierta: una perdida se vuelve a mover antes de dar de alta.
  const canAdmit =
    card !== null &&
    card.closedAt === null &&
    card.pipelineKind === "ADMISSION" &&
    person?.kind === "STUDENT" &&
    membership === null;
  // Datos del panel de tarjeta nueva.
  const [people, organizations, editions] = nueva
    ? await Promise.all([
        q ? searchPeople(q) : Promise.resolve([]),
        listOrganizationOptions(),
        listEditionOptions(),
      ])
    : [[], [], []];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-display-lg">{pipeline.name}</h1>
          <Insignia fondo="sky">
            {kindLabels[PIPELINE_KINDS.indexOf(pipeline.kind)] ?? pipeline.kind}
          </Insignia>
          {pipeline.isArchived ? <Insignia fondo="paper">{t("T-995")}</Insignia> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {pipeline.isArchived ? null : (
            <Link href={`${base}?nueva=1`} className="boton-calido min-h-10 px-4 py-2 text-sm">
              {t("T-972")}
            </Link>
          )}
          <Link href={`${base}?etapas=1`} className="boton-secundario min-h-10 px-4 py-2 text-sm">
            {t("T-977")}
          </Link>
          <Link href="/admin/pipelines" className="text-sm underline">
            {tList("T-962")[1]}
          </Link>
        </div>
        {guardado || movedTo ? (
          <output className="block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-2 text-sm font-semibold text-oe-navy">
            {movedTo
              ? t("T-992", { etapa: movedTo.name })
              : alta === "ok" && card
                ? t("T-990", { nombre: card.subjectName })
                : t("T-259")}
          </output>
        ) : null}
        {error && !tarjetaId && !nueva && !etapas ? (
          <p
            role="alert"
            className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
          >
            {error}
          </p>
        ) : null}
      </header>

      <Kanban columns={columns} returnTo={base} moveAction={moveCardAction} />

      {card ? (
        <ResourcePanel title={card.title} closeHref={base} closeLabel={t("T-291")}>
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Insignia fondo={card.stageIsWon ? "amarillo" : card.stageIsLost ? "paper" : "sky"}>
              {card.stageName}
            </Insignia>
            {card.closedAt ? (
              <Insignia fondo="paper">
                {(tList("T-981")[2] ?? "").replace("{fecha}", formatDate(card.closedAt))}
              </Insignia>
            ) : null}
            {card.pipelineKind === "ADMISSION" && card.stageIsLost ? (
              <span className="text-xs text-tinta-suave">{t("T-996")}</span>
            ) : null}
          </div>
          <dl className="grid gap-3">
            <Dato
              etiqueta={t("T-1055")}
              valor={
                <Link href={card.subjectHref} className="underline">
                  {card.subjectName}
                </Link>
              }
            />
            {card.editionName ? <Dato etiqueta={nEdicion ?? ""} valor={card.editionName} /> : null}
          </dl>
          {canAdmit ? (
            !policy.ready ? (
              <PrivacyPolicyNotice admin />
            ) : alta === "1" ? (
              <form
                action={admitFromCardAction}
                className="flex flex-col gap-4 rounded-xl border border-borde p-4"
              >
                <AdminFormBody>
                  <input type="hidden" name="pipelineId" value={id} />
                  <input type="hidden" name="cardId" value={card.id} />
                  <input type="hidden" name="termId" value={term?.id ?? ""} />
                  <p className="text-sm">
                    {term
                      ? t("T-984", { nombre: card.subjectName, término: term.code, min: 1, max: 3 })
                      : t("T-989")}
                  </p>
                  <AdminMultiSelect
                    name="committeeIds"
                    label={t("T-985")}
                    options={committees.map((item) => ({ value: item.id, label: item.name }))}
                    required
                  />
                  <div className="flex gap-3">
                    <AdminSubmitButton type="submit" className="boton-calido" disabled={!term}>
                      {t("T-983")}
                    </AdminSubmitButton>
                    <Link href={`${base}?tarjeta=${card.id}`} className="boton-secundario">
                      {t("T-254")}
                    </Link>
                  </div>
                </AdminFormBody>
              </form>
            ) : (
              <Link href={`${base}?tarjeta=${card.id}&alta=1`} className="boton-calido self-start">
                {t("T-983")}
              </Link>
            )
          ) : null}
          {submission && formView ? (
            <section className="flex flex-col gap-2">
              <h3 className="eyebrow text-xs">{respuestaTitulo}</h3>
              <dl className="grid gap-2">
                {formView.parsedFields.map((field) => {
                  const value = submission.answers[field.key];
                  const text = Array.isArray(value)
                    ? value.join(", ")
                    : typeof value === "boolean"
                      ? (tList("T-1058")[value ? 0 : 1] ?? "")
                      : typeof value === "string" || typeof value === "number"
                        ? String(value)
                        : "—";
                  return <Dato key={field.key} etiqueta={field.label} valor={text} />;
                })}
              </dl>
              <Link
                href={`/admin/formularios/${submission.formId}/respuestas?ver=${submission.id}`}
                className="text-sm underline"
              >
                {t("T-946", { formulario: submission.formTitle })}
              </Link>
            </section>
          ) : null}
          <section className="flex flex-col gap-3">
            <h3 className="eyebrow text-xs">{datosTitulo}</h3>
            <form action={updateCardAction} className="flex flex-col gap-3">
              <AdminFormBody>
                <input type="hidden" name="pipelineId" value={id} />
                <input type="hidden" name="cardId" value={card.id} />
                <Campo id="c-title" label={nTitulo ?? ""}>
                  <input
                    id="c-title"
                    name="title"
                    required
                    defaultValue={card.title}
                    className={inputClass}
                  />
                </Campo>
                <Campo id="c-owner" label={nResponsable ?? ""}>
                  <select
                    id="c-owner"
                    name="ownerId"
                    defaultValue={card.ownerId ?? ""}
                    className={inputClass}
                  >
                    <option value="">{t("T-1060")}</option>
                    {assignees.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id="c-due" label={nVence ?? ""}>
                  <input
                    id="c-due"
                    name="dueAt"
                    type="datetime-local"
                    defaultValue={card.dueAt ? utcToBogotaInput(card.dueAt) : ""}
                    className={inputClass}
                  />
                </Campo>
                {card.pipelineKind === "SPONSORSHIP" ? (
                  <>
                    <Campo id="c-amount" label={monto ?? ""}>
                      <input
                        id="c-amount"
                        name="amount"
                        type="number"
                        min={0}
                        step="0.01"
                        defaultValue={card.amount ?? ""}
                        className={inputClass}
                      />
                    </Campo>
                    <Campo id="c-counterpart" label={contraprestacion ?? ""}>
                      <textarea
                        id="c-counterpart"
                        name="counterpart"
                        rows={3}
                        defaultValue={
                          typeof card.fields.counterpart === "string" ? card.fields.counterpart : ""
                        }
                        className={inputClass}
                      />
                    </Campo>
                  </>
                ) : null}
                <AdminSubmitButton type="submit" className="boton-secundario self-start">
                  {t("T-253")}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="eyebrow text-xs">{notasTitulo}</h3>
            <form action={addCardNoteAction} className="flex flex-col gap-2">
              <AdminFormBody>
                <input type="hidden" name="pipelineId" value={id} />
                <input type="hidden" name="cardId" value={card.id} />
                <label htmlFor="c-note" className="sr-only">
                  {tList("T-456")[0]}
                </label>
                <textarea
                  id="c-note"
                  name="body"
                  rows={3}
                  required
                  className={inputClass}
                  placeholder={t("T-455")}
                />
                <AdminSubmitButton type="submit" className="boton-secundario self-start">
                  {tList("T-456")[0]}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
            {subjectTimeline.length === 0 ? (
              <p className="text-sm text-tinta-suave">{t("T-457")}</p>
            ) : (
              <ol className="flex list-none flex-col gap-2 p-0 text-sm">
                {subjectTimeline.map((item) => (
                  <li
                    key={item.id}
                    className="border-borde border-t pt-2 first:border-t-0 first:pt-0"
                  >
                    <p className="font-semibold">{item.summary}</p>
                    <p className="text-xs text-tinta-suave">{formatDateTime(item.occurredAt)}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="flex flex-col gap-3">
            <h3 className="eyebrow text-xs">{tareasTitulo}</h3>
            {cardTasks.rows.length === 0 ? (
              <p className="text-sm text-tinta-suave">{t("T-1059")}</p>
            ) : (
              <ul className="flex list-none flex-col gap-1 p-0 text-sm">
                {cardTasks.rows.map((task) => (
                  <li
                    key={task.id}
                    className={task.status === "DONE" ? "text-tinta-suave line-through" : ""}
                  >
                    {task.title}
                    {task.dueAt ? ` · ${formatDate(task.dueAt)}` : ""}
                  </li>
                ))}
              </ul>
            )}
            <form action={createCardTaskAction} className="flex flex-col gap-2">
              <AdminFormBody>
                <input type="hidden" name="pipelineId" value={id} />
                <input type="hidden" name="cardId" value={card.id} />
                <Campo id="ct-title" label={tTitulo ?? ""}>
                  <input id="ct-title" name="title" required className={inputClass} />
                </Campo>
                <Campo id="ct-assignee" label={tResponsable ?? ""}>
                  <select id="ct-assignee" name="assigneeId" defaultValue="" className={inputClass}>
                    <option value="">—</option>
                    {assignees.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo id="ct-due" label={tVence ?? ""}>
                  <input id="ct-due" name="dueAt" type="datetime-local" className={inputClass} />
                </Campo>
                <AdminSubmitButton type="submit" className="boton-secundario self-start">
                  {t("T-251")}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
          </section>
        </ResourcePanel>
      ) : null}

      {nueva ? (
        <ResourcePanel title={t("T-972")} closeHref={base} closeLabel={t("T-291")}>
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
            >
              {error}
            </p>
          ) : null}
          <form action={base} method="get" className="flex flex-col gap-2">
            <input type="hidden" name="nueva" value="1" />
            <Campo id="n-q" label={nPersona ?? ""} help={t("T-1054")}>
              <input id="n-q" name="q" type="search" defaultValue={q} className={inputClass} />
            </Campo>
            <AdminSubmitButton type="submit" className="boton-secundario self-start">
              {t("T-250")}
            </AdminSubmitButton>
          </form>
          <form action={createCardAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="pipelineId" value={id} />
              <fieldset className="flex flex-col gap-2">
                <legend className="eyebrow text-xs">{t("T-1055")}</legend>
                {q && people.length === 0 ? (
                  <p className="text-sm text-tinta-suave">{t("T-256")}</p>
                ) : null}
                {people.map((item) => (
                  <label
                    key={item.id}
                    htmlFor={`s-${item.id}`}
                    className="flex items-center gap-2 text-sm"
                  >
                    <input
                      id={`s-${item.id}`}
                      type="radio"
                      name="subject"
                      value={`person:${item.id}`}
                      required
                    />
                    <span>
                      {item.fullName} <span className="text-tinta-suave">· {item.email}</span>
                    </span>
                  </label>
                ))}
                <label htmlFor="s-org" className="flex flex-col gap-1 text-sm">
                  <span className="eyebrow text-xs">{nOrganizacion}</span>
                  <select id="s-org" name="subject" defaultValue="" className={inputClass}>
                    <option value="">—</option>
                    {organizations.map((item) => (
                      <option key={item.id} value={`organization:${item.id}`}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <Campo id="n-edition" label={nEdicion ?? ""}>
                <select id="n-edition" name="editionId" defaultValue="" className={inputClass}>
                  <option value="">—</option>
                  {editions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="n-title" label={nTitulo ?? ""}>
                <input id="n-title" name="title" className={inputClass} />
              </Campo>
              <Campo id="n-owner" label={nResponsable ?? ""}>
                <select id="n-owner" name="ownerId" defaultValue="" className={inputClass}>
                  <option value="">—</option>
                  {assignees.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="n-due" label={nVence ?? ""}>
                <input id="n-due" name="dueAt" type="datetime-local" className={inputClass} />
              </Campo>
              <AdminSubmitButton type="submit" className="boton-calido self-start">
                {t("T-253")}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {etapas ? (
        <ResourcePanel title={t("T-977")} closeHref={base} closeLabel={t("T-291")}>
          {error ? (
            <p
              role="alert"
              className="rounded-xl bg-oe-orange px-4 py-2 text-sm font-semibold text-oe-navy"
            >
              {error}
            </p>
          ) : null}
          <ol className="flex list-none flex-col gap-4 p-0">
            {board.map((stage, index) => (
              <li key={stage.id} className="flex flex-col gap-2 rounded-xl border border-borde p-3">
                <form action={saveStageAction} className="flex flex-col gap-2">
                  <AdminFormBody>
                    <input type="hidden" name="pipelineId" value={id} />
                    <input type="hidden" name="stageId" value={stage.id} />
                    <Campo id={`e-name-${stage.id}`} label={nombreEtapa ?? ""}>
                      <input
                        id={`e-name-${stage.id}`}
                        name="name"
                        required
                        defaultValue={stage.name}
                        className={inputClass}
                      />
                    </Campo>
                    <div className="flex gap-4">
                      <Casilla
                        id={`e-won-${stage.id}`}
                        name="isWon"
                        label={ganada ?? ""}
                        defaultChecked={stage.isWon}
                      />
                      <Casilla
                        id={`e-lost-${stage.id}`}
                        name="isLost"
                        label={perdida ?? ""}
                        defaultChecked={stage.isLost}
                      />
                    </div>
                    <AdminSubmitButton type="submit" className="boton-secundario self-start">
                      {t("T-253")}
                    </AdminSubmitButton>
                  </AdminFormBody>
                </form>
                <div className="flex flex-wrap gap-2">
                  {index > 0 ? (
                    <form action={moveStageAction}>
                      <AdminFormBody>
                        <input type="hidden" name="pipelineId" value={id} />
                        <input type="hidden" name="stageId" value={stage.id} />
                        <input type="hidden" name="direction" value="up" />
                        <AdminSubmitButton
                          type="submit"
                          className="boton-secundario min-h-9 px-3 py-1 text-sm"
                        >
                          {subir}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </form>
                  ) : null}
                  {index < board.length - 1 ? (
                    <form action={moveStageAction}>
                      <AdminFormBody>
                        <input type="hidden" name="pipelineId" value={id} />
                        <input type="hidden" name="stageId" value={stage.id} />
                        <input type="hidden" name="direction" value="down" />
                        <AdminSubmitButton
                          type="submit"
                          className="boton-secundario min-h-9 px-3 py-1 text-sm"
                        >
                          {bajar}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </form>
                  ) : null}
                  <form action={deleteStageAction}>
                    <AdminFormBody>
                      <input type="hidden" name="pipelineId" value={id} />
                      <input type="hidden" name="stageId" value={stage.id} />
                      <AdminSubmitButton
                        type="submit"
                        className="boton-secundario min-h-9 px-3 py-1 text-sm"
                      >
                        {borrar}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </form>
                </div>
              </li>
            ))}
          </ol>
          <form
            action={saveStageAction}
            className="flex flex-col gap-2 rounded-xl border border-borde border-dashed p-3"
          >
            <AdminFormBody>
              <input type="hidden" name="pipelineId" value={id} />
              <Campo id="e-new" label={nombreEtapa ?? ""}>
                <input id="e-new" name="name" required className={inputClass} />
              </Campo>
              <div className="flex gap-4">
                <Casilla id="e-new-won" name="isWon" label={ganada ?? ""} />
                <Casilla id="e-new-lost" name="isLost" label={perdida ?? ""} />
              </div>
              <AdminSubmitButton type="submit" className="boton-calido self-start">
                {t("T-251")}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}
      <span className="sr-only">{moverA}</span>
    </div>
  );
}
