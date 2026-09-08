import type { Metadata } from "next";
import { requireBoardActor } from "@/modules/identity";
import { boardIndicators } from "@/modules/permanence";
import { getCurrentTerm, listAllTerms } from "@/modules/terms";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";

// Panel de la junta (ADR-036 regla 12): ADMIN o BOARD ven agregados del término sin nombres ni
// correos; el CSV sale por `/api/export/junta` sin step-up porque no lleva datos personales.

export const metadata: Metadata = { title: t("T-821") };

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value} %`;
}

const cellClass = "py-2 pr-3 tabular-nums";

export default async function JuntaPage({ searchParams }: PageProps<"/admin/junta">) {
  await requireBoardActor("/admin/junta");
  const search = (await searchParams) as Search;
  const [terms, current] = await Promise.all([listAllTerms(), getCurrentTerm()]);
  const term = terms.find((item) => item.id === single(search.termId)) ?? current ?? terms[0];
  const cardLabels = tList("T-823");
  const sectionLabels = tList("T-824");
  const retentionColumns = tList("T-825");
  const committeeColumns = tList("T-828");
  const [integraciones, asambleas] = [cardLabels[7] ?? "", cardLabels[8] ?? ""];
  const data = term ? await boardIndicators(term.id) : null;
  if (!term || !data) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="text-display-lg">{t("T-821")}</h1>
        <p className="text-tinta-suave">{t("T-827")}</p>
      </div>
    );
  }
  const cards: Array<[string, string]> = [
    [cardLabels[0] ?? "", String(data.cards.active)],
    [cardLabels[1] ?? "", String(data.cards.newcomers)],
    [cardLabels[2] ?? "", pct(data.cards.retention)],
    [cardLabels[3] ?? "", String(data.cards.enCamino)],
    [cardLabels[4] ?? "", String(data.cards.enRiesgo)],
    [cardLabels[5] ?? "", String(data.cards.noAlcanza)],
    [cardLabels[6] ?? "", pct(data.cards.meetingAttendance)],
    [integraciones, String(data.cards.integrations)],
    [asambleas, String(data.cards.assemblies)],
  ];
  const empty =
    data.retention.every((row) => row.withCommittee === 0) && data.committees.length === 0;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-display-lg">{t("T-821")}</h1>
          <p className="text-tinta-suave">{t("T-822")}</p>
          {data.computedAt ? (
            <p className="text-sm text-tinta-suave">
              {t("T-796", { fecha: formatDateTime(data.computedAt) })}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form action="/admin/junta" method="get" className="flex items-center gap-2 text-sm">
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
          </form>
          <a
            href={`/api/export/junta?termId=${term.id}`}
            className="boton-secundario min-h-8 px-3 py-1 text-sm"
          >
            {t("T-255")}
          </a>
        </div>
      </header>

      {empty ? <p className="text-tinta-suave">{t("T-827")}</p> : null}

      <dl className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
          >
            <dt className="eyebrow text-xs">{label}</dt>
            <dd className="font-display text-display-lg leading-none">{value}</dd>
          </div>
        ))}
      </dl>

      <section aria-labelledby="retencion" className="flex flex-col gap-3">
        <h2 id="retencion" className="text-display-md">
          {sectionLabels[0]}
        </h2>
        <p className="text-sm text-tinta-suave">{t("T-826")}</p>
        <AdminTableRegion label={sectionLabels[0] ?? t("T-821")} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {retentionColumns.map((column) => (
                  <th scope="col" key={column} className="eyebrow py-2 pr-3 text-xs">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.retention.map((row) => (
                <tr key={row.termCode} className="border-borde border-t">
                  <td className="py-2 pr-3 font-semibold">{row.termCode}</td>
                  <td className={cellClass}>{row.withCommittee}</td>
                  <td className={cellClass}>{row.continued ?? "—"}</td>
                  <td className={cellClass}>{pct(row.retention)}</td>
                  <td className={cellClass}>{row.newcomers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableRegion>
      </section>

      <section aria-labelledby="nuevos" className="flex flex-col gap-3">
        <h2 id="nuevos" className="text-display-md">
          {sectionLabels[1]}
        </h2>
        {data.committees.length === 0 ? (
          <p className="text-tinta-suave">{t("T-827")}</p>
        ) : (
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {data.committees.map((item) => (
              <li
                key={item.committeeId}
                className="rounded-xl border border-borde bg-fondo px-3 py-2 text-sm"
              >
                <span className="font-semibold">{item.committeeName}</span>{" "}
                <span className="tabular-nums">{item.newcomers}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="comites" className="flex flex-col gap-3">
        <h2 id="comites" className="text-display-md">
          {sectionLabels[2]} · {sectionLabels[3]}
        </h2>
        <AdminTableRegion label={sectionLabels[2] ?? t("T-821")} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                {committeeColumns.map((column) => (
                  <th scope="col" key={column} className="eyebrow py-2 pr-3 text-xs">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.committees.map((item) => (
                <tr key={item.committeeId} className="border-borde border-t">
                  <td className="py-2 pr-3 font-semibold">{item.committeeName}</td>
                  <td className={cellClass}>{item.members}</td>
                  <td className={cellClass}>{item.enCamino}</td>
                  <td className={cellClass}>{item.enRiesgo}</td>
                  <td className={cellClass}>{item.noAlcanza}</td>
                  <td className={cellClass}>{item.meetings}</td>
                  <td className={cellClass}>{pct(item.attendance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </AdminTableRegion>
      </section>

      <section aria-labelledby="ocasiones" className="flex flex-col gap-3">
        <h2 id="ocasiones" className="text-display-md">
          {sectionLabels[4]}
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          {(
            [
              [integraciones, data.integrations],
              [asambleas, data.assemblies],
            ] as const
          ).map(([label, item]) => (
            <div
              key={label}
              className="flex flex-col gap-1 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-4"
            >
              <dt className="eyebrow text-xs">{label}</dt>
              <dd className="flex flex-wrap gap-4 tabular-nums">
                <span>
                  <span className="font-display text-display-md leading-none">{item.held}</span>{" "}
                  <span className="text-sm text-tinta-suave">{t("T-848")}</span>
                </span>
                <span>
                  <span className="font-display text-display-md leading-none">{item.checkIns}</span>{" "}
                  <span className="text-sm text-tinta-suave">{t("T-849")}</span>
                </span>
                <span>
                  <span className="font-display text-display-md leading-none">
                    {item.average ?? "—"}
                  </span>{" "}
                  <span className="text-sm text-tinta-suave">{t("T-850")}</span>
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
