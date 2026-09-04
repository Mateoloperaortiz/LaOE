import type { Metadata } from "next";
import Link from "next/link";
import { requireActor } from "@/modules/identity";
import {
  ASSEMBLY_KINDS,
  assemblyStatusFor,
  balanceFor,
  levelFor,
  listEntriesFor,
  myPosition,
  POINT_ENTRY_KINDS,
  rankCommittees,
  rankPeople,
} from "@/modules/participation";
import { getMembershipRef, listCommitteesByIds } from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { Cartel, Numeral, SelloOE } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { Vacio } from "../_ui/Vacio";

// GH Points en Mi OE (06-mapa-del-sitio.md, ADR-035 reglas 9 y 10): saldo, nivel, movimientos y los
// tableros del semestre (top 10 con nombres más el puesto propio). Las asambleas llegan en F3-T6.

export const metadata: Metadata = { title: t("T-080") };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const BOARDS = ["nuevos", "veteranos", "comites"] as const;
type BoardKey = (typeof BOARDS)[number];

export default async function GhPointsPage({ searchParams }: PageProps<"/app/gh-points">) {
  const actor = await requireActor("/app/gh-points");
  const search = (await searchParams) as Search;
  const tableroParam = single(search.tablero);
  const tablero: BoardKey = BOARDS.includes(tableroParam as BoardKey)
    ? (tableroParam as BoardKey)
    : "nuevos";
  const [terms, current, membership, cutoffs] = await Promise.all([
    listAllTerms(),
    getCurrentTerm(),
    getMembershipRef(actor.personId),
    requireConfig("points.levels"),
  ]);
  const termParam = single(search.semestre);
  const term = terms.find((item) => item.id === termParam) ?? current;
  const [tabNuevos, tabVeteranos, tabComites] = tList("T-083");
  const levelLabels = tList("T-082");
  const kindLabels = tList("T-085");
  const [colFecha, colMovimiento, colPuntos] = tList("T-552");

  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-080")}</h1>
        <Vacio texto={t("T-548")} />
      </div>
    );
  }

  const [total, entries, position, assemblies] = await Promise.all([
    balanceFor(actor.personId, term.id),
    listEntriesFor(actor.personId, term.id),
    membership
      ? myPosition(actor.personId, term.id, membership.firstTermId)
      : Promise.resolve(null),
    assemblyStatusFor(actor.personId, term),
  ]);
  const assemblyKindLabels = tList("T-546");
  const [firmada, pendienteAsamblea, noFuiste] = tList("T-547");
  const requiredTotalCount =
    assemblies.requirement.requiredOrdinary +
    (assemblies.requirement.requiresBoardElection ? 1 : 0) +
    (assemblies.requirement.requiresRunoff ? 1 : 0);
  const attendedRequired =
    Math.min(assemblies.compliance.ordinaryAttended, assemblies.requirement.requiredOrdinary) +
    (assemblies.requirement.requiresBoardElection && assemblies.compliance.boardElectionAttended
      ? 1
      : 0) +
    (assemblies.requirement.requiresRunoff && assemblies.compliance.runoffAttended ? 1 : 0);
  const level = levelFor(total, cutoffs);
  const nextLabel = level.next === null ? null : (levelLabels[level.index + 1] ?? "");
  let board: Array<{ rank: number; name: string; total: string; mine: boolean }> = [];
  if (tablero === "comites") {
    const ranked = await rankCommittees(term.id);
    const committees = await listCommitteesByIds(ranked.map((item) => item.row.committeeId));
    const names = new Map(committees.map((item) => [item.id, item.name]));
    board = ranked.slice(0, 10).map((item) => ({
      rank: item.rank,
      name: names.get(item.row.committeeId) ?? "",
      total: `${Math.round(item.row.score * 100)} % · ${Math.round(item.row.rawScore * 100)} %`,
      mine: false,
    }));
  } else {
    const ranked = await rankPeople(term.id, tablero === "nuevos" ? "NEW" : "VETERAN");
    board = ranked
      .filter((item) => item.total > 0)
      .slice(0, 10)
      .map((item) => ({
        rank: item.rank,
        name: item.row.anonymized ? t("T-223") : item.row.name,
        total: String(item.total),
        mine: item.row.personId === actor.personId,
      }));
  }
  const tabs: Array<[BoardKey, string]> = [
    ["nuevos", tabNuevos ?? ""],
    ["veteranos", tabVeteranos ?? ""],
    ["comites", tabComites ?? ""],
  ];
  const base = `/app/gh-points?semestre=${term.id}`;

  return (
    <div className="flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg">{t("T-080")}</h1>
        {terms.length > 1 ? (
          <form action="/app/gh-points" method="get" className="flex items-center gap-2 text-sm">
            <label htmlFor="semestre" className="eyebrow text-xs">
              {t("T-550")}
            </label>
            <select
              id="semestre"
              name="semestre"
              defaultValue={term.id}
              className="rounded-xl border-2 border-borde bg-fondo px-3 py-1"
            >
              {terms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code}
                </option>
              ))}
            </select>
            <button type="submit" className="boton-secundario min-h-8 px-3 py-1 text-sm">
              {t("T-250")}
            </button>
          </form>
        ) : null}
      </header>

      <Cartel
        variante="amarillo"
        nivel="h2"
        tamano="hero"
        eyebrow={term.code}
        titulo={t("T-081", { n: total })}
        subtitulo={
          term.pointsClosedAt
            ? t("T-549", { fecha: formatDate(term.pointsClosedAt) })
            : `${t("T-535", { nivel: levelLabels[level.index] ?? "" })}${
                nextLabel !== null && level.remaining !== null
                  ? ` · ${t("T-536", { n: level.remaining, nivel: nextLabel })}`
                  : ""
              }`
        }
        elemento={null}
      >
        {nextLabel === null ? (
          <div className="mt-6 flex flex-col items-start gap-2">
            <p className="font-semibold">{t("T-537").replace(/\s*¡OE OE OE!$/, "")}</p>
            <SelloOE tamano="md" />
          </div>
        ) : null}
        <p className="mt-6 text-sm" data-puesto={position?.rank ?? ""}>
          {position && position.rank !== null
            ? `${t("T-559")}: ${t("T-540", { puesto: position.rank, total: position.of })}`
            : t("T-541")}
        </p>
      </Cartel>

      <section aria-labelledby="movimientos" className="flex flex-col gap-4">
        <h2 id="movimientos" className="text-display-md">
          {t("T-538")}
        </h2>
        {entries.length === 0 ? (
          <Vacio texto={t("T-086")} elemento="estrella" color="text-oe-yellow" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="eyebrow py-2 pr-4 text-xs">{colFecha}</th>
                  <th className="eyebrow py-2 pr-4 text-xs">{colMovimiento}</th>
                  <th className="eyebrow py-2 text-right text-xs">{colPuntos}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-borde border-t">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="py-2 pr-4">
                      <span className="font-semibold">
                        {kindLabels[POINT_ENTRY_KINDS.indexOf(entry.kind)] ?? entry.kind}
                      </span>
                      <span className="text-tinta-suave"> · {entry.reason}</span>
                    </td>
                    <td
                      className={`py-2 text-right font-semibold tabular-nums ${entry.points < 0 ? "text-oe-orange" : ""}`}
                    >
                      {entry.points > 0 ? `+${entry.points}` : entry.points}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="asambleas" className="flex flex-col gap-4">
        <h2 id="asambleas" className="text-display-md">
          {t("T-544")}
        </h2>
        <p className="font-semibold">
          {t("T-545", { n: attendedRequired, total: requiredTotalCount })}
        </p>
        {assemblies.assemblies.length === 0 ? (
          <p className="text-tinta-suave">{t("T-643")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {assemblies.assemblies.map((item) => {
              const past = item.occasion.checkInClosesAt < new Date();
              const label =
                item.status === "APPROVED" ? firmada : past ? noFuiste : pendienteAsamblea;
              return (
                <li
                  key={item.occasion.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-3"
                >
                  <span className="flex flex-col">
                    <span className="font-semibold">{item.occasion.title}</span>
                    <span className="text-sm text-tinta-suave">
                      {assemblyKindLabels[
                        ASSEMBLY_KINDS.indexOf(item.occasion.assemblyKind ?? "ORDINARY")
                      ] ?? ""}
                      {" · "}
                      {formatDateTime(item.occasion.startsAt)}
                    </span>
                  </span>
                  <span
                    className={`text-sm font-semibold ${item.status === "APPROVED" ? "" : past ? "text-oe-orange" : "text-tinta-suave"}`}
                  >
                    {label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="rankings" className="flex flex-col gap-4">
        <h2 id="rankings" className="text-display-md">
          {t("T-539")}
        </h2>
        <nav aria-label={t("T-539")} className="flex flex-wrap gap-2">
          {tabs.map(([key, label]) => (
            <Link
              key={key}
              href={`${base}&tablero=${key}`}
              aria-current={key === tablero ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                key === tablero ? "bg-oe-navy text-oe-paper" : "border border-borde text-titulo"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="max-w-prose text-sm text-tinta-suave">
          {tablero === "comites" ? t("T-084") : t("T-551")}
        </p>
        {board.length === 0 ? (
          <Vacio texto={t("T-542")} elemento="bucle" color="text-oe-blue" />
        ) : (
          <ol className="flex list-none flex-col gap-2 p-0">
            {board.map((item) => (
              <li
                key={`${item.rank}-${item.name}`}
                aria-current={item.mine ? "true" : undefined}
                className={`flex items-center gap-4 rounded-[var(--radius-cartel)] border border-borde p-3 ${item.mine ? "bg-oe-yellow-soft" : "bg-fondo"}`}
              >
                <Numeral valor={item.rank} className="w-14 text-display-md text-titulo" />
                <span className="flex-1 text-lg font-semibold">{item.name}</span>
                <span className="font-semibold tabular-nums">{item.total}</span>
              </li>
            ))}
          </ol>
        )}
        {tablero === "comites" ? (
          <p className="text-xs text-tinta-suave">{tList("T-543").slice(1).join(" · ")}</p>
        ) : null}
      </section>
    </div>
  );
}
