import { Fragment } from "react";
import { requireCompetitionStaff } from "@/app/_authz/competition";
import { single } from "@/app/_lib/search";
import { judgeView } from "@/modules/competition";
import { Actualizador } from "@/modules/competition/components/Actualizador";
import { Cronometro } from "@/modules/competition/components/Cronometro";
import { t, tList } from "@/shared/copy";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { JudgeMatchup } from "../_ui/Judge";

// Pantalla del juez (ADR-089 regla 10): primero celular. Su base, el enfrentamiento de la rotación en
// curso y tres botones grandes. Antes de empezar, registra las tarjetas de poder que le entregan y
// empieza la base (ADR-098). Arriba ve quién lo acompaña en la base (ADR-101). Si le falta registrar, el
// aviso dice cuántas bases ya lo hicieron, y una rotación cerrada sin su resultado le pide pasárselo a
// la operación (ADR-105). Se actualiza sola cada pocos segundos con la pestaña visible.

export async function generateMetadata() {
  return { title: t("T-2882") };
}

export default async function JudgePage({
  params,
  searchParams,
}: PageProps<"/admin/the-games/[id]/juez">) {
  const { id } = await params;
  const search = await searchParams;
  const base = `/admin/the-games/${id}/juez`;
  const { actor, competition, roles } = await requireCompetitionStaff(id, base);
  const view = await judgeView(id, actor.personId);
  const serverNow = new Date().toISOString();
  const [quedan, cumplido] = tList("T-2881");
  const kinds = tList("T-2824");
  const crewLabels = tList("T-3155");
  const saved = single(search.guardado);
  const notice = single(search.aviso);
  const error = single(search.error);
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6">
      <Actualizador intervalMs={10_000} />
      <header className="flex flex-col gap-2">
        {roles.operator ? (
          <Link href={`/admin/the-games/${id}?area=resultados`} className="text-sm underline">
            {t("T-2845")}
          </Link>
        ) : null}
        <h1 className="text-display-lg">{t("T-2875")}</h1>
        <p className="text-tinta-suave">
          {competition.name}
          {view.bases.length > 0 ? ` · ${view.bases.map((item) => item.name).join(" · ")}` : ""}
        </p>
        <p className="text-sm text-tinta-suave">{t("T-2880")}</p>
      </header>
      {view.bases.map((base) => {
        const crew = view.crew.get(base.id);
        if (!crew) return null;
        const parts = (
          [
            [crewLabels[1], crew.GRADER],
            [crewLabels[2], crew.OVERSEER],
            [crewLabels[3], crew.VAR],
          ] as const
        ).flatMap(([label, names]) => (names.length > 0 ? [`${label}: ${names.join(", ")}`] : []));
        return (
          <section
            key={base.id}
            className="flex flex-col gap-1 rounded-xl border border-borde px-4 py-3"
          >
            <h2 className="font-semibold">{t("T-3161", { base: base.name })}</h2>
            <p className="text-sm">{parts.join(" · ")}</p>
          </section>
        );
      })}
      {saved ? (
        <output className="block rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {t("T-2879", { resultado: saved })}
        </output>
      ) : null}
      {notice ? (
        <output className="block rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {notice}
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {error}
        </p>
      ) : null}
      {view.debts.map((debt) => (
        <p
          key={debt.matchupId}
          className="rounded-xl border-2 border-oe-orange px-4 py-3 font-semibold"
        >
          {t("T-3195", { n: debt.number, base: debt.baseName })}
        </p>
      ))}
      {view.bases.length === 0 ? (
        <p className="rounded-xl border border-borde bg-fondo px-4 py-3">{t("T-2876")}</p>
      ) : view.current && view.currentMatchups.length > 0 ? (
        <>
          <section className="flex items-baseline justify-between gap-3">
            <h2 className="font-semibold">
              {t("T-2837", { n: view.current.number, dia: view.current.day })}
            </h2>
            {view.current.endsAt ? (
              <Cronometro
                endsAt={view.current.endsAt.toISOString()}
                serverNow={serverNow}
                labels={{ left: quedan ?? "", done: cumplido ?? "" }}
                className="text-display-md"
              />
            ) : null}
          </section>
          {view.currentMatchups.map((matchup) => {
            const nudge = view.nudges.find((item) => item.matchupId === matchup.id);
            return (
              <Fragment key={matchup.id}>
                {nudge ? (
                  <p className="rounded-xl border-2 border-oe-orange px-4 py-3 font-semibold">
                    {t("T-3194", {
                      registradas: nudge.recorded,
                      total: nudge.total,
                      base: matchup.base.name,
                    })}
                  </p>
                ) : null}
                <JudgeMatchup
                  competitionId={id}
                  matchup={matchup}
                  powers={view.powers.get(matchup.id)}
                  serverNow={serverNow}
                  macroLabel={kinds[1] ?? ""}
                />
              </Fragment>
            );
          })}
        </>
      ) : (
        <p className="rounded-xl border border-borde bg-fondo px-4 py-3">{t("T-2877")}</p>
      )}
      {view.nextMatchups.map((matchup) => (
        <p key={matchup.id} className="text-tinta-suave">
          {t("T-2878", { a: matchup.teamA.name, b: matchup.teamB.name })}
        </p>
      ))}
    </div>
  );
}
