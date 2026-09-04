import Link from "next/link";
import {
  CHECK_IN_SOURCES,
  CHECK_IN_STATUSES,
  type CheckInRow,
  type LedgerListRow,
  type OccasionRow,
  POINT_ENTRY_KINDS,
} from "@/modules/participation";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { Bloque } from "./campos";

// Pestaña Participación de la Persona 360 (02-crm.md, ADR-035): check-ins con ocasión, fuente y
// estado; ledger con ajustes y reversiones; ajustar puntos abre el panel del ledger del admin.

export function TabParticipacion({
  personId,
  checkIns,
  occasions,
  entries,
  termCodes,
}: {
  personId: string;
  checkIns: CheckInRow[];
  occasions: Map<string, OccasionRow>;
  entries: LedgerListRow[];
  termCodes: Map<string, string>;
}) {
  const [tituloCheckIns, tituloMovimientos] = tList("T-668") as [string, string];
  const statusLabels = tList("T-597");
  const sourceLabels = tList("T-596");
  const kindLabels = tList("T-085");
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="eyebrow py-2 pr-4 text-xs">{tList("T-562")[1]}</th>
                  <th className="eyebrow py-2 pr-4 text-xs">{columns[2]}</th>
                  <th className="eyebrow py-2 pr-4 text-xs">{columns[3]}</th>
                  <th className="eyebrow py-2 pr-4 text-xs">{columns[4]}</th>
                </tr>
              </thead>
              <tbody>
                {checkIns.map((item) => {
                  const occasion = occasions.get(item.occasionId);
                  return (
                    <tr key={item.id} className="border-borde border-t">
                      <td className="py-2 pr-4 font-semibold">
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
                      <td className="py-2 pr-4 whitespace-nowrap">{formatDateTime(item.at)}</td>
                      <td className="py-2 pr-4">
                        {sourceLabels[CHECK_IN_SOURCES.indexOf(item.source)] ?? item.source}
                      </td>
                      <td className="py-2 pr-4">
                        {statusLabels[CHECK_IN_STATUSES.indexOf(item.status)] ?? item.status}
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th className="eyebrow py-2 pr-4 text-xs">{ledgerColumns[0]}</th>
                  <th className="eyebrow py-2 pr-4 text-xs">{ledgerColumns[2]}</th>
                  <th className="eyebrow py-2 pr-4 text-xs">{ledgerColumns[3]}</th>
                  <th className="eyebrow py-2 pr-4 text-xs">{ledgerColumns[4]}</th>
                  <th className="eyebrow py-2 pr-4 text-xs">{ledgerColumns[5]}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-borde border-t">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="py-2 pr-4">{termCodes.get(entry.termId) ?? ""}</td>
                    <td className="py-2 pr-4">
                      {kindLabels[POINT_ENTRY_KINDS.indexOf(entry.kind)] ?? entry.kind}
                    </td>
                    <td
                      className={`py-2 pr-4 tabular-nums ${entry.points < 0 ? "text-oe-orange" : ""}`}
                    >
                      {entry.points > 0 ? `+${entry.points}` : entry.points}
                    </td>
                    <td className="py-2 pr-4">{entry.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloque>
    </div>
  );
}
