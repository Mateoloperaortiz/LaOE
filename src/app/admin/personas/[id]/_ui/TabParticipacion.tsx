import Link from "next/link";
import {
  type AchievementRow,
  type BadgeRow,
  BOOSTER_KINDS,
  BOOSTER_STATES,
  type BoosterView,
  CHECK_IN_SOURCES,
  CHECK_IN_STATUSES,
  type CheckInRow,
  type LedgerListRow,
  type OccasionRow,
  POINT_ENTRY_KINDS,
} from "@/modules/participation";
import { Bloque } from "@/shared/admin-kit/AdminFields";
import { t, tLabels, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

// Pestaña Participación de la Persona 360 (02-crm.md, ADR-035): check-ins con ocasión, fuente y
// estado; ledger con ajustes y reversiones; ajustar puntos abre el panel del ledger del admin.

export function TabParticipacion({
  personId,
  checkIns,
  occasions,
  entries,
  termCodes,
  achievements,
  boosters,
}: {
  personId: string;
  checkIns: CheckInRow[];
  occasions: Map<string, OccasionRow>;
  entries: LedgerListRow[];
  termCodes: Map<string, string>;
  achievements: Array<AchievementRow & { badge: BadgeRow }>;
  boosters: BoosterView[];
}) {
  const [tituloCheckIns, tituloMovimientos] = tList("T-668");
  const statusLabels = tLabels("T-597", CHECK_IN_STATUSES);
  const sourceLabels = tLabels("T-596", CHECK_IN_SOURCES);
  const kindLabels = tLabels("T-085", POINT_ENTRY_KINDS);
  const boosterKinds = tLabels("T-2451", BOOSTER_KINDS);
  const boosterStates = tLabels("T-2455", BOOSTER_STATES);
  const columns = tList("T-595");
  const ledgerColumns = tList("T-623");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/admin/ledger?personId=${personId}&accion=ajustar`}
          className="boton-primario min-h-9 px-4 py-1 text-sm"
        >
          {t("T-625")}
        </Link>
        <Link href={`/admin/ledger?personId=${personId}`} className="text-sm underline">
          {t("T-622")}
        </Link>
      </div>
      <Bloque titulo={tituloCheckIns}>
        {checkIns.length === 0 ? (
          <p className="text-tinta-suave">{t("T-669")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-data-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {tList("T-562")[1]}
                  </th>
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {columns[2]}
                  </th>
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {columns[3]}
                  </th>
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {columns[4]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {checkIns.map((item) => {
                  const occasion = occasions.get(item.occasionId);
                  return (
                    <tr key={item.id} className="border-borde border-t">
                      <td data-label={tList("T-562")[1]} className="py-2 pr-4 font-semibold">
                        {occasion ? (
                          <Link href={`/admin/ocasiones/${occasion.id}`}>{occasion.title}</Link>
                        ) : (
                          "—"
                        )}
                        {occasion ? (
                          <span className="text-tinta-suave">
                            {" "}
                            · {termCodes.get(occasion.termId) ?? ""}
                          </span>
                        ) : null}
                      </td>
                      <td data-label={columns[2]} className="py-2 pr-4 whitespace-nowrap">
                        {formatDateTime(item.at)}
                      </td>
                      <td data-label={columns[3]} className="py-2 pr-4">
                        {sourceLabels[item.source] ?? item.source}
                      </td>
                      <td data-label={columns[4]} className="py-2 pr-4">
                        {statusLabels[item.status] ?? item.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>
      <Bloque titulo={tituloMovimientos}>
        {entries.length === 0 ? (
          <p className="text-tinta-suave">{t("T-086")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="admin-data-table w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {ledgerColumns[0]}
                  </th>
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {ledgerColumns[2]}
                  </th>
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {ledgerColumns[3]}
                  </th>
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {ledgerColumns[4]}
                  </th>
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {ledgerColumns[5]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-borde border-t">
                    <td data-label={ledgerColumns[0]} className="py-2 pr-4 whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td data-label={ledgerColumns[2]} className="py-2 pr-4">
                      {termCodes.get(entry.termId) ?? ""}
                    </td>
                    <td data-label={ledgerColumns[3]} className="py-2 pr-4">
                      {kindLabels[entry.kind] ?? entry.kind}
                    </td>
                    <td
                      data-label={ledgerColumns[4]}
                      className={`py-2 pr-4 tabular-nums ${entry.points < 0 ? "text-oe-orange" : ""}`}
                    >
                      {entry.points > 0 ? `+${entry.points}` : entry.points}
                    </td>
                    <td data-label={ledgerColumns[5]} className="py-2 pr-4">
                      {entry.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>
      {achievements.length > 0 || boosters.length > 0 ? (
        <Bloque titulo={tList("T-2404")[4] ?? ""}>
          <ul className="flex list-none flex-col gap-2 p-0 text-sm">
            {achievements.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.badge.name}</span>
                <span className="tabular-nums">{item.badge.level}</span>
                <span className="text-tinta-suave">{formatDateTime(item.unlockedAt)}</span>
                {item.historical ? (
                  <span className="eyebrow text-xs">{tList("T-2571")[5]}</span>
                ) : null}
              </li>
            ))}
            {boosters.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{boosterKinds[item.kind] ?? item.kind}</span>
                <span>{boosterStates[item.state] ?? item.state}</span>
                <span className="text-tinta-suave">
                  {t("T-2456", { fecha: formatDateTime(item.expiresAt) })}
                </span>
              </li>
            ))}
          </ul>
        </Bloque>
      ) : null}
    </div>
  );
}
