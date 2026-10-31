import type { Metadata } from "next";
import { single } from "@/app/_lib/search";
import { requireAdminActor } from "@/modules/identity";
import { peopleBoards, rankCommittees } from "@/modules/participation";
import { listCommitteesByIds } from "@/modules/people";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Numeral } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { ActionForm } from "@/shared/ui/ActionForm";
import { AppLink as Link } from "@/shared/ui/AppLink";

// Rankings del término para GH (ADR-008, ADR-024): tableros completos de nuevos, veteranos y comités.

export const metadata: Metadata = { title: tList("T-664")[0] ?? "" };

type Search = Record<string, string | string[] | undefined>;

export default async function RankingsPage({ searchParams }: PageProps<"/admin/rankings">) {
  await requireAdminActor("/admin/rankings");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const [tabNuevos, tabVeteranos, tabComites] = tList("T-083");
  const columns = tList("T-636");
  if (!term) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-635", { término: "" })}</h1>
        <p className="text-tinta-suave">{t("T-548")}</p>
      </div>
    );
  }
  // Los dos tableros de personas salen de una sola lectura de los activos (ADR-123 regla 12).
  const people = peopleBoards(term.id);
  const [nuevos, veteranos, comites] = await Promise.all([
    people.rank("NEW"),
    people.rank("VETERAN"),
    rankCommittees(term.id),
  ]);
  const committees = await listCommitteesByIds(comites.map((item) => item.row.committeeId));
  const committeeName = new Map(committees.map((item) => [item.id, item.name]));
  const termCode = new Map(terms.map((item) => [item.id, item.code]));
  const combinedCommittees = comites[0]?.row.rankingMetric === "COMBINED";
  const committeeColumns = tList(combinedCommittees ? "T-3573" : "T-543");
  const decimal = new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const percentage = new Intl.NumberFormat("es-CO", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const boards: Array<[string, typeof nuevos]> = [
    [tabNuevos ?? "", nuevos],
    [tabVeteranos ?? "", veteranos],
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-display-lg">{t("T-635", { término: term.code })}</h1>
        <ActionForm
          key={term.id}
          action="/admin/rankings"
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
      </header>

      {boards.map(([title, rows]) => (
        <section key={title} aria-label={title} className="flex flex-col gap-3">
          <h2 className="text-display-md">{title}</h2>
          {rows.length === 0 ? (
            <p className="text-tinta-suave">{t("T-542")}</p>
          ) : (
            <AdminTableRegion label={title} className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    {columns.map((label) => (
                      <th scope="col" key={label} className="eyebrow py-2 pr-4 text-xs">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <tr key={item.row.personId} className="border-borde border-t">
                      <td className="py-2 pr-4">
                        <Numeral valor={item.rank} className="text-display-md text-titulo" />
                      </td>
                      <td className="py-2 pr-4 font-semibold">
                        {item.row.anonymized ? (
                          t("T-223")
                        ) : (
                          <Link href={`/admin/personas/${item.row.personId}`}>{item.row.name}</Link>
                        )}
                      </td>
                      <td className="py-2 pr-4">{termCode.get(item.row.firstTermId) ?? ""}</td>
                      <td className="py-2 pr-4 tabular-nums">{item.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableRegion>
          )}
        </section>
      ))}

      <section aria-label={tabComites ?? ""} className="flex flex-col gap-3">
        <h2 className="text-display-md">{tabComites}</h2>
        {comites.length > 0 && (
          <p className="max-w-prose text-sm text-tinta-suave">
            {t(combinedCommittees ? "T-3566" : "T-3572")}
          </p>
        )}
        {comites.length === 0 ? (
          <p className="text-tinta-suave">{t("T-542")}</p>
        ) : (
          <AdminTableRegion label={tabComites ?? ""} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  <th scope="col" className="eyebrow py-2 pr-4 text-xs">
                    {columns[0]}
                  </th>
                  {committeeColumns.map((label) => (
                    <th scope="col" key={label} className="eyebrow py-2 pr-4 text-xs">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comites.map((item) => (
                  <tr key={item.row.committeeId} className="border-borde border-t">
                    <td className="py-2 pr-4">
                      <Numeral valor={item.rank} className="text-display-md text-titulo" />
                    </td>
                    <td className="py-2 pr-4 font-semibold">
                      {item.row.name ?? committeeName.get(item.row.committeeId) ?? ""}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      {item.row.rankingMetric === "COMBINED"
                        ? decimal.format(item.total / 100)
                        : percentage.format(item.total / 10_000)}
                    </td>
                    {combinedCommittees ? (
                      <>
                        <td className="py-2 pr-4 tabular-nums">
                          {item.row.ghAverage === null
                            ? t("T-3574")
                            : decimal.format(item.row.ghAverage)}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {item.row.activeMembers ?? t("T-3574")}
                        </td>
                        <td className="py-2 pr-4 tabular-nums">
                          {percentage.format(item.row.attendanceScore)}
                        </td>
                      </>
                    ) : (
                      <td className="py-2 pr-4 tabular-nums">
                        {percentage.format(item.row.rawScore)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableRegion>
        )}
      </section>
    </div>
  );
}
