import type { BaseState, RecordingTracker, TrackerBase } from "@/modules/competition";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { t, tList } from "@/shared/copy";
import { formatTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Section } from "./shared";

// El seguimiento del registro (ADR-105): qué bases ya registraron la rotación en curso, qué resultados
// se deben y quién se demora más en cada jornada. Solo lee; el líder y el calificador van solo por
// nombre (ADR-014).

function crewLine(base: TrackerBase): string {
  const [lider, calificador] = tList("T-3155");
  const names = (list: string[]) => (list.length > 0 ? list.join(", ") : t("T-3159"));
  return `${lider}: ${names(base.judges)} · ${calificador}: ${names(base.graders)}`;
}

function stateLabel(state: BaseState): string {
  if (state.kind === "NOT_STARTED") return t("T-3183");
  if (state.kind === "PLAYING") return t("T-3184", { hora: formatTime(state.startedAt) });
  const [byJudge, byOperation] = tList("T-3187");
  return [
    state.at ? t("T-3185", { hora: formatTime(state.at) }) : null,
    state.minutes !== null ? t("T-3186", { minutos: state.minutes }) : null,
    state.by === "JUDGE" ? byJudge : byOperation,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function Seguimiento({ tracker }: { tracker: RecordingTracker }) {
  const columns = tList("T-3192");
  const minutes = (value: number | null) =>
    value === null ? "—" : value.toLocaleString("es-CO", { maximumFractionDigits: 1 });
  const caption = `${t("T-3190")} · ${t("T-2825", { dia: tracker.day })}`;
  return (
    <Section title={tList("T-2805")[11] ?? ""}>
      <p className="text-tinta-suave">{t("T-3181")}</p>

      {tracker.current ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-titulo-md">
            {t("T-2837", { n: tracker.current.rotation.number, dia: tracker.current.rotation.day })}
          </h3>
          <p className="font-semibold">
            {t("T-3182", {
              registradas: tracker.current.recorded,
              total: tracker.current.total,
            })}
          </p>
          <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
            {tracker.current.rows.map((row) => {
              const missing = row.state.kind !== "RECORDED";
              return (
                <li key={row.matchupId} className="flex flex-col gap-1 py-2">
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="font-semibold">{row.base.name}</span>
                    <span className={missing ? "font-semibold text-oe-orange" : "text-tinta-suave"}>
                      {stateLabel(row.state)}
                    </span>
                  </span>
                  <span className="text-sm">{crewLine(row.base)}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-tinta-suave">{t("T-2850")}</p>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-titulo-md">{t("T-3188")}</h3>
        {tracker.debts.length === 0 ? (
          <p className="text-tinta-suave">{t("T-3189")}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
            {tracker.debts.map((debt) => (
              <li key={debt.matchupId} className="flex flex-col gap-1 py-2">
                <span className="font-semibold">
                  {t("T-2837", { n: debt.rotation.number, dia: debt.rotation.day })} ·{" "}
                  {debt.base.name}
                </span>
                <span className="text-sm text-tinta-suave">
                  {t("T-2883", {
                    a: `${debt.teamA.number} ${debt.teamA.name}`,
                    b: `${debt.teamB.number} ${debt.teamB.name}`,
                  })}
                </span>
                <span className="text-sm">{crewLine(debt.base)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-titulo-md">{t("T-3190")}</h3>
        <nav className="flex flex-wrap gap-2" aria-label={t("T-3190")}>
          {([1, 2] as const).map((day) => (
            <Link
              key={day}
              href={`?area=seguimiento&jornada=${day}`}
              aria-current={day === tracker.day ? "page" : undefined}
              className={
                day === tracker.day ? "boton-primario min-h-11" : "boton-secundario min-h-11"
              }
            >
              {t("T-2825", { dia: day })}
            </Link>
          ))}
        </nav>
        <p className="text-sm text-tinta-suave">{t("T-3191")}</p>
        {tracker.playedRotations === 0 ? (
          <p className="text-tinta-suave">{t("T-3193", { dia: tracker.day })}</p>
        ) : (
          <AdminTableRegion label={caption}>
            <table className="w-full min-w-[48rem] border-collapse text-sm">
              <caption className="sr-only">{caption}</caption>
              <thead>
                <tr className="border-b border-borde text-left">
                  {columns.map((column) => (
                    <th key={column} scope="col" className="px-2 py-1 font-semibold">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tracker.ranking.map((row) => (
                  <tr key={row.baseId} className="border-b border-borde align-top">
                    <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-semibold">
                      {row.base.name}
                    </th>
                    <td className="whitespace-nowrap px-2 py-1">
                      {row.base.judges.join(", ") || t("T-3159")}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1">
                      {row.base.graders.join(", ") || t("T-3159")}
                    </td>
                    <td className="px-2 py-1 tabular-nums">{row.byJudge}</td>
                    <td className="px-2 py-1 tabular-nums">{row.byOperation}</td>
                    <td
                      className={`px-2 py-1 tabular-nums ${row.owed > 0 ? "font-semibold text-oe-orange" : ""}`}
                    >
                      {row.owed}
                    </td>
                    <td className="px-2 py-1 tabular-nums">{minutes(row.medianMinutes)}</td>
                    <td className="px-2 py-1 tabular-nums">{row.lastCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableRegion>
        )}
      </div>
    </Section>
  );
}
