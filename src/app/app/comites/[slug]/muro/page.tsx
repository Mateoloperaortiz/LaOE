import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { single } from "@/app/_lib/search";
import { listCommitteeRecognitions } from "@/modules/crm";
import { requireActor } from "@/modules/identity";
import {
  APPLAUSE_MAX,
  COLLECTIVE_GOAL_METRICS,
  dayKeyFor,
  listActiveGoals,
  listCommitteeApplause,
} from "@/modules/participation";
import { listCommitteeMates, listInternalRoster } from "@/modules/people";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { MomentoExito } from "@/shared/brand";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { ActionForm } from "@/shared/ui/ActionForm";
import { applaudAction, deleteApplauseAction } from "./actions";

// El muro del comité (ADR-176 regla 2): lo ven sus miembros del semestre. Trae los aplausos entre
// personas con la actividad prendida (ADR-175), los reconocimientos formales del comité y sus metas.

export const metadata: Metadata = { title: tList("T-4972")[3] ?? "" };

export default async function MuroPage({
  params,
  searchParams,
}: PageProps<"/app/comites/[slug]/muro">) {
  const { slug } = await params;
  const search = await searchParams;
  const actor = await requireActor(`/app/comites/${slug}/muro`);
  const roster = await listInternalRoster(slug);
  if (!roster?.term) notFound();
  const { committee, term, members } = roster;
  if (!members.some((member) => member.personId === actor.personId)) notFound();
  const [applause, recognitions, goals, mates] = await Promise.all([
    listCommitteeApplause(committee.id, term.id),
    // Solo los reconocimientos ya publicados en la cartelera: esos ya son públicos.
    listCommitteeRecognitions(committee.id, term.id).then((rows) =>
      rows.filter((row) => row.announcementId !== null),
    ),
    listActiveGoals([committee.id], dayKeyFor(new Date())),
    listCommitteeMates(committee.id, term.id),
  ]);
  const committeeGoals = goals.filter((goal) => goal.committeeId === committee.id);
  const [
    aplaudir,
    aQuien,
    mensaje,
    aplausosTitulo,
    reconocimientosTitulo,
    metasTitulo,
    sinAplausos,
    borrar,
  ] = tList("T-4972");
  const metricLabels = tLabels("T-4977", COLLECTIVE_GOAL_METRICS);
  const [, cumplida] = tList("T-4975");
  const error = single(search.error);
  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <h1 className="titulo-pantalla">{t("T-4967", { comité: committee.name })}</h1>

      <section
        aria-labelledby="muro-aplaudir"
        className="flex flex-col gap-3 rounded-tarjeta bg-superficie p-4"
      >
        <h2 id="muro-aplaudir" className="titulo-seccion">
          {aplaudir}
        </h2>
        {single(search.aplauso) === "1" ? (
          <output className="block font-semibold text-titulo">{t("T-259")}</output>
        ) : null}
        {error ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
        <ActionForm action={applaudAction} className="flex flex-col gap-3">
          <input type="hidden" name="slug" value={slug} />
          <input type="hidden" name="committeeId" value={committee.id} />
          <div className="flex flex-col gap-1">
            <label htmlFor="aplauso-a-quien" className="text-sm font-semibold">
              {aQuien}
            </label>
            <select
              id="aplauso-a-quien"
              name="toPersonId"
              required
              className="rounded-xl border border-borde bg-fondo px-3 py-2"
            >
              {mates
                .filter((mate) => mate.id !== actor.personId)
                .map((mate) => (
                  <option key={mate.id} value={mate.id}>
                    {mate.name}
                  </option>
                ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="aplauso-mensaje" className="text-sm font-semibold">
              {mensaje}
            </label>
            <textarea
              id="aplauso-mensaje"
              name="message"
              required
              minLength={2}
              maxLength={APPLAUSE_MAX}
              rows={2}
              className="rounded-xl border border-borde bg-fondo px-3 py-2"
            />
          </div>
          <AdminSubmitButton type="submit" className="boton-primario self-start">
            {aplaudir}
          </AdminSubmitButton>
        </ActionForm>
      </section>

      {committeeGoals.length > 0 ? (
        <section aria-labelledby="muro-metas" className="flex flex-col gap-3">
          <h2 id="muro-metas" className="titulo-seccion">
            {metasTitulo}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {committeeGoals.map((goal) => (
              <li key={goal.id} className="flex flex-col gap-2 rounded-tarjeta bg-superficie p-4">
                <span className="font-semibold">{goal.title}</span>
                <progress
                  max={goal.target}
                  value={Math.min(goal.progress, goal.target)}
                  aria-label={goal.title}
                />
                <span className="text-secundario text-tinta-secundaria">
                  {t("T-4976", { n: goal.progress, meta: goal.target })} ·{" "}
                  {metricLabels[goal.metric]}
                </span>
                {goal.done ? (
                  <>
                    <span className="font-semibold">{cumplida}</span>
                    <MomentoExito clave={`meta:${goal.id}`} tamano="md" />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="muro-aplausos" className="flex flex-col gap-3">
        <h2 id="muro-aplausos" className="titulo-seccion">
          {aplausosTitulo}
        </h2>
        {applause.length === 0 ? (
          <p className="text-tinta-secundaria">{sinAplausos}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {applause.map((item) => (
              <li key={item.id} className="flex flex-col gap-1 rounded-tarjeta bg-superficie p-4">
                <span className="font-semibold">
                  {t("T-4973", { de: item.fromName, a: item.toName })}
                </span>
                <span>{item.message}</span>
                <span className="text-secundario text-tinta-secundaria">
                  {formatDateTime(item.createdAt)}
                </span>
                {item.fromPersonId === actor.personId ? (
                  <ActionForm action={deleteApplauseAction}>
                    <input type="hidden" name="slug" value={slug} />
                    <input type="hidden" name="id" value={item.id} />
                    <AdminSubmitButton
                      type="submit"
                      className="boton-secundario min-h-9 px-3 py-1 text-sm"
                    >
                      {borrar}
                    </AdminSubmitButton>
                  </ActionForm>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {recognitions.length > 0 ? (
        <section aria-labelledby="muro-reconocimientos" className="flex flex-col gap-3">
          <h2 id="muro-reconocimientos" className="titulo-seccion">
            {reconocimientosTitulo}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {recognitions.map((item) => (
              <li key={item.id} className="font-semibold">
                {item.award ? `${item.title} · ${item.award}` : item.title}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
