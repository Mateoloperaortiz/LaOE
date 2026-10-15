import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { single } from "@/app/_lib/search";
import { hasRecentStepUp, requireAdminActor } from "@/modules/identity";
import { closingSummary, getTermStanding } from "@/modules/participation";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { Numeral } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { closeTermAction } from "./actions";

// Cierre del término para GH (ADR-004, ADR-035 regla 13): resumen, bloqueo por ocasiones abiertas,
// cierre con step-up y el standing congelado.

export const metadata: Metadata = { title: tList("T-561")[4] ?? "" };

type Search = Record<string, string | string[] | undefined>;

export default async function CierrePage({ searchParams }: PageProps<"/admin/cierre">) {
  const actor = await requireAdminActor("/admin/cierre");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const accion = single(search.accion);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const [resumenAbiertas, resumenPendientes, resumenMiembros, resumenPuntos] = tList("T-645");
  const [topNuevos, topVeteranos, topComites] = tList("T-649");
  const [resumenRetos, resumenPremios] = tList("T-2563");
  const [statsRetos, statsBoosters] = tList("T-2594");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-644", { término: "" })}</h1>
        <p className="text-tinta-suave">{t("T-650")}</p>
      </div>
    );
  }
  const base = `/admin/cierre?termId=${term.id}`;
  if (accion === "cerrar" && !term.pointsClosedAt && !hasRecentStepUp(actor)) {
    redirect(`/ingresar/paso?next=${encodeURIComponent(`${base}&accion=cerrar`)}`);
  }
  const [summary, standing] = await Promise.all([
    closingSummary(term.id),
    getTermStanding(term.id),
  ]);
  const cards: Array<[string, number]> = [
    [resumenAbiertas ?? "", summary.openOccasions],
    [resumenPendientes ?? "", summary.pendingCheckIns],
    [resumenMiembros ?? "", summary.membersWithPoints],
    [resumenPuntos ?? "", summary.pointsAwarded],
    // Gamificación (ADR-067 regla 13): lo que bloquea el cierre y las cifras del standing.
    [resumenRetos ?? "", summary.pendingParticipations],
    [resumenPremios ?? "", summary.reservedRewards],
  ];
  if (standing?.stats.challengesCompleted !== undefined) {
    cards.push([statsRetos ?? "", standing.stats.challengesCompleted]);
  }
  if (standing?.stats.boostPoints !== undefined) {
    cards.push([statsBoosters ?? "", standing.stats.boostPoints]);
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-644", { término: term.code })}</h1>
          {guardado ? (
            <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
          ) : null}
          {error ? (
            <p role="alert" className="font-semibold text-oe-orange">
              {error}
            </p>
          ) : null}
        </div>
        <form action="/admin/cierre" method="get" className="flex items-center gap-2 text-sm">
          <label htmlFor="termId" className="eyebrow text-xs">
            {tList("T-570")[0]}
          </label>
          <select
            id="termId"
            name="termId"
            defaultValue={term.id}
            className="rounded-xl border-2 border-borde bg-fondo px-3 py-1"
          >
            {terms.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code}
              </option>
            ))}
          </select>
          <AdminSubmitButton type="submit" className="boton-secundario min-h-8 px-3 py-1 text-sm">
            {t("T-250")}
          </AdminSubmitButton>
        </form>
      </header>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
          >
            <dt className="eyebrow text-xs">{label}</dt>
            <dd className="font-display text-display-lg leading-none">{value}</dd>
          </div>
        ))}
      </dl>

      {term.pointsClosedAt ? (
        <div className="flex flex-col gap-2 rounded-xl bg-oe-yellow-soft px-4 py-3 text-oe-navy">
          <p className="font-semibold">
            {t("T-648", { fecha: formatDateTime(term.pointsClosedAt) })}
          </p>
          <Link href={`/admin/permanencia/cierre?termId=${term.id}`} className="underline">
            {t("T-815")}
          </Link>
        </div>
      ) : summary.openOccasions > 0 ? (
        <p className="rounded-xl border border-borde bg-fondo px-4 py-3">
          {t("T-646", { n: summary.openOccasions })}{" "}
          <Link href={`/admin/ocasiones?termId=${term.id}&status=OPEN`} className="underline">
            {tList("T-561")[0]}
          </Link>
        </p>
      ) : summary.pendingParticipations > 0 || summary.reservedRewards > 0 ? (
        <p className="rounded-xl border border-borde bg-fondo px-4 py-3">
          {t("T-2562", {
            n: summary.pendingParticipations,
            m: summary.reservedRewards,
          })}{" "}
          <Link href="/admin/gamificacion/revision" className="underline">
            {tList("T-2404")[2]}
          </Link>
        </p>
      ) : (
        <Link href={`${base}&accion=cerrar`} className="boton-calido self-start">
          {t("T-647")}
        </Link>
      )}

      {standing ? (
        <div className="grid gap-8 lg:grid-cols-2">
          {(
            [
              [
                topNuevos ?? "",
                standing.topNew.map((item) => ({
                  rank: item.rank,
                  name: item.name,
                  value: String(item.total),
                })),
              ],
              [
                topVeteranos ?? "",
                standing.topVeteran.map((item) => ({
                  rank: item.rank,
                  name: item.name,
                  value: String(item.total),
                })),
              ],
              [
                topComites ?? "",
                standing.topCommittees.map((item) => ({
                  rank: item.rank,
                  name: item.name,
                  value: `${Math.round(item.score * 100)} %`,
                })),
              ],
              [
                t("T-3425"),
                standing.topGamer.map((item) => ({
                  rank: item.rank,
                  name: item.name,
                  value:
                    standing.stats.gamerRankingMetric === "POINTS" && item.points !== null
                      ? t("T-3482", {
                          premio: t(item.points === 1 ? "T-3478" : "T-3479", { n: item.points }),
                          participaciones: item.participations,
                          dias: item.activeDays,
                        })
                      : t("T-3455", {
                          participaciones: item.participations,
                          dias: item.activeDays,
                        }),
                })),
                t(standing.stats.gamerRankingMetric === null ? "T-3483" : "T-542"),
              ],
            ] as Array<[string, Array<{ rank: number; name: string; value: string }>, string?]>
          ).map(([title, rows, empty]) => (
            <section key={title} aria-label={title} className="flex flex-col gap-3">
              <h2 className="text-display-md">{title}</h2>
              {rows.length === 0 ? (
                <p className="text-tinta-suave">{empty ?? t("T-542")}</p>
              ) : (
                <ol className="flex list-none flex-col gap-2 p-0">
                  {rows.map((row) => (
                    <li
                      key={`${row.rank}-${row.name}`}
                      className="flex items-center gap-3 rounded-xl border border-borde bg-fondo px-3 py-2"
                    >
                      <Numeral valor={row.rank} className="w-10 text-display-md text-titulo" />
                      <span className="flex-1 font-semibold">{row.name}</span>
                      <span className="tabular-nums">{row.value}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          ))}
        </div>
      ) : null}

      {accion === "cerrar" &&
      !term.pointsClosedAt &&
      summary.openOccasions === 0 &&
      summary.pendingParticipations === 0 &&
      summary.reservedRewards === 0 ? (
        <ResourcePanel title={t("T-647")} closeHref={base} closeLabel={t("T-291")}>
          <form action={closeTermAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="termId" value={term.id} />
              <p>{t("T-163", { término: term.code })}</p>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-calido">
                  {t("T-647")}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
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
