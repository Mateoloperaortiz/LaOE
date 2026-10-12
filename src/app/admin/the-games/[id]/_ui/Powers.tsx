import {
  POWER_EFFECTS,
  POWER_RULES,
  POWER_TYPES,
  type PowerBoard,
  type PowerBoardGrant,
} from "@/modules/competition";
import { ImportarPoderes } from "@/modules/competition/components/ImportarPoderes";
import { Campo, Casilla, inputClass } from "@/shared/admin-kit/AdminFields";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDate, formatTime } from "@/shared/lib/dates";
import { importPowersAction } from "../actions";
import { PowerMedal, powerLabel } from "./Judge";
import { OperationForm, type PanelContext, Section, Submit, TeamChip } from "./shared";

// El panel de Poderes (ADR-098): el reparto de cada equipo con sus entregas, los poderes registrados
// en las bases con su efecto, y las reglas vigentes. Cada cambio pasa por un comando auditado; anular y
// revertir piden motivo.

const GRANT_STATES = ["ASSIGNED", "DELIVERED", "USED", "EXPIRED", "VOIDED"] as const;

export function Poderes({ context, board }: { context: PanelContext; board: PowerBoard }) {
  const days = tList("T-3048");
  const dayName = (day: number) => (days[day - 1] ?? String(day)).toLowerCase();
  const states = tLabels("T-3046", GRANT_STATES);
  const stateOf = (grant: PowerBoardGrant) => states[grant.state] ?? grant.state;
  const columns = tList("T-3078");
  const completeness = tList("T-3086");
  const useColumns = tList("T-3088");
  const effects = tLabels("T-3047", POWER_EFFECTS);
  const fields = tList("T-3119");
  const { totals } = board;
  return (
    <div className="flex min-w-0 flex-col gap-10">
      <Section title={t("T-3076")}>
        <p>
          {totals.grants > 0
            ? t("T-3077", {
                entregadas: totals.delivered,
                total: totals.grants,
                completos: totals.completeTeams,
                equipos: totals.teams,
              })
            : t("T-3094")}
        </p>
        <ImportarPoderes
          competitionId={context.competitionId}
          action={importPowersAction}
          open={totals.grants === 0}
          labels={{
            title: t("T-3064"),
            help: t("T-3065"),
            sheet: t("T-3066"),
            submit: t("T-3067"),
            pending: t("T-3020"),
            blocked: t("T-2924"),
            more: t("T-2922"),
          }}
        />
        {totals.grants > 0 ? (
          <>
            <div className="flex flex-wrap gap-2">
              {[1, 2].map((day) => (
                <OperationForm
                  key={day}
                  context={context}
                  operation="deliver-powers"
                  hidden={{ day: String(day) }}
                >
                  <Submit>{t("T-3080", { dia: dayName(day) })}</Submit>
                </OperationForm>
              ))}
            </div>
            <table className="admin-data-table w-full text-left text-sm">
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
                {board.teams.map((team) => (
                  <tr key={team.id} className="border-t border-borde align-top">
                    <td data-label={columns[0]} className="py-2">
                      <TeamChip team={team} />
                      <span className="block text-xs text-tinta-suave">
                        {team.complete ? completeness[0] : completeness[1]} · {team.dayOne}/
                        {team.dayTwo}
                      </span>
                    </td>
                    {[1, 2].map((day) => (
                      <td key={day} data-label={columns[day]} className="py-2">
                        <ul className="flex flex-col gap-2">
                          {team.grants
                            .filter((grant) => grant.day === day)
                            .map((grant) => (
                              <li key={grant.id} className="flex flex-wrap items-center gap-2">
                                <PowerMedal power={grant.power} size={28} />
                                <span className={grant.status === "VOIDED" ? "line-through" : ""}>
                                  {powerLabel(grant.power)}
                                </span>
                                <span className="text-xs text-tinta-suave">
                                  {stateOf(grant)}
                                  {grant.state === "DELIVERED" && grant.deliveredAt
                                    ? ` · ${formatTime(grant.deliveredAt)}`
                                    : ""}
                                  {grant.voidReason ? ` · ${grant.voidReason}` : ""}
                                </span>
                                {grant.state === "ASSIGNED" || grant.state === "DELIVERED" ? (
                                  <details>
                                    <summary className="cursor-pointer text-xs underline">
                                      {t("T-3081")}
                                    </summary>
                                    <OperationForm
                                      context={context}
                                      operation="void-power"
                                      hidden={{ grantId: grant.id }}
                                      className="mt-2 flex flex-col gap-2"
                                    >
                                      <Campo id={`anular-${grant.id}`} label={t("T-3082")}>
                                        <input
                                          id={`anular-${grant.id}`}
                                          name="reason"
                                          required
                                          minLength={2}
                                          maxLength={200}
                                          className={inputClass}
                                        />
                                      </Campo>
                                      <Submit>{t("T-3081")}</Submit>
                                    </OperationForm>
                                  </details>
                                ) : null}
                              </li>
                            ))}
                        </ul>
                        {team.grants.some(
                          (grant) => grant.day === day && grant.status === "ASSIGNED",
                        ) ? (
                          <OperationForm
                            context={context}
                            operation="deliver-powers"
                            hidden={{ day: String(day), teamId: team.id }}
                            className="mt-2"
                          >
                            <Submit>{t("T-3079", { dia: dayName(day) })}</Submit>
                          </OperationForm>
                        ) : null}
                      </td>
                    ))}
                    <td data-label={columns[3]} className="py-2 tabular-nums">
                      {team.delivered}/{team.dayOne + team.dayTwo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
        {board.teams.length > 0 ? (
          <details className="rounded-xl border border-borde p-4">
            <summary className="cursor-pointer font-semibold">{t("T-3083")}</summary>
            <OperationForm
              context={context}
              operation="add-power"
              className="mt-3 grid items-end gap-3 sm:grid-cols-3"
            >
              <Campo id="poder-equipo" label={fields[0] ?? ""}>
                <select id="poder-equipo" name="teamId" required className={inputClass}>
                  {board.teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.number} · {team.name}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="poder-tipo" label={fields[1] ?? ""}>
                <select id="poder-tipo" name="power" required className={inputClass}>
                  {POWER_TYPES.map((power) => (
                    <option key={power} value={power}>
                      {powerLabel(power)}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo id="poder-dia" label={fields[2] ?? ""}>
                <select id="poder-dia" name="day" required className={inputClass}>
                  {[1, 2].map((day) => (
                    <option key={day} value={day}>
                      {days[day - 1]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Casilla id="poder-entregada" name="delivered" label={t("T-3084")} />
              <Submit variant="primario">{t("T-3085")}</Submit>
            </OperationForm>
          </details>
        ) : null}
      </Section>

      <Section title={t("T-3087")}>
        {board.uses.length === 0 ? (
          <p>{t("T-3095")}</p>
        ) : (
          <table className="admin-data-table w-full text-left text-sm">
            <thead>
              <tr>
                {useColumns.map((column) => (
                  <th key={column} scope="col" className="py-2">
                    {column}
                  </th>
                ))}
                <th scope="col" className="py-2">
                  <span className="sr-only">{t("T-3089")}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {board.uses.map((use) => (
                <tr key={use.id} className="border-t border-borde align-top">
                  <td data-label={useColumns[0]} className="py-2">
                    {t("T-2837", { n: use.rotation, dia: use.day })}
                  </td>
                  <td data-label={useColumns[1]} className="py-2">
                    {use.base}
                  </td>
                  <td data-label={useColumns[2]} className="py-2">
                    {use.team.number} {use.team.name}
                  </td>
                  <td data-label={useColumns[3]} className="py-2">
                    <span className="inline-flex items-center gap-2">
                      <PowerMedal power={use.power} size={28} />
                      {powerLabel(use.power)}
                    </span>
                  </td>
                  <td data-label={useColumns[4]} className="py-2">
                    {formatTime(use.receivedAt)}
                  </td>
                  <td data-label={useColumns[5]} className="py-2">
                    {use.status === "REVERTED"
                      ? t("T-3091", { motivo: use.revertReason ?? "" })
                      : use.effect
                        ? effects[use.effect]
                        : "—"}
                  </td>
                  <td className="py-2">
                    {use.status === "ACTIVE" ? (
                      <details>
                        <summary className="cursor-pointer underline">{t("T-3089")}</summary>
                        <OperationForm
                          context={context}
                          operation="revert-power-use"
                          hidden={{ useId: use.id }}
                          className="mt-2 flex flex-col gap-2"
                        >
                          <p className="text-xs text-tinta-suave">{t("T-3090")}</p>
                          <Campo id={`revertir-${use.id}`} label={t("T-3082")}>
                            <input
                              id={`revertir-${use.id}`}
                              name="reason"
                              required
                              minLength={2}
                              maxLength={200}
                              className={inputClass}
                            />
                          </Campo>
                          <Submit>{t("T-3089")}</Submit>
                        </OperationForm>
                      </details>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        title={t("T-3092", {
          version: POWER_RULES.version,
          fecha: formatDate(new Date(`${POWER_RULES.confirmedOn}T17:00:00Z`)),
        })}
      >
        <ul className="flex max-w-prose list-disc flex-col gap-2 pl-5">
          {tList("T-3093").map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
