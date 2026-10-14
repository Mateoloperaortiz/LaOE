import {
  type AnnouncementRow,
  type CompetitionRow,
  MARKET_STATUSES,
  type MarketView,
  type TeamRow,
} from "@/modules/competition";
import { Campo, inputClass } from "@/shared/admin-kit/AdminFields";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { OperationForm, type PanelContext, Section, Submit, TeamChip } from "./shared";

// Anuncios de la vitrina (ADR-089 regla 11) y apuestas con puntos virtuales (ADR-091): el operador
// abre las apuestas y registra la de cada equipo con su código; la vitrina muestra la bolsa.

const ANNOUNCEMENT_LEVELS = ["INFO", "WARNING", "URGENT"] as const;

export function Anuncios({
  context,
  announcements,
}: {
  context: PanelContext;
  announcements: AnnouncementRow[];
}) {
  const levels = tList("T-2860");
  const [ocultar, mostrar] = tList("T-2862");
  const levelNames = tLabels("T-2860", ANNOUNCEMENT_LEVELS);
  const levelOf = (level: AnnouncementRow["level"]) => levelNames[level] ?? level;
  return (
    <Section title={tList("T-2805")[8] ?? ""}>
      <OperationForm
        context={context}
        operation="announce"
        className="grid max-w-3xl grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_10rem_auto]"
      >
        <Campo id="announce-message" label={tList("T-2805")[8] ?? ""}>
          <textarea
            id="announce-message"
            name="message"
            required
            maxLength={280}
            rows={2}
            className={inputClass}
          />
        </Campo>
        <Campo id="announce-level" label="">
          <select id="announce-level" name="level" className={inputClass} aria-label={levels[0]}>
            <option value="INFO">{levels[0]}</option>
            <option value="WARNING">{levels[1]}</option>
            <option value="URGENT">{levels[2]}</option>
          </select>
        </Campo>
        <Submit variant="primario">{t("T-2861")}</Submit>
      </OperationForm>
      {announcements.length === 0 ? (
        <p className="text-tinta-suave">{t("T-2891")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-borde p-0">
          {announcements.map((item) => (
            <li
              key={item.id}
              className={`flex flex-wrap items-center justify-between gap-3 py-3 ${item.active ? "" : "opacity-60"}`}
            >
              <span>
                <span className="text-sm text-tinta-suave">
                  {levelOf(item.level)} · {formatDateTime(item.createdAt)}
                </span>
                <span className="block">{item.message}</span>
              </span>
              <OperationForm
                context={context}
                operation="announcement-active"
                hidden={{ announcementId: item.id, active: item.active ? "false" : "true" }}
              >
                <Submit>{item.active ? ocultar : mostrar}</Submit>
              </OperationForm>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function Apuestas({
  context,
  competition,
  markets,
  teams,
  balances,
}: {
  context: PanelContext;
  competition: CompetitionRow;
  markets: MarketView[];
  teams: TeamRow[];
  balances: Map<string, number>;
}) {
  const states = tLabels("T-2867", MARKET_STATUSES);
  const [abrir, cerrar, cancelar] = tList("T-2868");
  const [titulo, equiposLabel, cierra] = tList("T-2866");
  const [apuesta, codigo, porQuien, puntos] = tList("T-2871");
  const active = teams.filter((team) => team.status === "ACTIVE");
  const teamOf = (id: string) => teams.find((team) => team.id === id);
  const stateOf = (status: MarketView["status"]) => states[status] ?? status;
  return (
    <Section title={tList("T-2805")[9] ?? ""}>
      {!competition.bettingEnabled ? <p className="font-semibold">{t("T-2863")}</p> : null}
      {competition.startingCredits ? (
        <OperationForm context={context} operation="grant-credits">
          <Submit>{t("T-2864", { n: competition.startingCredits })}</Submit>
        </OperationForm>
      ) : null}

      <h3 className="text-titulo-md">{t("T-2872")}</h3>
      <ul className="m-0 grid list-none grid-cols-1 gap-1 p-0 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {active.map((team) => (
          <li
            key={team.id}
            className="flex items-center justify-between gap-2 border-b border-borde py-1"
          >
            <TeamChip team={team} />
            <span className="font-semibold tabular-nums">{balances.get(team.id) ?? 0}</span>
          </li>
        ))}
      </ul>

      <h3 className="text-titulo-md">{t("T-2865")}</h3>
      <OperationForm
        context={context}
        operation="create-market"
        className="flex max-w-3xl flex-col gap-3"
      >
        <Campo id="market-title" label={titulo ?? ""}>
          <input id="market-title" name="title" required maxLength={120} className={inputClass} />
        </Campo>
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold">{equiposLabel}</legend>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((team) => (
              <label key={team.id} className="flex min-h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="teamIds"
                  value={team.id}
                  className="size-5 accent-oe-navy"
                />
                <TeamChip team={team} />
              </label>
            ))}
          </div>
        </fieldset>
        <Campo id="market-closes" label={cierra ?? ""}>
          <input
            id="market-closes"
            name="closesAt"
            type="datetime-local"
            className={`${inputClass} w-64`}
          />
        </Campo>
        <div>
          <Submit variant="primario">{t("T-2865")}</Submit>
        </div>
      </OperationForm>

      {markets.length === 0 ? (
        <p className="text-tinta-suave">{t("T-2890")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-4 p-0">
          {markets.map((market) => {
            const pool = [...market.pools.values()].reduce((sum, value) => sum + value, 0);
            const hidden = { marketId: market.id };
            return (
              <li
                key={market.id}
                className="flex flex-col gap-3 rounded-xl border border-borde bg-fondo p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h4 className="font-semibold">{market.title}</h4>
                  <span className="text-sm text-tinta-suave">
                    {stateOf(market.status)} · {t("T-2873", { n: pool })}
                    {market.closesAt ? ` · ${formatDateTime(market.closesAt)}` : ""}
                  </span>
                </div>
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
                  {market.options.map((teamId) => {
                    const team = teamOf(teamId);
                    return team ? (
                      <li key={teamId} className="flex items-center justify-between gap-2">
                        <TeamChip team={team} />
                        <span className="tabular-nums">
                          {market.pools.get(teamId) ?? 0}
                          {market.winnerTeamId === teamId ? " ★" : ""}
                        </span>
                      </li>
                    ) : null;
                  })}
                </ul>
                <div className="flex flex-wrap gap-2">
                  {market.status === "DRAFT" ? (
                    <OperationForm context={context} operation="market-open" hidden={hidden}>
                      <Submit variant="primario">{abrir}</Submit>
                    </OperationForm>
                  ) : null}
                  {market.status === "OPEN" ? (
                    <OperationForm context={context} operation="market-close" hidden={hidden}>
                      <Submit>{cerrar}</Submit>
                    </OperationForm>
                  ) : null}
                  {market.status === "OPEN" ||
                  market.status === "CLOSED" ||
                  market.status === "DRAFT" ? (
                    <OperationForm context={context} operation="market-cancel" hidden={hidden}>
                      <Submit variant="calido">{cancelar}</Submit>
                    </OperationForm>
                  ) : null}
                </div>
                {market.status === "OPEN" || market.status === "CLOSED" ? (
                  <OperationForm
                    context={context}
                    operation="market-resolve"
                    hidden={hidden}
                    className="flex flex-wrap items-end gap-3"
                  >
                    <Campo id={`winner-${market.id}`} label={t("T-2869")}>
                      <select
                        id={`winner-${market.id}`}
                        name="winnerTeamId"
                        required
                        className={inputClass}
                      >
                        {market.options.map((teamId) => (
                          <option key={teamId} value={teamId}>
                            {teamOf(teamId)?.number} {teamOf(teamId)?.name}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Submit>{t("T-2869")}</Submit>
                  </OperationForm>
                ) : null}
                {market.status === "OPEN" && competition.bettingEnabled ? (
                  <OperationForm
                    context={context}
                    operation="place-bet"
                    hidden={hidden}
                    className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_1fr_7rem_auto]"
                  >
                    <Campo id={`bet-team-${market.id}`} label={apuesta ?? ""}>
                      <select
                        id={`bet-team-${market.id}`}
                        name="teamId"
                        required
                        className={inputClass}
                      >
                        {active.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.number} {team.name}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo id={`bet-code-${market.id}`} label={codigo ?? ""}>
                      <input
                        id={`bet-code-${market.id}`}
                        name="code"
                        required
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        className={`${inputClass} font-mono uppercase`}
                      />
                    </Campo>
                    <Campo id={`bet-pick-${market.id}`} label={porQuien ?? ""}>
                      <select
                        id={`bet-pick-${market.id}`}
                        name="pickTeamId"
                        required
                        className={inputClass}
                      >
                        {market.options.map((teamId) => (
                          <option key={teamId} value={teamId}>
                            {teamOf(teamId)?.number} {teamOf(teamId)?.name}
                          </option>
                        ))}
                      </select>
                    </Campo>
                    <Campo id={`bet-stake-${market.id}`} label={puntos ?? ""}>
                      <input
                        id={`bet-stake-${market.id}`}
                        name="stake"
                        type="number"
                        min={1}
                        required
                        className={inputClass}
                      />
                    </Campo>
                    <Submit variant="primario">{t("T-2870")}</Submit>
                  </OperationForm>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}
