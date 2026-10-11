import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireOperator } from "@/app/_authz/occasion";
import { single } from "@/app/_lib/search";
import { getEnv } from "@/env";
import { hasRecentStepUp } from "@/modules/identity";
import {
  buildLiveSnapshot,
  CHECK_IN_SOURCES,
  CHECK_IN_STATUSES,
  type CheckInStatus,
  canOpenOccasion,
  getOccasion,
  listCheckIns,
  listOccasionScores,
  SURVEY_TEXT_MIN,
  surveySummary,
} from "@/modules/participation";
import { occasionKindLabel, occasionStatusCell } from "@/modules/participation/admin";
import { ConsolaEnVivo } from "@/modules/participation/components/ConsolaEnVivo";
import {
  getPeopleByIds,
  listAllCommittees,
  listTermCommitteeMembers,
  searchMembersByName,
} from "@/modules/people";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateRange, formatDateTime, formatTime } from "@/shared/lib/dates";
import {
  approveAllAction,
  cancelAction,
  decideAction,
  lifecycleAction,
  registerAction,
  rotatingAction,
} from "./actions";

// Consola de la ocasión (ADR-035 reglas 4, 6, 7, 15 y 16): QR con el código rotativo, contador en vivo,
// pendientes, alta manual, ciclo de vida y score por comité. UI a medida sobre el mismo kit visual.

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export async function generateMetadata({
  params,
}: PageProps<"/admin/ocasiones/[id]">): Promise<Metadata> {
  const { id } = await params;
  const occasion = await getOccasion(id);
  return { title: occasion ? t("T-584", { título: occasion.title }) : "" };
}

export default async function ConsolaPage({
  params,
  searchParams,
}: PageProps<"/admin/ocasiones/[id]">) {
  const { id } = await params;
  const search = (await searchParams) as Search;
  const accion = single(search.accion);
  const q = single(search.q).trim();
  const estado = single(search.estado);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const checkInParam = single(search.checkIn);
  const base = `/admin/ocasiones/${id}`;

  const found = await requireOperator(id, base);
  if (!found) {
    notFound();
  }
  const { actor, occasion } = found;
  const survey = occasion.status === "CLOSED" ? await surveySummary(id) : null;
  const [ratingLow, ratingHigh] = tList("T-1102");
  const [siLabel, noLabel] = tList("T-1058");
  const liveCredits = occasion.points > 0 && occasion.approvedCount > 0;
  if (accion === "cancelar" && liveCredits && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(`${base}?accion=cancelar`)}`);
  }

  const statusFilter = CHECK_IN_STATUSES.includes(estado as CheckInStatus)
    ? [estado as CheckInStatus]
    : undefined;
  const [snapshot, checkIns, roster, committees, scores, results] = await Promise.all([
    buildLiveSnapshot(id),
    listCheckIns(id, statusFilter),
    listTermCommitteeMembers(occasion.termId),
    listAllCommittees(),
    listOccasionScores(id),
    q ? searchMembersByName(q) : Promise.resolve([]),
  ]);
  if (!snapshot) {
    notFound();
  }
  const people = await getPeopleByIds(checkIns.map((item) => item.personId));
  const committeeName = new Map(committees.map((item) => [item.id, item.name]));
  const committeesOf = new Map<string, string[]>();
  for (const member of roster) {
    if (member.leftAt) continue;
    const names = committeesOf.get(member.personId) ?? [];
    names.push(committeeName.get(member.committeeId) ?? "");
    committeesOf.set(member.personId, names);
  }
  const pending = checkIns.filter((item) => item.status === "PENDING");
  const statusLabels = tList("T-597");
  const sourceLabels = tList("T-596");
  const [abrir, cerrar, cancelar] = tList("T-589");
  const [activar, rotar, desactivar] = tList("T-588");
  const [aprobar, rechazar, anularLabel] = tList("T-592");
  const [altaTitulo, altaBoton] = tList("T-598");
  const columnLabels = tList("T-595");
  const scoreLabels = tList("T-605");
  const [todos] = tList("T-639");
  const statusLabel = (status: CheckInStatus) =>
    statusLabels[CHECK_IN_STATUSES.indexOf(status)] ?? status;
  const canDecide = actor.isAdmin;
  const canOpen = occasion.status === "DRAFT" && canOpenOccasion(actor, occasion);
  const cell = occasionStatusCell(occasion.status);
  const env = getEnv();
  const toCancel = checkInParam ? checkIns.find((item) => item.id === checkInParam) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Insignia fondo={cell.badge}>{cell.text}</Insignia>
          <span className="eyebrow">{occasionKindLabel(occasion)}</span>
        </div>
        <h1 className="text-display-lg">{t("T-584", { título: occasion.title })}</h1>
        <p className="text-tinta-suave">
          {formatDateRange(occasion.startsAt, occasion.endsAt)}
          {occasion.location ? ` · ${occasion.location}` : ""}
          {" · "}
          {occasion.points > 0 ? t("T-529", { n: occasion.points }) : t("T-530")}
        </p>
        {occasion.status === "CLOSED" && occasion.closedAt ? (
          <p className="text-sm">{t("T-612", { fecha: formatDateTime(occasion.closedAt) })}</p>
        ) : null}
        {occasion.status === "CANCELLED" ? (
          <p className="text-sm text-oe-orange">
            {t("T-613", {
              fecha: formatDateTime(occasion.updatedAt),
              motivo: occasion.cancelReason ?? "—",
            })}
          </p>
        ) : null}
        {guardado ? (
          <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
        ) : null}
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
      </header>

      <div className="flex flex-wrap items-center gap-3">
        {canOpen ? (
          <form action={lifecycleAction}>
            <AdminFormBody>
              <input type="hidden" name="occasionId" value={id} />
              <input type="hidden" name="op" value="open" />
              <AdminSubmitButton type="submit" className="boton-calido">
                {abrir}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        ) : null}
        {occasion.status === "DRAFT" && !canOpen ? (
          <p className="text-sm text-tinta-suave">{t("T-653")}</p>
        ) : null}
        {occasion.status === "OPEN" ? (
          <form action={lifecycleAction}>
            <AdminFormBody>
              <input type="hidden" name="occasionId" value={id} />
              <input type="hidden" name="op" value="close" />
              <AdminSubmitButton type="submit" className="boton-secundario">
                {cerrar}
              </AdminSubmitButton>
            </AdminFormBody>
          </form>
        ) : null}
        {occasion.status !== "CANCELLED" ? (
          <form action={rotatingAction} className="flex flex-wrap gap-2">
            <AdminFormBody>
              <input type="hidden" name="occasionId" value={id} />
              {occasion.requireRotatingCode ? (
                <>
                  <AdminSubmitButton
                    type="submit"
                    name="op"
                    value="rotate"
                    className="boton-secundario"
                  >
                    {rotar}
                  </AdminSubmitButton>
                  <AdminSubmitButton
                    type="submit"
                    name="op"
                    value="disable"
                    className="boton-secundario"
                  >
                    {desactivar}
                  </AdminSubmitButton>
                </>
              ) : (
                <AdminSubmitButton
                  type="submit"
                  name="op"
                  value="enable"
                  className="boton-secundario"
                >
                  {activar}
                </AdminSubmitButton>
              )}
            </AdminFormBody>
          </form>
        ) : null}
        {occasion.status === "OPEN" || (actor.isAdmin && occasion.status === "CLOSED") ? (
          <Link href={`${base}/anfitrion`} className="boton-secundario">
            {t("T-607")}
          </Link>
        ) : null}
        {actor.isAdmin && occasion.status !== "CANCELLED" ? (
          <Link href={`${base}?accion=cancelar`} className="boton-secundario text-oe-orange">
            {cancelar}
          </Link>
        ) : null}
      </div>

      {canDecide && pending.length > 0 ? (
        <section aria-label={t("T-591")} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-display-md">{t("T-591")}</h2>
            <form action={approveAllAction}>
              <AdminFormBody>
                <input type="hidden" name="occasionId" value={id} />
                <AdminSubmitButton type="submit" className="boton-primario">
                  {t("T-593")}
                </AdminSubmitButton>
              </AdminFormBody>
            </form>
          </div>
          <ul className="flex list-none flex-col gap-2 p-0">
            {pending.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-fondo px-4 py-2"
              >
                <span className="font-semibold">{people.get(item.personId)?.fullName?.trim()}</span>
                <div className="flex gap-2">
                  <form action={decideAction}>
                    <AdminFormBody>
                      <input type="hidden" name="occasionId" value={id} />
                      <input type="hidden" name="checkInId" value={item.id} />
                      <input type="hidden" name="decision" value="APPROVE" />
                      <input type="hidden" name="seen" value={item.status} />
                      <AdminSubmitButton
                        type="submit"
                        className="boton-primario min-h-9 px-4 py-1 text-sm"
                      >
                        {aprobar}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </form>
                  <form action={decideAction}>
                    <AdminFormBody>
                      <input type="hidden" name="occasionId" value={id} />
                      <input type="hidden" name="checkInId" value={item.id} />
                      <input type="hidden" name="decision" value="REJECT" />
                      <input type="hidden" name="seen" value={item.status} />
                      <AdminSubmitButton
                        type="submit"
                        className="boton-secundario min-h-9 px-4 py-1 text-sm"
                      >
                        {rechazar}
                      </AdminSubmitButton>
                    </AdminFormBody>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConsolaEnVivo
        occasionId={id}
        initial={snapshot}
        locale="es-CO"
        timeZone={env.APP_TIMEZONE}
        labels={{
          qrTitle: t("T-586"),
          qrAlt: t("T-586"),
          link: t("T-611", { url: "{url}" }),
          code: t("T-587", { codigo: "{codigo}", s: "{s}" }),
          stale: t("T-3260"),
          counters: tList("T-585"),
          recentTitle: t("T-603"),
          recentEmpty: t("T-671"),
          sources: sourceLabels,
          statuses: statusLabels,
        }}
      />

      {occasion.status === "OPEN" || (actor.isAdmin && occasion.status === "CLOSED") ? (
        <section aria-label={altaTitulo} className="flex flex-col gap-3">
          <h2 className="text-display-md">{altaTitulo}</h2>
          <form action={base} method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="eyebrow text-xs">{t("T-599")}</span>
              <input name="q" defaultValue={q} className={inputClass} />
            </label>
            <AdminSubmitButton type="submit" className="boton-secundario">
              {t("T-250")}
            </AdminSubmitButton>
          </form>
          {q ? (
            results.length === 0 ? (
              <p className="text-tinta-suave">{t("T-600")}</p>
            ) : (
              <ul className="flex list-none flex-col gap-2 p-0">
                {results.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-fondo px-4 py-2"
                  >
                    <span className="font-semibold">{item.fullName.trim()}</span>
                    <form action={registerAction}>
                      <AdminFormBody>
                        <input type="hidden" name="occasionId" value={id} />
                        <input type="hidden" name="personId" value={item.id} />
                        <input type="hidden" name="back" value="consola" />
                        <AdminSubmitButton
                          type="submit"
                          className="boton-primario min-h-9 px-4 py-1 text-sm"
                        >
                          {altaBoton}
                        </AdminSubmitButton>
                      </AdminFormBody>
                    </form>
                  </li>
                ))}
              </ul>
            )
          ) : null}
        </section>
      ) : null}

      {occasion.points > 0 ? (
        <section aria-label={t("T-604")} className="flex flex-col gap-3">
          <h2 className="text-display-md">{t("T-604")}</h2>
          {scores.length === 0 ? (
            <p className="text-tinta-suave">{t("T-606")}</p>
          ) : (
            <AdminTableRegion label={t("T-604")} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {scoreLabels.map((label) => (
                      <th scope="col" key={label} className="eyebrow py-2 pr-4 text-xs">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {scores.map((row) => (
                    <tr key={row.id} className="border-borde border-t">
                      <td className="py-2 pr-4 font-semibold">
                        {committeeName.get(row.committeeId) ?? ""}
                      </td>
                      <td className="py-2 pr-4">{row.present}</td>
                      <td className="py-2 pr-4">{row.eligible}</td>
                      <td className="py-2 pr-4">{Math.round(row.rate * 100)} %</td>
                      <td className="py-2 pr-4">{Math.round(row.smoothedRate * 100)} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableRegion>
          )}
        </section>
      ) : null}

      <section aria-label={t("T-594")} className="rounded-xl border border-borde bg-fondo p-4">
        <details open={Boolean(statusFilter)}>
          <summary className="cursor-pointer py-1 font-semibold">
            {t("T-594")} · {checkIns.length}
          </summary>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <nav aria-label={columnLabels[4] ?? ""} className="flex flex-wrap gap-2 text-sm">
              <Link href={base} className={statusFilter ? "underline" : "font-semibold"}>
                {todos}
              </Link>
              {CHECK_IN_STATUSES.map((status) => (
                <Link
                  key={status}
                  href={`${base}?estado=${status}`}
                  className={statusFilter?.[0] === status ? "font-semibold" : "underline"}
                >
                  {statusLabel(status)}
                </Link>
              ))}
            </nav>
          </div>
          {checkIns.length === 0 ? (
            <p className="text-tinta-suave">{t("T-671")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="admin-data-table w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {columnLabels.map((label) => (
                      <th scope="col" key={label} className="eyebrow py-2 pr-4 text-xs">
                        {label}
                      </th>
                    ))}
                    {canDecide ? <th scope="col" className="py-2" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {checkIns.map((item) => (
                    <tr key={item.id} className="border-borde border-t">
                      <td data-label={columnLabels[0]} className="py-2 pr-4 font-semibold">
                        {people.get(item.personId)?.fullName?.trim()}
                      </td>
                      <td data-label={columnLabels[1]} className="py-2 pr-4">
                        {(committeesOf.get(item.personId) ?? []).join(", ") || "—"}
                      </td>
                      <td data-label={columnLabels[2]} className="py-2 pr-4">
                        {formatTime(item.at)}
                      </td>
                      <td data-label={columnLabels[3]} className="py-2 pr-4">
                        {sourceLabels[CHECK_IN_SOURCES.indexOf(item.source)] ?? item.source}
                      </td>
                      <td data-label={columnLabels[4]} className="py-2 pr-4">
                        {statusLabel(item.status)}
                      </td>
                      {canDecide ? (
                        <td data-label={t("T-1500")} className="py-2">
                          <div className="flex gap-2">
                            {item.status === "PENDING" || item.status === "REJECTED" ? (
                              <form action={decideAction}>
                                <AdminFormBody>
                                  <input type="hidden" name="occasionId" value={id} />
                                  <input type="hidden" name="checkInId" value={item.id} />
                                  <input type="hidden" name="decision" value="APPROVE" />
                                  <input type="hidden" name="seen" value={item.status} />
                                  <AdminSubmitButton
                                    type="submit"
                                    className="boton-secundario min-h-8 px-3 py-1 text-xs"
                                  >
                                    {aprobar}
                                  </AdminSubmitButton>
                                </AdminFormBody>
                              </form>
                            ) : null}
                            {item.status === "PENDING" ? (
                              <form action={decideAction}>
                                <AdminFormBody>
                                  <input type="hidden" name="occasionId" value={id} />
                                  <input type="hidden" name="checkInId" value={item.id} />
                                  <input type="hidden" name="decision" value="REJECT" />
                                  <input type="hidden" name="seen" value={item.status} />
                                  <AdminSubmitButton
                                    type="submit"
                                    className="boton-secundario min-h-8 px-3 py-1 text-xs"
                                  >
                                    {rechazar}
                                  </AdminSubmitButton>
                                </AdminFormBody>
                              </form>
                            ) : null}
                            {item.status === "APPROVED" ? (
                              <Link
                                href={`${base}?accion=anular&checkIn=${item.id}`}
                                className="boton-secundario min-h-8 px-3 py-1 text-xs"
                              >
                                {anularLabel}
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </details>
      </section>

      {accion === "cancelar" && actor.isAdmin ? (
        <ResourcePanel title={cancelar ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <form action={cancelAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="occasionId" value={id} />
              <p>{t("T-161", { actividad: occasion.title, n: occasion.approvedCount })}</p>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-434")}</span>
                <textarea name="reason" required rows={3} className={inputClass} />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {t("T-590")}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {accion === "anular" && actor.isAdmin && toCancel ? (
        <ResourcePanel title={anularLabel ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <form action={decideAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="occasionId" value={id} />
              <input type="hidden" name="checkInId" value={toCancel.id} />
              <input type="hidden" name="decision" value="CANCEL" />
              <input type="hidden" name="seen" value={toCancel.status} />
              <p className="font-semibold">{people.get(toCancel.personId)?.fullName?.trim()}</p>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-434")}</span>
                <textarea name="reason" required rows={3} className={inputClass} />
                <span className="text-xs text-tinta-suave">{t("T-609")}</span>
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {anularLabel}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}
      {occasion.status === "CLOSED" ? (
        <section
          aria-labelledby="encuesta-titulo"
          className="rounded-xl border border-borde bg-fondo p-4"
        >
          <details>
            <summary id="encuesta-titulo" className="cursor-pointer py-1 font-semibold">
              {t("T-1161")}
            </summary>
            <div className="mt-4">
              {!survey ? (
                <p className="text-tinta-suave">{t("T-1166")}</p>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="font-semibold">
                    {survey.formTitle} ·{" "}
                    {t("T-1162", { respondieron: survey.answered, invitados: survey.invited })}
                  </p>
                  {survey.answered === 0 ? (
                    <p className="text-tinta-suave">{t("T-1163")}</p>
                  ) : (
                    <ul className="flex list-none flex-col gap-4 p-0">
                      {survey.questions.map((question) => (
                        <li
                          key={question.key}
                          className="flex flex-col gap-2 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
                        >
                          <h3 className="font-semibold">{question.label}</h3>
                          {question.type === "RATING" ? (
                            <>
                              <p className="text-display-md">
                                {question.average === null
                                  ? "—"
                                  : t("T-1164", { promedio: question.average.toFixed(1) })}
                              </p>
                              <ul className="flex list-none flex-wrap gap-2 p-0 text-sm">
                                {question.distribution.map((item) => (
                                  <li key={item.value}>
                                    <Insignia fondo="sky">
                                      {item.value === "1"
                                        ? ratingLow
                                        : item.value === "5"
                                          ? ratingHigh
                                          : ""}{" "}
                                      {item.value}: {item.count}
                                    </Insignia>
                                  </li>
                                ))}
                              </ul>
                            </>
                          ) : question.distribution.length > 0 ? (
                            <ul className="flex list-none flex-wrap gap-2 p-0 text-sm">
                              {question.distribution.map((item) => (
                                <li key={item.value}>
                                  <Insignia fondo="sky">
                                    {question.type === "CHECKBOX"
                                      ? item.value === "true"
                                        ? siLabel
                                        : noLabel
                                      : item.value}
                                    : {item.count}
                                  </Insignia>
                                </li>
                              ))}
                            </ul>
                          ) : question.texts ? (
                            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
                              {question.texts.map((text, index) => (
                                <li key={`${question.key}-${index.toString()}`}>{text}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-sm text-tinta-suave">
                              {t("T-1165", { n: SURVEY_TEXT_MIN })}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </details>
        </section>
      ) : null}
    </div>
  );
}
