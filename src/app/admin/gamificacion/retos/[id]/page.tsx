import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import {
  getChallengeAdmin,
  hasGrantedRewards,
  listOccasionsForTerm,
  loadGamificationSettings,
} from "@/modules/participation";
import { ChallengeCard } from "@/modules/participation/components/ChallengeCard";
import { ChallengeEditor } from "@/modules/participation/components/ChallengeEditor";
import { getPeopleByIds, listCommitteesForSelection } from "@/modules/people";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { t, tList } from "@/shared/copy";
import { formatDateTime, utcToBogotaInput } from "@/shared/lib/dates";
import { annulAction, reviewAction } from "../../revision/actions";
import {
  cancelChallengeAction,
  duplicateChallengeAction,
  publishChallengeAction,
  saveChallengeAction,
} from "../actions";

// Detalle de un reto (ADR-067 reglas 3 y 17): editor con campos congelados tras publicar, vista
// previa de miembro, acciones de ciclo de vida y la tabla de participantes con revisión.

export const metadata: Metadata = { title: tList("T-2405")[1] ?? "" };

type Search = Record<string, string | string[] | undefined>;

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export default async function RetoPage({
  params,
  searchParams,
}: PageProps<"/admin/gamificacion/retos/[id]">) {
  const { id } = await params;
  const actor = await requireAdminActor(`/admin/gamificacion/retos/${id}`);
  const search = (await searchParams) as Search;
  const accion = single(search.accion);
  const participationId = single(search.participationId);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const back = `/admin/gamificacion/retos/${id}`;

  const [detail, settings] = await Promise.all([getChallengeAdmin(id), loadGamificationSettings()]);
  if (!detail) {
    notFound();
  }
  // Un comité desactivado después de publicar el reto sigue visible en su audiencia.
  const committees = await listCommitteesForSelection(detail.challenge.audienceCommitteeIds);
  const { challenge, questions, occasion, participants } = detail;
  const locked = challenge.status !== "DRAFT";
  const actions = tList("T-2510");
  const participantColumns = tList("T-2518");
  const participationStates = tList("T-2410");
  const imageStates = tList("T-2527");
  const reviewActions = tList("T-2525");
  const granted = challenge.status !== "CANCELLED" ? await hasGrantedRewards(id) : false;
  const needsStepUp = accion === "cancelar" && granted && !hasRecentStepUp(actor);
  if (needsStepUp) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(`${back}?accion=cancelar`)}`);
  }
  // Anular un premio entregado también exige step-up: se reautentica antes de abrir el panel.
  if (accion === "anular" && participationId && !hasRecentStepUp(actor)) {
    redirect(
      `/ingresar/paso?next=${encodeURIComponent(`${back}?accion=anular&participationId=${participationId}`)}`,
    );
  }
  const occasions = await listOccasionsForTerm(challenge.termId, ["DRAFT", "OPEN"]);
  const deciders = await getPeopleByIds(
    participants
      .map((row) => row.participation.decidedById)
      .filter((id): id is string => id !== null),
  );
  const statusIndex = (status: string) =>
    ["AVAILABLE", "SENT", "PENDING", "COMPLETED", "REJECTED", "EXPIRED"].indexOf(status);

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="eyebrow text-xs">
            <Link href="/admin/gamificacion/retos" className="underline">
              {tList("T-2404")[1]}
            </Link>
          </p>
          <h1 className="text-display-lg">{challenge.title}</h1>
          {guardado ? (
            <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
        </div>
      </header>

      <form action={saveChallengeAction} className="flex flex-col gap-6">
        <AdminFormBody>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={back} />
          {locked ? <p className="text-sm text-tinta-suave">{t("T-2512")}</p> : null}
          <ChallengeEditor
            initial={{
              kind: challenge.kind,
              title: challenge.title,
              description: challenge.description,
              audience: challenge.audience,
              audienceCommitteeIds: challenge.audienceCommitteeIds,
              opensAt: utcToBogotaInput(challenge.opensAt),
              closesAt: utcToBogotaInput(challenge.closesAt),
              basePoints: challenge.basePoints,
              passPercent: challenge.passPercent,
              occasionId: challenge.occasionId,
              questions: questions.map((question) => ({
                prompt: question.prompt,
                options: question.options,
                correctIndex: question.correctIndex,
              })),
            }}
            occasions={occasions
              .filter((item) => item.points > 0)
              .map((item) => ({ id: item.id, label: item.title }))}
            committees={committees.map((item) => ({ id: item.id, name: item.name }))}
            locked={locked}
            defaults={settings.defaults}
          />
          <div className="flex flex-wrap items-center gap-3">
            <AdminSubmitButton type="submit" className="boton-primario">
              {actions[0]}
            </AdminSubmitButton>
            <Link href="/admin/gamificacion/retos" className="boton-secundario">
              {t("T-254")}
            </Link>
          </div>
        </AdminFormBody>
      </form>

      <div className="flex flex-wrap gap-3">
        {challenge.status === "DRAFT" ? (
          <form action={publishChallengeAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="back" value={back} />
            <AdminSubmitButton type="submit" className="boton-calido">
              {actions[1]}
            </AdminSubmitButton>
            <p className="mt-1 max-w-md text-xs text-tinta-suave">{t("T-2512")}</p>
          </form>
        ) : null}
        {challenge.status !== "CANCELLED" ? (
          <Link href={`${back}?accion=cancelar`} className="boton-secundario">
            {actions[2]}
          </Link>
        ) : null}
        <form action={duplicateChallengeAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="back" value={back} />
          <AdminSubmitButton type="submit" className="boton-secundario">
            {actions[3]}
          </AdminSubmitButton>
        </form>
      </div>

      <section aria-label={t("T-2516")} className="flex flex-col gap-3">
        <h2 className="text-display-md">{t("T-2516")}</h2>
        <ChallengeCard
          card={{
            title: challenge.title,
            kind: challenge.kind,
            audience: challenge.audience,
            closesAt: challenge.closesAt,
            basePoints: challenge.basePoints,
            state: challenge.state,
          }}
        />
        {occasion ? (
          <p className="text-sm text-tinta-suave">
            {occasion.title} · {formatDateTime(occasion.startsAt)} · {occasion.points} pts ·{" "}
            <Link href={`/a/${occasion.publicId}`} className="underline">
              /a/{occasion.publicId}
            </Link>
          </p>
        ) : null}
      </section>

      {challenge.kind === "TRIVIA" ? (
        <section aria-label={t("T-2509")} className="flex flex-col gap-3">
          <h2 className="text-display-md">{t("T-2509")}</h2>
          <ol className="flex list-decimal flex-col gap-4 pl-6">
            {questions.map((question) => (
              <li key={question.id}>
                <p className="font-semibold">{question.prompt}</p>
                <ul className="mt-1 flex list-none flex-col gap-1 p-0 text-sm">
                  {question.options.map((option, index) => (
                    <li
                      key={`${question.id}-${index + 1}`}
                      className={
                        index === question.correctIndex ? "font-semibold text-oe-blue" : ""
                      }
                    >
                      {option}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <section aria-label={t("T-2517")} className="flex flex-col gap-3">
        <h2 className="text-display-md">{t("T-2517")}</h2>
        {participants.length === 0 ? (
          <p className="text-tinta-suave">{t("T-256")}</p>
        ) : (
          <AdminTableRegion label={t("T-2517")}>
            <table className="admin-data-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  {participantColumns.map((label) => (
                    <th scope="col" key={label} className="eyebrow py-2 pr-4 text-xs">
                      {label}
                    </th>
                  ))}
                  <th scope="col" className="py-2" />
                </tr>
              </thead>
              <tbody>
                {participants.map((row) => (
                  <tr key={row.participation.id} className="border-borde border-t align-top">
                    <td data-label={participantColumns[0]} className="py-2 pr-4 font-semibold">
                      {row.personName}
                    </td>
                    <td data-label={participantColumns[1]} className="py-2 pr-4">
                      {participationStates[statusIndex(row.participation.status)] ??
                        row.participation.status}
                    </td>
                    <td data-label={participantColumns[2]} className="py-2 pr-4 whitespace-nowrap">
                      {formatDateTime(row.participation.submittedAt)}
                    </td>
                    <td data-label={participantColumns[3]} className="py-2 pr-4 tabular-nums">
                      {row.reward ? `${row.reward.baseGranted} + ${row.reward.extraPoints}` : "—"}
                    </td>
                    <td data-label={participantColumns[4]} className="py-2 pr-4">
                      {row.boosterKind ?? "—"}
                    </td>
                    <td data-label={participantColumns[5]} className="py-2 pr-4">
                      {row.participation.decidedById
                        ? (deciders.get(row.participation.decidedById)?.fullName?.trim() ?? "—")
                        : "—"}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {row.participation.status === "PENDING" && challenge.kind === "EVIDENCE" ? (
                          <>
                            <form action={reviewAction}>
                              <input
                                type="hidden"
                                name="participationId"
                                value={row.participation.id}
                              />
                              <input type="hidden" name="decision" value="APPROVE" />
                              <input type="hidden" name="back" value={back} />
                              <AdminSubmitButton className="boton-primario min-h-8 px-3 py-1 text-xs">
                                {reviewActions[0]}
                              </AdminSubmitButton>
                            </form>
                            <Link
                              href={`${back}?accion=rechazar&participationId=${row.participation.id}`}
                              className="boton-secundario min-h-8 px-3 py-1 text-xs"
                            >
                              {reviewActions[1]}
                            </Link>
                          </>
                        ) : null}
                        {row.participation.status === "COMPLETED" ? (
                          <Link
                            href={`${back}?accion=anular&participationId=${row.participation.id}`}
                            className="boton-secundario min-h-8 px-3 py-1 text-xs"
                          >
                            {reviewActions[2]}
                          </Link>
                        ) : null}
                      </div>
                      {row.files.length > 0 ? (
                        <ul className="mt-2 flex list-none flex-col gap-1 p-0 text-xs">
                          {row.files.map((file) => (
                            <li key={file.id}>
                              {file.status === "READY" ? (
                                <Link
                                  href={`/api/retos/evidencia/${file.id}`}
                                  className="underline"
                                >
                                  {file.objectKey}
                                </Link>
                              ) : (
                                <span className="text-tinta-suave">
                                  {file.status === "PENDING" ? imageStates[0] : imageStates[1]}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableRegion>
        )}
      </section>

      {accion === "cancelar" && challenge.status !== "CANCELLED" ? (
        <ResourcePanel title={actions[2] ?? ""} closeHref={back} closeLabel={t("T-291")}>
          <form action={cancelChallengeAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="back" value={back} />
              {granted ? (
                <p className="rounded-xl bg-oe-yellow-soft px-4 py-3 text-oe-navy">{t("T-2515")}</p>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-2514")}</span>
                <textarea name="reason" required rows={3} className={inputClass} />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {actions[2]}
                </AdminSubmitButton>
                <Link href={back} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {accion === "rechazar" && participationId ? (
        <ResourcePanel title={t("T-2526")} closeHref={back} closeLabel={t("T-291")}>
          <form action={reviewAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="participationId" value={participationId} />
              <input type="hidden" name="decision" value="REJECT" />
              <input type="hidden" name="back" value={back} />
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-2526")}</span>
                <textarea name="reason" required rows={3} className={inputClass} />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {t("T-253")}
                </AdminSubmitButton>
                <Link href={back} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {accion === "anular" && participationId ? (
        <ResourcePanel title={tList("T-2530")[0] ?? ""} closeHref={back} closeLabel={t("T-291")}>
          <form action={annulAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="participationId" value={participationId} />
              <input type="hidden" name="back" value={back} />
              <p className="text-sm">{tList("T-2530")[1]}</p>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{t("T-2526")}</span>
                <textarea name="reason" required rows={3} className={inputClass} />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {tList("T-2530")[0]}
                </AdminSubmitButton>
                <Link href={back} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}
    </div>
  );
}
