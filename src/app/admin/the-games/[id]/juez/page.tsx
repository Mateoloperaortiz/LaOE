import Link from "next/link";
import { requireCompetitionStaff } from "@/app/_authz/competition";
import { single } from "@/app/_lib/search";
import { judgeView, type MatchupView } from "@/modules/competition";
import { Actualizador } from "@/modules/competition/components/Actualizador";
import { Cronometro } from "@/modules/competition/components/Cronometro";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { judgeResultAction } from "../actions";

// Pantalla del juez (ADR-089 regla 10): primero celular. Su base, el enfrentamiento de la rotación en
// curso y tres botones grandes. Se actualiza sola cada pocos segundos con la pestaña visible.

export async function generateMetadata() {
  return { title: t("T-2882") };
}

function Team({ team }: { team: MatchupView["teamA"] }) {
  return (
    <span className="flex items-center gap-3">
      <span
        aria-hidden="true"
        className="inline-block size-5 shrink-0 rounded-full border border-borde"
        style={team.color ? { backgroundColor: team.color } : undefined}
      />
      <span className="tabular-nums text-tinta-suave">{team.number}</span>
      <span className="text-xl font-semibold">{team.name}</span>
    </span>
  );
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
  const saved = single(search.guardado);
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
      {saved ? (
        <output className="block rounded-xl bg-oe-yellow-soft px-4 py-3 font-semibold text-oe-navy">
          {t("T-2879", { resultado: saved })}
        </output>
      ) : null}
      {error ? (
        <p role="alert" className="font-semibold text-oe-orange">
          {error}
        </p>
      ) : null}
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
            const options = [
              { outcome: "A_WIN", label: t("T-2846", { equipo: matchup.teamA.name }) },
              { outcome: "DRAW", label: t("T-2847") },
              { outcome: "B_WIN", label: t("T-2846", { equipo: matchup.teamB.name }) },
            ];
            return (
              <section
                key={matchup.id}
                className="flex flex-col gap-4 rounded-xl border-2 border-borde bg-fondo p-4"
              >
                <p className="text-sm text-tinta-suave">
                  {matchup.base.name}
                  {matchup.base.kind === "MACRO" ? ` · ${kinds[1]}` : ""}
                </p>
                <Team team={matchup.teamA} />
                <Team team={matchup.teamB} />
                <div className="flex flex-col gap-3">
                  {options.map((option) => (
                    <form key={option.outcome} action={judgeResultAction}>
                      <input type="hidden" name="competitionId" value={id} />
                      <input type="hidden" name="matchupId" value={matchup.id} />
                      <input type="hidden" name="outcome" value={option.outcome} />
                      <input type="hidden" name="label" value={option.label} />
                      <AdminSubmitButton
                        className={`${matchup.outcome === option.outcome ? "boton-primario" : "boton-secundario"} min-h-14 w-full text-lg`}
                      >
                        {option.label}
                      </AdminSubmitButton>
                    </form>
                  ))}
                </div>
              </section>
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
