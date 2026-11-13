import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { APPOINTMENT_KINDS } from "@/modules/people";
import { BOARD_COMMITTEE_STATES, boardComposition } from "@/modules/permanence";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { t, tLabels, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";
import { Badge } from "@/shared/ui/Badge";
import { Banner } from "@/shared/ui/Banner";
import { ScreenHeader } from "@/shared/ui/ScreenHeader";

// La junta del semestre y sus comités de trabajo (ADR-194): solo ADMIN, porque lleva nombres; el panel
// de la junta (`/admin/junta`) sigue siendo de agregados para BOARD (ADR-036 regla 12).

const [title] = tList("T-5078");
export const metadata: Metadata = { title };

const STATE_TONE = {
  OK: "exito",
  MISSING: "error",
  NO_LEADER: "aviso",
  OTHER_LEADER: "aviso",
} as const;

export default async function Page({ searchParams }: PageProps<"/admin/junta/composicion">) {
  await requireAdminActor("/admin/junta/composicion");
  const search = await searchParams;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const [heading, intro] = tList("T-5078");
  const [cargo, quien, comite, lidera, estado] = tList("T-5079");
  const states = tLabels("T-5080", BOARD_COMMITTEE_STATES);
  const [vacante, inactivo, unaCosa, variasCosas, alDia, sembrar] = tList("T-5081");
  const kinds = tLabels("T-444", APPOINTMENT_KINDS);
  if (!term) {
    return <ScreenHeader title={heading} description={t("T-827")} />;
  }
  const { seats, issues } = await boardComposition(term.id);
  const missing = seats.some((seat) => seat.committees.some((item) => item.state === "MISSING"));
  const cell = "py-2 pr-3 align-top";

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title={heading}
        description={intro}
        actions={
          <ActionForm
            key={term.id}
            action="/admin/junta/composicion"
            method="get"
            className="flex items-center gap-2 text-sm"
          >
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
          </ActionForm>
        }
      />
      {issues === 0 ? (
        <Banner tone="exito" title={alDia} />
      ) : (
        <Banner
          tone="aviso"
          title={issues === 1 ? unaCosa : (variasCosas ?? "").replace("{n}", String(issues))}
        >
          {missing ? (
            <Link href="/admin/permanencia/grupos" className="underline">
              {sembrar}
            </Link>
          ) : null}
        </Banner>
      )}
      <AdminTableRegion label={heading ?? ""} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              {[cargo, quien, comite, lidera, estado].map((column) => (
                <th scope="col" key={column} className="eyebrow py-2 pr-3 text-xs">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seats.map((seat) => {
              const [committee] = seat.committees;
              return (
                <tr key={seat.kind} className="border-borde border-t">
                  <th scope="row" className={`${cell} text-left font-semibold`}>
                    {kinds[seat.kind]}
                  </th>
                  <td className={cell}>
                    {seat.holders.length === 0 ? (
                      <Badge tone="error" className="whitespace-nowrap">
                        {vacante}
                      </Badge>
                    ) : (
                      <ul className="flex list-none flex-col gap-1 p-0">
                        {seat.holders.map((holder) => (
                          <li key={holder.personId} className="flex flex-wrap items-center gap-2">
                            <Link href={`/admin/personas/${holder.personId}`} className="underline">
                              {holder.name}
                            </Link>
                            {holder.operational ? null : (
                              <Badge tone="aviso" className="whitespace-nowrap">
                                {inactivo}
                              </Badge>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={cell}>
                    {committee ? (
                      committee.groupId ? (
                        <Link
                          href={`/admin/permanencia/grupos/${committee.groupId}`}
                          className="underline"
                        >
                          {committee.name} ({committee.code})
                        </Link>
                      ) : (
                        `${committee.name} (${committee.code})`
                      )
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cell}>
                    {committee?.leader ? (
                      <Link
                        href={`/admin/personas/${committee.leader.personId}`}
                        className="underline"
                      >
                        {committee.leader.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className={cell}>
                    {committee ? (
                      <Badge tone={STATE_TONE[committee.state]} className="whitespace-nowrap">
                        {states[committee.state]}
                      </Badge>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </AdminTableRegion>
    </div>
  );
}
