import type { Metadata } from "next";
import { cookies } from "next/headers";
import { single } from "@/app/_lib/search";
import {
  creditBalances,
  getHubTeam,
  HUB_COOKIE,
  type HubTeam,
  hubSessionFromCookie,
  listMarkets,
  listTeamBetReturns,
  listTeams,
  type MarketView,
  type TeamRow,
} from "@/modules/competition";
import { Actualizador } from "@/modules/competition/components/Actualizador";
import { inputClass } from "@/shared/admin-kit/AdminFields";
import { BarraTitulo } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatTime } from "@/shared/lib/dates";
import { paginaMetadata } from "@/shared/lib/seo";
import { enterHubAction, hubBetAction, leaveHubAction } from "./actions";

// Hub de capitanes (ADR-096): el capitán entra con el código de su equipo y solo ve y hace las
// apuestas de su equipo: saldo, apuestas abiertas con su bolsa, apostar y cómo quedaron las suyas.
// Sin cuenta ni datos personales; la sesión es una cookie firmada del equipo.

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    ...paginaMetadata({ title: t("T-3036"), description: t("T-3037"), path: "/capitanes" }),
    robots: { index: false },
  };
}

function Mensajes({ aviso, error }: { aviso: string; error: string }) {
  return (
    <>
      {error ? (
        <p
          role="alert"
          className="max-w-2xl rounded-xl bg-oe-orange px-4 py-3 font-semibold text-oe-navy"
        >
          {error}
        </p>
      ) : null}
      {aviso ? (
        <output className="block max-w-2xl rounded-xl border border-borde bg-fondo-suave px-4 py-3">
          {aviso}
        </output>
      ) : null}
    </>
  );
}

function Ingreso({ aviso, error }: { aviso: string; error: string }) {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <BarraTitulo nivel="h1" color="azul" className="self-start">
        {t("T-3036")}
      </BarraTitulo>
      <Mensajes aviso={aviso} error={error} />
      <form action={enterHubAction} className="flex max-w-md flex-col gap-4">
        <p id="codigo-ayuda" className="text-lg">
          {t("T-3037")}
        </p>
        <label htmlFor="codigo" className="flex flex-col gap-1">
          <span className="font-semibold">{t("T-3038")}</span>
          <input
            id="codigo"
            name="code"
            required
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-describedby="codigo-ayuda"
            className={`${inputClass} font-mono text-2xl tracking-widest uppercase`}
          />
        </label>
        <button type="submit" className="boton-calido min-h-11 self-start">
          {t("T-3039")}
        </button>
      </form>
      <p className="max-w-prose text-sm text-tinta-suave">{t("T-3057")}</p>
    </div>
  );
}

function resultado(
  market: MarketView,
  bet: { id: string; pickTeamId: string; stake: number },
  returns: Awaited<ReturnType<typeof listTeamBetReturns>>,
): string {
  const received = returns.get(bet.id);
  if (market.status === "CANCELLED") return t("T-3065", { puntos: received?.amount ?? bet.stake });
  if (market.status !== "RESOLVED") return t("T-3054");
  if (received?.kind === "PAYOUT") return t("T-3062", { puntos: received.amount });
  if (received?.kind === "REFUND") return t("T-3064", { puntos: received.amount });
  return t("T-3063");
}

function Apuesta({
  market,
  team,
  saldo,
  teamOf,
}: {
  market: MarketView;
  team: HubTeam;
  saldo: number;
  teamOf: (id: string) => TeamRow | undefined;
}) {
  const [quienGana, puntos] = tList("T-3047");
  const own = market.bets.find((bet) => bet.teamId === team.teamId);
  const label = (id: string) => {
    const option = teamOf(id);
    return option ? `${option.number} ${option.name}` : "";
  };
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-cartel)] border border-borde bg-fondo-suave p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-titulo-md">{market.title}</h3>
        {market.closesAt ? (
          <p className="text-sm text-tinta-suave">
            {t("T-3049", { hora: formatTime(market.closesAt) })}
          </p>
        ) : null}
      </div>
      {own ? (
        <p className="font-semibold">
          {t("T-3052", { puntos: own.stake, equipo: label(own.pickTeamId) })}
        </p>
      ) : saldo <= 0 ? (
        <p>{t("T-3059")}</p>
      ) : (
        <form action={hubBetAction} className="flex flex-col gap-3">
          <input type="hidden" name="marketId" value={market.id} />
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-semibold">{quienGana}</legend>
            {market.options.map((optionId) => {
              const self = optionId === team.teamId;
              const disabled = self && !team.allowSelfBet;
              const id = `apuesta-${market.id}-${optionId}`;
              return (
                <label
                  key={optionId}
                  htmlFor={id}
                  className={`flex min-h-11 items-center gap-3 ${disabled ? "opacity-60" : ""}`}
                >
                  <input
                    id={id}
                    type="radio"
                    name="pickTeamId"
                    value={optionId}
                    required
                    disabled={disabled}
                    className="size-5"
                  />
                  <span className="flex-1">
                    {label(optionId)}
                    {self ? ` ${t("T-3060")}` : ""}
                  </span>
                  <span className="text-sm text-tinta-suave tabular-nums">
                    {t("T-3050", { puntos: market.pools.get(optionId) ?? 0 })}
                  </span>
                </label>
              );
            })}
          </fieldset>
          <label htmlFor={`puntos-${market.id}`} className="flex flex-col gap-1 self-start">
            <span className="font-semibold">{puntos}</span>
            <input
              id={`puntos-${market.id}`}
              name="stake"
              type="number"
              inputMode="numeric"
              min={1}
              max={saldo}
              step={1}
              required
              className={`${inputClass} w-40 tabular-nums`}
            />
          </label>
          <button type="submit" className="boton-calido min-h-11 self-start">
            {t("T-3048")}
          </button>
        </form>
      )}
    </li>
  );
}

export default async function CapitanesPage({ searchParams }: PageProps<"/capitanes">) {
  const search = await searchParams;
  const aviso = single(search.aviso);
  const error = single(search.error);
  const cookie = (await cookies()).get(HUB_COOKIE)?.value;
  const team = await getHubTeam(hubSessionFromCookie(cookie));
  if (!team) {
    return <Ingreso aviso={aviso} error={error || (cookie ? t("T-3056") : "")} />;
  }
  const [teams, markets, balances, returns] = await Promise.all([
    listTeams(team.competitionId),
    listMarkets(team.competitionId),
    creditBalances(team.competitionId),
    listTeamBetReturns(team.competitionId, team.teamId),
  ]);
  const saldo = balances.get(team.teamId) ?? 0;
  const byId = new Map(teams.map((item) => [item.id, item]));
  const teamOf = (id: string) => byId.get(id);
  const open = markets.filter((market) => market.status === "OPEN");
  const mine = markets.flatMap((market) => {
    const bet = market.bets.find((item) => item.teamId === team.teamId);
    return bet ? [{ market, bet }] : [];
  });
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <Actualizador intervalMs={15_000} />
      <header className="flex flex-col gap-3">
        <BarraTitulo nivel="h1" color="azul" className="self-start">
          {t("T-3036")}
        </BarraTitulo>
        <p className="text-lg font-semibold">
          {t("T-3042", { n: team.number, nombre: team.name })}
        </p>
        {team.isRehearsal ? <p className="eyebrow text-oe-orange">{t("T-3061")}</p> : null}
        <p className="text-2xl font-semibold tabular-nums">{t("T-3043", { saldo })}</p>
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-3044")}</p>
        <form action={leaveHubAction}>
          <button type="submit" className="boton-secundario min-h-11">
            {t("T-3055")}
          </button>
        </form>
      </header>
      <Mensajes aviso={aviso} error={error} />
      <section aria-labelledby="abiertas" className="flex flex-col gap-4">
        <h2 id="abiertas" className="text-display-md">
          {t("T-3045")}
        </h2>
        {open.length === 0 ? (
          <p>{t("T-3046")}</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 md:grid-cols-2">
            {open.map((market) => (
              <Apuesta key={market.id} market={market} team={team} saldo={saldo} teamOf={teamOf} />
            ))}
          </ul>
        )}
      </section>
      {mine.length > 0 ? (
        <section aria-labelledby="mias" className="flex flex-col gap-4">
          <h2 id="mias" className="text-display-md">
            {t("T-3053")}
          </h2>
          <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
            {mine.map(({ market, bet }) => {
              const pick = teamOf(bet.pickTeamId);
              return (
                <li key={bet.id} className="flex flex-col gap-1 py-3">
                  <span className="font-semibold">{market.title}</span>
                  <span>
                    {t("T-3052", {
                      puntos: bet.stake,
                      equipo: pick ? `${pick.number} ${pick.name}` : "",
                    })}{" "}
                    {resultado(market, bet, returns)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <p className="max-w-prose text-sm text-tinta-suave">{t("T-3057")}</p>
    </div>
  );
}
