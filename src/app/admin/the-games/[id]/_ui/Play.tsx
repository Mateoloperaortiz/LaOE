import Link from "next/link";
import type {
  BaseRow,
  ExtraView,
  MatchupView,
  RotationSummary,
  RotationView,
  ScheduleReport,
  Standings,
  TeamRow,
} from "@/modules/competition";
import { RUBRIC_MAX_SCORE, RUBRIC_MIN_SCORE, SCHEDULE_ISSUE_KINDS } from "@/modules/competition";
import { Cronometro } from "@/modules/competition/components/Cronometro";
import { ImportarJornada } from "@/modules/competition/components/ImportarJornada";
import { Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { importDayAction } from "../actions";
import { OperationForm, type PanelContext, Section, Submit, TeamChip } from "./shared";

// El juego en vivo (ADR-089 reglas 6 a 9): calendario y rotaciones, la mesa de control de resultados,
// las posiciones y las competencias extra con los ajustes. Los puntos los calcula el servidor.

function importLabels(day: 1 | 2) {
  const [sheet, minutes] = tList("T-2904");
  return {
    title: t("T-2902", { dia: day }),
    help: t("T-2903"),
    sheet: sheet ?? "",
    minutes: minutes ?? "",
    submit: t("T-2905", { dia: day }),
    pending: t("T-2906"),
    confirm: t("T-2907"),
    blocked: t("T-2924"),
    warned: t("T-2925"),
    more: t("T-2922"),
  };
}

function rotationStatus(status: RotationSummary["status"]): string {
  return tList("T-2834")[["PENDING", "ACTIVE", "CLOSED"].indexOf(status)] ?? status;
}

export function Rotaciones({
  context,
  rotations,
  selected,
  report,
  bases,
  teams,
  serverNow,
}: {
  context: PanelContext;
  rotations: RotationSummary[];
  selected: RotationView | null;
  report: ScheduleReport;
  bases: BaseRow[];
  teams: TeamRow[];
  serverNow: string;
}) {
  const [iniciar, cerrar, reabrir, avanzar] = tList("T-2835");
  const clock = tList("T-2836");
  const [rotacionesLabel, minutos] = tList("T-2832");
  const [errores, advertencias] = tList("T-2840");
  const issueLabels = tList("T-2841");
  const [quedan, cumplido] = tList("T-2881");
  const active = rotations.find((rotation) => rotation.status === "ACTIVE");
  const teamName = (id: string) => {
    const team = teams.find((item) => item.id === id);
    return team ? `${team.number} ${team.name}` : id;
  };
  const baseName = (id: string) => bases.find((item) => item.id === id)?.name ?? id;
  const describe = (issue: ScheduleReport["errors"][number]) => {
    const label = issueLabels[SCHEDULE_ISSUE_KINDS.indexOf(issue.kind)] ?? issue.kind;
    if ("teamAId" in issue)
      return `${label}: ${teamName(issue.teamAId)} · ${teamName(issue.teamBId)}`;
    const parts = [
      "rotation" in issue ? t("T-2837", { n: issue.rotation, dia: issue.day }) : null,
      "teamId" in issue ? teamName(issue.teamId) : null,
      "baseId" in issue ? baseName(issue.baseId) : null,
    ].filter(Boolean);
    return `${label}: ${parts.join(" · ")}`;
  };
  return (
    <Section title={tList("T-2805")[4] ?? ""}>
      {active?.endsAt ? (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-titulo p-4">
          <div className="flex flex-col">
            <span className="font-semibold">
              {t("T-2837", { n: active.number, dia: active.day })}
            </span>
            <Cronometro
              endsAt={active.endsAt.toISOString()}
              serverNow={serverNow}
              labels={{ left: quedan ?? "", done: cumplido ?? "" }}
              className="text-display-md"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {[60, 300, -60].map((delta, index) => (
              <OperationForm
                key={delta}
                context={context}
                operation="adjust-timer"
                hidden={{ rotationId: active.id, deltaSeconds: String(delta) }}
              >
                <Submit>{clock[index]}</Submit>
              </OperationForm>
            ))}
            <OperationForm
              context={context}
              operation="close-rotation"
              hidden={{ rotationId: active.id }}
            >
              <Submit>{cerrar}</Submit>
            </OperationForm>
          </div>
        </div>
      ) : null}
      <OperationForm context={context} operation="advance-rotation">
        <Submit variant="primario">{avanzar}</Submit>
      </OperationForm>

      {([1, 2] as const).map((day) => {
        const own = rotations.filter((rotation) => rotation.day === day);
        return (
          <div key={day} className="flex flex-col gap-3">
            <h3 className="text-titulo-md">{t("T-2825", { dia: day })}</h3>
            {own.length === 0 ? (
              <OperationForm
                context={context}
                operation="generate-day"
                hidden={{ day: String(day) }}
                className="flex flex-wrap items-end gap-3"
              >
                <Campo id={`rot-${day}`} label={rotacionesLabel ?? ""}>
                  <input
                    id={`rot-${day}`}
                    name="rotations"
                    type="number"
                    min={1}
                    max={99}
                    required
                    className={`${inputClass} w-28`}
                    defaultValue={bases.filter((base) => base.day === day).length || ""}
                  />
                </Campo>
                <Campo id={`min-${day}`} label={minutos ?? ""}>
                  <input
                    id={`min-${day}`}
                    name="plannedMinutes"
                    type="number"
                    min={1}
                    max={240}
                    required
                    className={`${inputClass} w-28`}
                  />
                </Campo>
                <Submit variant="primario">{t("T-2831", { dia: day })}</Submit>
              </OperationForm>
            ) : null}
            {own.length === 0 ? (
              <ImportarJornada
                competitionId={context.competitionId}
                day={day}
                action={importDayAction}
                labels={importLabels(day)}
              />
            ) : (
              <>
                <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
                  {own.map((rotation) => (
                    <li
                      key={rotation.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-2"
                    >
                      <span>
                        <span className="font-semibold">
                          {t("T-2837", { n: rotation.number, dia: rotation.day })}
                        </span>
                        <span className="text-tinta-suave">
                          {" · "}
                          {rotationStatus(rotation.status)}
                          {" · "}
                          {t("T-2838", {
                            resultados: rotation.resultCount,
                            enfrentamientos: rotation.matchupCount,
                          })}
                          {rotation.startsAt ? ` · ${formatDateTime(rotation.startsAt)}` : ""}
                        </span>
                      </span>
                      <span className="flex flex-wrap gap-2">
                        <Link
                          className="text-sm underline"
                          href={`?area=rotaciones&rotacion=${rotation.id}`}
                        >
                          {t("T-2839")}
                        </Link>
                        {rotation.status !== "ACTIVE" && !active ? (
                          <OperationForm
                            context={context}
                            operation="start-rotation"
                            hidden={{ rotationId: rotation.id }}
                          >
                            <Submit>{rotation.status === "CLOSED" ? reabrir : iniciar}</Submit>
                          </OperationForm>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
                {own.every(
                  (rotation) => rotation.status === "PENDING" && rotation.resultCount === 0,
                ) ? (
                  <OperationForm
                    context={context}
                    operation="delete-day"
                    hidden={{ day: String(day) }}
                  >
                    <Submit>{t("T-2833", { dia: day })}</Submit>
                  </OperationForm>
                ) : null}
              </>
            )}
          </div>
        );
      })}

      {selected ? (
        <MatchupEditor context={context} rotation={selected} bases={bases} teams={teams} />
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-titulo-md">{errores}</h3>
        {report.errors.length === 0 ? (
          <p>{t("T-2843")}</p>
        ) : (
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {report.errors.map((issue) => (
              <li key={JSON.stringify(issue)}>{describe(issue)}</li>
            ))}
          </ul>
        )}
        {report.warnings.length > 0 ? (
          <details>
            <summary className="cursor-pointer font-semibold">
              {advertencias} ({report.warnings.length})
            </summary>
            <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
              {report.warnings.slice(0, 200).map((issue) => (
                <li key={JSON.stringify(issue)}>{describe(issue)}</li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </Section>
  );
}

function MatchupEditor({
  context,
  rotation,
  bases,
  teams,
}: {
  context: PanelContext;
  rotation: RotationView;
  bases: BaseRow[];
  teams: TeamRow[];
}) {
  const [enfrentamiento, otro, base, equipoA, equipoB] = tList("T-2886");
  const label = (matchup: MatchupView) =>
    `${matchup.base.name}: ${t("T-2883", { a: matchup.teamA.name, b: matchup.teamB.name })}`;
  const dayBases = bases.filter((item) => item.day === rotation.day);
  const active = teams.filter((team) => team.status === "ACTIVE");
  const back = { rotationId: rotation.id, "back-rotation": rotation.id };
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-borde bg-fondo p-4">
      <h3 className="text-titulo-md">{t("T-2837", { n: rotation.number, dia: rotation.day })}</h3>
      <ul className="m-0 grid list-none grid-cols-1 gap-1 p-0 text-sm sm:grid-cols-2">
        {rotation.matchups.map((matchup) => (
          <li key={matchup.id}>{label(matchup)}</li>
        ))}
      </ul>
      <OperationForm
        context={context}
        operation="swap-bases"
        hidden={back}
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
      >
        <Campo id="swap-a" label={enfrentamiento ?? ""}>
          <select id="swap-a" name="matchupId" required className={inputClass}>
            {rotation.matchups.map((matchup) => (
              <option key={matchup.id} value={matchup.id}>
                {label(matchup)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="swap-b" label={otro ?? ""}>
          <select id="swap-b" name="otherMatchupId" required className={inputClass}>
            {rotation.matchups.map((matchup) => (
              <option key={matchup.id} value={matchup.id}>
                {label(matchup)}
              </option>
            ))}
          </select>
        </Campo>
        <div className="flex flex-col gap-2">
          <Casilla id="swap-confirm" name="confirmWarnings" label={t("T-2842")} />
          <Submit>{t("T-2884")}</Submit>
        </div>
      </OperationForm>
      <OperationForm
        context={context}
        operation="edit-matchup"
        hidden={back}
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]"
      >
        <Campo id="edit-matchup" label={enfrentamiento ?? ""}>
          <select id="edit-matchup" name="matchupId" required className={inputClass}>
            {rotation.matchups.map((matchup) => (
              <option key={matchup.id} value={matchup.id}>
                {label(matchup)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="edit-base" label={base ?? ""}>
          <select id="edit-base" name="baseId" className={inputClass}>
            <option value="">—</option>
            {dayBases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </Campo>
        {(["teamAId", "teamBId"] as const).map((name, index) => (
          <Campo key={name} id={`edit-${name}`} label={(index === 0 ? equipoA : equipoB) ?? ""}>
            <select id={`edit-${name}`} name={name} className={inputClass}>
              <option value="">—</option>
              {active.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.number} {team.name}
                </option>
              ))}
            </select>
          </Campo>
        ))}
        <div className="flex flex-col gap-2">
          <Casilla id="edit-confirm" name="confirmWarnings" label={t("T-2842")} />
          <Submit>{t("T-2885")}</Submit>
        </div>
      </OperationForm>
    </div>
  );
}

export function ResultButtons({
  context,
  matchup,
}: {
  context: PanelContext;
  matchup: MatchupView;
}) {
  const options = [
    { outcome: "A_WIN", label: t("T-2846", { equipo: matchup.teamA.name }) },
    { outcome: "DRAW", label: t("T-2847") },
    { outcome: "B_WIN", label: t("T-2846", { equipo: matchup.teamB.name }) },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <OperationForm
          key={option.outcome}
          context={context}
          operation="record-result"
          hidden={{ matchupId: matchup.id, outcome: option.outcome }}
        >
          <Submit variant={matchup.outcome === option.outcome ? "primario" : "secundario"}>
            {option.label}
          </Submit>
        </OperationForm>
      ))}
      {matchup.outcome ? (
        <OperationForm context={context} operation="void-result" hidden={{ matchupId: matchup.id }}>
          <Submit variant="calido">{t("T-2848")}</Submit>
        </OperationForm>
      ) : null}
    </div>
  );
}

function MatchupRow({ context, matchup }: { context: PanelContext; matchup: MatchupView }) {
  const kinds = tList("T-2824");
  return (
    <li className="flex flex-col gap-2 border-t border-borde py-3">
      <span className="text-sm text-tinta-suave">
        {matchup.base.name}
        {matchup.base.kind === "MACRO" ? ` · ${kinds[1]}` : ""}
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <TeamChip team={matchup.teamA} />
        <span aria-hidden="true">·</span>
        <TeamChip team={matchup.teamB} />
      </span>
      <ResultButtons context={context} matchup={matchup} />
    </li>
  );
}

export function Resultados({
  context,
  current,
  pending,
  serverNow,
}: {
  context: PanelContext;
  current: RotationView | null;
  pending: MatchupView[];
  serverNow: string;
}) {
  const [quedan, cumplido] = tList("T-2881");
  return (
    <Section title={t("T-2845")}>
      {current ? (
        <>
          <div className="flex flex-wrap items-baseline gap-4">
            <h3 className="text-titulo-md">
              {t("T-2837", { n: current.number, dia: current.day })}
            </h3>
            {current.endsAt ? (
              <Cronometro
                endsAt={current.endsAt.toISOString()}
                serverNow={serverNow}
                labels={{ left: quedan ?? "", done: cumplido ?? "" }}
                className="font-semibold"
              />
            ) : null}
          </div>
          <ul className="m-0 flex list-none flex-col p-0">
            {current.matchups.map((matchup) => (
              <MatchupRow key={matchup.id} context={context} matchup={matchup} />
            ))}
          </ul>
        </>
      ) : (
        <p className="text-tinta-suave">{t("T-2850")}</p>
      )}
      {pending.length > 0 ? (
        <>
          <h3 className="text-titulo-md">{t("T-2849")}</h3>
          <ul className="m-0 flex list-none flex-col p-0">
            {pending.map((matchup) => (
              <MatchupRow key={matchup.id} context={context} matchup={matchup} />
            ))}
          </ul>
        </>
      ) : null}
    </Section>
  );
}

export function Posiciones({ standings, scope }: { standings: Standings; scope: string }) {
  const scopes = tList("T-2851");
  const columns = tList("T-2852");
  const keys = ["overall", "day1", "day2"] as const;
  const selected = keys.includes(scope as (typeof keys)[number])
    ? (scope as (typeof keys)[number])
    : "overall";
  const rows = standings[selected];
  return (
    <Section title={tList("T-2805")[6] ?? ""}>
      <nav className="flex flex-wrap gap-2" aria-label={tList("T-2805")[6] ?? ""}>
        {keys.map((key, index) => (
          <Link
            key={key}
            href={`?area=posiciones&alcance=${key}`}
            aria-current={key === selected ? "page" : undefined}
            className={key === selected ? "boton-primario min-h-11" : "boton-secundario min-h-11"}
          >
            {scopes[index]}
          </Link>
        ))}
      </nav>
      <table className="admin-data-table w-full text-left text-sm">
        <caption className="sr-only">{scopes[keys.indexOf(selected)]}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="py-2">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.teamId} className="border-t border-borde">
              <td className="py-2 tabular-nums">{row.rank}</td>
              <td className="py-2">
                <TeamChip team={row} />
              </td>
              <td className="py-2 font-semibold tabular-nums">{row.points}</td>
              <td className="py-2 tabular-nums">{row.played}</td>
              <td className="py-2 tabular-nums">{row.wins}</td>
              <td className="py-2 tabular-nums">{row.draws}</td>
              <td className="py-2 tabular-nums">{row.losses}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

const LEVEL_ORDER = ["EXCELLENT", "GOOD", "FAIR", "TO_IMPROVE"];

/** La rúbrica de una competencia extra: las notas consolidadas de cada equipo, del 1 al 10. */
function RubricTeams({
  context,
  extra,
  teams,
}: {
  context: PanelContext;
  extra: ExtraView;
  teams: TeamRow[];
}) {
  const rubric = extra.rubric;
  if (!rubric) return null;
  const levels = tList("T-2895");
  return (
    <ul className="m-0 mt-3 flex list-none flex-col divide-y divide-borde p-0">
      {teams.map((team) => {
        const own = rubric.teams.get(team.id);
        const points = extra.totals.get(team.id) ?? 0;
        return (
          <li key={team.id} className="py-3">
            <OperationForm
              context={context}
              operation="rubric-scores"
              hidden={{ extraId: extra.id, teamId: team.id }}
              className="flex flex-col gap-2"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-2">
                <TeamChip team={team} />
                <span className="text-sm text-tinta-suave">
                  {own?.total !== null && own?.total !== undefined
                    ? t("T-2896", {
                        total: own.total.toLocaleString("es-CO", { maximumFractionDigits: 1 }),
                        nivel: levels[LEVEL_ORDER.indexOf(own.level ?? "")] ?? "",
                        puntos: points,
                      })
                    : t("T-2897")}
                </span>
              </span>
              <span className="grid grid-cols-2 items-end gap-2 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
                {rubric.criteria.map((criterion, index) => (
                  <Campo
                    key={criterion.id}
                    id={`rubric-${criterion.id}-${team.id}`}
                    label={t("T-2901", { criterio: criterion.name, peso: criterion.weight })}
                  >
                    <input
                      id={`rubric-${criterion.id}-${team.id}`}
                      name="scores"
                      type="number"
                      min={RUBRIC_MIN_SCORE}
                      max={RUBRIC_MAX_SCORE}
                      step={1}
                      required
                      inputMode="numeric"
                      className={inputClass}
                      defaultValue={own?.scores[index] ?? ""}
                    />
                  </Campo>
                ))}
                <Submit>{t("T-253")}</Submit>
              </span>
            </OperationForm>
          </li>
        );
      })}
    </ul>
  );
}

export function Extras({
  context,
  extras,
  teams,
  ledger,
}: {
  context: PanelContext;
  extras: ExtraView[];
  teams: TeamRow[];
  ledger: Array<{
    id: string;
    teamNumber: number;
    teamName: string;
    day: number;
    kind: string;
    points: number;
    reason: string;
    createdAt: Date;
  }>;
}) {
  const [nombre, jornada] = tList("T-2855");
  const [equipo, dia, puntos, motivo] = tList("T-2858");
  const active = teams.filter((team) => team.status === "ACTIVE");
  return (
    <Section title={tList("T-2805")[7] ?? ""}>
      {extras.map((extra) => (
        <details key={extra.id} className="rounded-xl border border-borde bg-fondo p-4">
          <summary className="cursor-pointer font-semibold">
            {extra.name} · {t("T-2825", { dia: extra.day })}
          </summary>
          {extra.rubric ? (
            <RubricTeams context={context} extra={extra} teams={active} />
          ) : (
            <ul className="m-0 mt-3 flex list-none flex-col divide-y divide-borde p-0">
              {active.map((team) => (
                <li key={team.id} className="py-2">
                  <OperationForm
                    context={context}
                    operation="extra-points"
                    hidden={{ extraId: extra.id, teamId: team.id }}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <span className="min-w-48">
                      <TeamChip team={team} />
                    </span>
                    <Campo id={`extra-${extra.id}-${team.id}`} label={t("T-2856")}>
                      <input
                        id={`extra-${extra.id}-${team.id}`}
                        name="total"
                        type="number"
                        className={`${inputClass} w-32`}
                        defaultValue={extra.totals.get(team.id) ?? 0}
                      />
                    </Campo>
                    <Submit>{t("T-253")}</Submit>
                  </OperationForm>
                </li>
              ))}
            </ul>
          )}
        </details>
      ))}
      <OperationForm
        context={context}
        operation="create-extra"
        className="flex flex-wrap items-end gap-3"
      >
        <Campo id="extra-name" label={nombre ?? ""}>
          <input id="extra-name" name="name" required maxLength={80} className={inputClass} />
        </Campo>
        <Campo id="extra-day" label={jornada ?? ""}>
          <select id="extra-day" name="day" className={`${inputClass} w-28`}>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </Campo>
        <Campo id="extra-kind" label={t("T-2900")}>
          <select id="extra-kind" name="kind" className={inputClass}>
            <option value="DIRECT">{tList("T-2894")[0]}</option>
            <option value="THE_CHALLENGE_RUBRIC">{tList("T-2894")[1]}</option>
          </select>
        </Campo>
        <Submit variant="primario">{t("T-2854")}</Submit>
      </OperationForm>

      <h3 className="text-titulo-md">{t("T-2857")}</h3>
      <OperationForm
        context={context}
        operation="adjustment"
        className="grid max-w-3xl grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_6rem_8rem_1fr_auto]"
      >
        <Campo id="adj-team" label={equipo ?? ""}>
          <select id="adj-team" name="teamId" required className={inputClass}>
            {active.map((team) => (
              <option key={team.id} value={team.id}>
                {team.number} {team.name}
              </option>
            ))}
          </select>
        </Campo>
        <Campo id="adj-day" label={dia ?? ""}>
          <select id="adj-day" name="day" className={inputClass}>
            <option value="1">1</option>
            <option value="2">2</option>
          </select>
        </Campo>
        <Campo id="adj-points" label={puntos ?? ""}>
          <input id="adj-points" name="points" type="number" required className={inputClass} />
        </Campo>
        <Campo id="adj-reason" label={motivo ?? ""}>
          <input id="adj-reason" name="reason" required maxLength={200} className={inputClass} />
        </Campo>
        <Submit variant="primario">{t("T-253")}</Submit>
      </OperationForm>

      <details>
        <summary className="cursor-pointer font-semibold">{t("T-2859")}</summary>
        <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0 text-sm">
          {ledger.map((entry) => (
            <li key={entry.id} className="border-t border-borde py-1">
              {formatDateTime(entry.createdAt)} · {entry.teamNumber} {entry.teamName} ·{" "}
              {t("T-2825", { dia: entry.day })} ·{" "}
              <span className="font-semibold tabular-nums">
                {entry.points > 0 ? `+${entry.points}` : entry.points}
              </span>
              {entry.reason ? ` · ${entry.reason}` : ""}
            </li>
          ))}
        </ul>
      </details>
    </Section>
  );
}
