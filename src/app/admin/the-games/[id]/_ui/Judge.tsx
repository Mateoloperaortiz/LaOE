import {
  type JudgeMatchupPowers,
  judgeStage,
  LATE_START_SECONDS,
  type MatchupView,
  type Outcome,
  POWER_EFFECTS,
  POWER_SLUGS,
  POWER_TYPES,
  type Power,
  type PowerEffect,
  type PowerSide,
} from "@/modules/competition";
import { CuentaRival } from "@/modules/competition/components/CuentaRival";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { t, tList } from "@/shared/copy";
import { formatTime } from "@/shared/lib/dates";
import { judgePowerAction, judgeResultAction } from "../actions";

// Un enfrentamiento en la pantalla del líder de base (ADR-089 regla 10, ADR-098 y ADR-106). La base
// empieza con la rotación: mientras los poderes sigan abiertos, el líder registra las tarjetas que
// recibe y los confirma con un aviso. Cada resultado pide confirmar, con el oficial que dejaría, y queda
// bloqueado para el líder. Si alguien registró un poder, se confirma antes del resultado.

const points = (value: number) => value.toLocaleString("es-CO");
const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function powerLabel(power: Power): string {
  return tList("T-3040")[POWER_TYPES.indexOf(power)] ?? power;
}

function effectLabel(effect: Exclude<PowerEffect, "APPLIED">): string {
  return tList("T-3047")[POWER_EFFECTS.indexOf(effect)] ?? effect;
}

export function PowerMedal({ power, size = 48 }: { power: Power; size?: number }) {
  return (
    // biome-ignore lint/performance/noImgElement: son archivos estáticos de 256 px, ya optimizados.
    <img
      src={`/the-games/poderes/${POWER_SLUGS[power]}.webp`}
      alt=""
      width={size}
      height={size}
      className="shrink-0"
    />
  );
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

function Hidden({ values }: { values: Record<string, string> }) {
  return Object.entries(values).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

export function JudgeMatchup({
  competitionId,
  matchup,
  powers,
  serverNow,
  macroLabel,
}: {
  competitionId: string;
  matchup: MatchupView;
  powers: JudgeMatchupPowers | undefined;
  serverNow: string;
  macroLabel: string;
}) {
  const teams: Record<PowerSide, MatchupView["teamA"]> = { A: matchup.teamA, B: matchup.teamB };
  const rivalOf = (side: PowerSide) => (side === "A" ? matchup.teamB : matchup.teamA);
  const uses = powers?.uses ?? [];
  const normal = matchup.base.kind === "NORMAL";
  const stage = judgeStage({
    normal,
    powersClosed: matchup.startedAt !== null,
    recorded: matchup.outcome !== null,
    declared: uses.length,
    available: (powers?.available.A.length ?? 0) + (powers?.available.B.length ?? 0),
  });
  const resultOf = (outcome: Outcome) =>
    lowerFirst(
      outcome === "DRAW"
        ? t("T-2847")
        : t("T-2846", { equipo: outcome === "A_WIN" ? matchup.teamA.name : matchup.teamB.name }),
    );
  const options = [
    { outcome: "A_WIN" as const, label: t("T-2846", { equipo: matchup.teamA.name }) },
    { outcome: "DRAW" as const, label: t("T-2847") },
    { outcome: "B_WIN" as const, label: t("T-2846", { equipo: matchup.teamB.name }) },
  ];
  const recorded = options.find((option) => option.outcome === matchup.outcome);
  const base = { competitionId, matchupId: matchup.id };
  const detail = matchup.powerDetail;
  return (
    <section
      id={`m-${matchup.id}`}
      aria-label={`${matchup.base.name}: ${matchup.teamA.name} · ${matchup.teamB.name}`}
      className="flex scroll-mt-4 flex-col gap-4 rounded-xl border-2 border-borde bg-fondo p-4"
    >
      <p className="text-sm text-tinta-suave">
        {matchup.base.name}
        {normal ? "" : ` · ${macroLabel}`}
      </p>
      <Team team={matchup.teamA} />
      <Team team={matchup.teamB} />

      {stage.powers ? (
        <>
          <section className="flex flex-col gap-4" aria-labelledby={`poderes-${matchup.id}`}>
            <h3 id={`poderes-${matchup.id}`} className="font-semibold">
              {t("T-3096")}
            </h3>
            {(["A", "B"] as const).map((side) => {
              const team = teams[side];
              const own = uses.find((use) => use.side === side);
              const available = powers?.available[side] ?? [];
              return (
                <div key={side} className="flex flex-col gap-2">
                  <p className="font-semibold">{team.name}</p>
                  {own ? (
                    <div className="flex items-center gap-3">
                      <PowerMedal power={own.power} />
                      <div className="flex min-w-0 flex-col">
                        <span className="font-semibold">{powerLabel(own.power)}</span>
                        <span className="text-sm text-tinta-suave">
                          {t("T-3102", { hora: formatTime(own.receivedAt) })}
                        </span>
                        {own.state !== "ACTIVE" ? (
                          <span className="text-sm">{effectLabel(own.state)}</span>
                        ) : null}
                      </div>
                      <form action={judgePowerAction} className="ml-auto">
                        <Hidden values={{ ...base, operation: "withdraw", useId: own.id }} />
                        <AdminSubmitButton className="boton-secundario min-h-11">
                          {t("T-3103")}
                        </AdminSubmitButton>
                      </form>
                    </div>
                  ) : available.length === 0 ? (
                    <p className="text-sm text-tinta-suave">{t("T-3097")}</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {available.map((item) => (
                        <li key={item.power}>
                          <details className="rounded-lg border border-borde p-3">
                            <summary className="flex min-h-11 cursor-pointer items-center gap-3 font-semibold">
                              <PowerMedal power={item.power} size={40} />
                              {t("T-3098", { poder: powerLabel(item.power), n: item.count })}
                            </summary>
                            <div className="mt-3 flex flex-col gap-3">
                              <p>
                                {t("T-3099", { poder: powerLabel(item.power), equipo: team.name })}
                              </p>
                              <p className="text-sm text-tinta-suave">{t("T-3100")}</p>
                              <form action={judgePowerAction}>
                                <Hidden
                                  values={{
                                    ...base,
                                    operation: "declare",
                                    teamId: team.id,
                                    teamName: team.name,
                                    power: item.power,
                                  }}
                                />
                                <AdminSubmitButton className="boton-primario min-h-11 w-full">
                                  {t("T-3101")}
                                </AdminSubmitButton>
                              </form>
                            </div>
                          </details>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
          <details className="rounded-lg border-2 border-borde p-3">
            <summary className="boton-primario flex min-h-14 cursor-pointer items-center justify-center text-lg">
              {t("T-3104")}
            </summary>
            <div className="mt-3 flex flex-col gap-3">
              <p className="font-semibold">{t("T-3105")}</p>
              <form action={judgePowerAction}>
                <Hidden values={{ ...base, operation: "start" }} />
                <AdminSubmitButton className="boton-primario min-h-11 w-full">
                  {t("T-3106")}
                </AdminSubmitButton>
              </form>
            </div>
          </details>
        </>
      ) : (
        <>
          {matchup.startedAt && !matchup.outcome ? (
            <p className="text-sm text-tinta-suave">
              {t("T-3107", { hora: formatTime(matchup.startedAt) })}
            </p>
          ) : null}
          {uses.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {uses.map((use) => (
                <li key={use.id} className="flex items-center gap-3">
                  <PowerMedal power={use.power} size={40} />
                  <span className="flex flex-col">
                    <span className="font-semibold">
                      {t("T-3118", { poder: powerLabel(use.power), equipo: teams[use.side].name })}
                    </span>
                    {use.state !== "ACTIVE" ? (
                      <span className="text-sm text-tinta-suave">{effectLabel(use.state)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {matchup.startedAt && !matchup.outcome
            ? uses
                .filter((use) => use.power === "LATE_START" && use.state === "ACTIVE")
                .map((use) => (
                  <CuentaRival
                    key={use.id}
                    startsAt={new Date(
                      (matchup.startedAt?.getTime() ?? 0) + LATE_START_SECONDS * 1000,
                    ).toISOString()}
                    serverNow={serverNow}
                    labels={{
                      waiting: t("T-3108", { equipo: rivalOf(use.side).name }),
                      ready: t("T-3109", { equipo: rivalOf(use.side).name }),
                    }}
                  />
                ))
            : null}
          {uses
            .filter((use) => use.power === "ONE_PLAYER_DOWN" && use.state === "ACTIVE")
            .map((use) => (
              <p
                key={use.id}
                className="rounded-lg border-2 border-oe-orange px-3 py-2 font-semibold"
              >
                {t("T-3110", { equipo: rivalOf(use.side).name })}
              </p>
            ))}
        </>
      )}

      {stage.confirmFirst ? <p className="font-semibold">{t("T-3201")}</p> : null}

      {stage.results ? (
        <div className="flex flex-col gap-3">
          {options.map((option) => {
            const preview = powers?.preview?.[option.outcome];
            return (
              <details key={option.outcome} name={`resultado-${matchup.id}`}>
                <summary className="boton-secundario flex min-h-14 w-full cursor-pointer items-center justify-center text-lg">
                  {option.label}
                </summary>
                <div className="mt-2 flex flex-col gap-3 rounded-lg border-2 border-oe-orange p-3">
                  <p className="font-semibold">
                    {t("T-3196", { resultado: resultOf(option.outcome) })}
                  </p>
                  {preview ? (
                    <p className="text-sm">
                      {t("T-3111", {
                        resultado: resultOf(preview.official),
                        puntosA: points(preview.points.a),
                        puntosB: points(preview.points.b),
                      })}
                    </p>
                  ) : null}
                  {stage.powers ? <p className="text-sm">{t("T-3197")}</p> : null}
                  <form action={judgeResultAction}>
                    <Hidden values={{ ...base, outcome: option.outcome, label: option.label }} />
                    <AdminSubmitButton className="boton-primario min-h-14 w-full text-lg">
                      {t("T-3198")}
                    </AdminSubmitButton>
                  </form>
                </div>
              </details>
            );
          })}
        </div>
      ) : null}

      {stage.locked && recorded ? (
        <p className="rounded-lg border-2 border-titulo px-3 py-2 font-semibold">
          {t("T-3199", { resultado: recorded.label })}
        </p>
      ) : null}

      {detail ? (
        <div className="flex flex-col gap-1 rounded-lg bg-oe-yellow-soft px-3 py-2 text-oe-navy">
          <p className="font-semibold">
            {t("T-3112", {
              cancha: resultOf(detail.sporting),
              oficial: resultOf(detail.official),
            })}
          </p>
          {(["A", "B"] as const).map((side) => {
            const row = detail.teams[side];
            return (
              <p key={side}>
                {row.bonus > 0
                  ? t("T-3113", {
                      equipo: teams[side].name,
                      total: points(row.total),
                      base: points(row.base),
                      bono: points(row.bonus),
                    })
                  : t("T-3114", { equipo: teams[side].name, total: points(row.total) })}
              </p>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
