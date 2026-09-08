import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { hasPermission, requireAdminOrLeaderActor } from "@/modules/identity";
import {
  listCommitteeScores,
  listOccasions,
  OCCASION_CATEGORIES,
  rankCommittees,
  surveySummaryForCommittee,
} from "@/modules/participation";
import { occasionKindLabel, occasionStatusCell } from "@/modules/participation/admin";
import { listInternalRoster } from "@/modules/people";
import { getCurrentTerm } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia, LogoComite } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { createSeriesAction, proposeOccasionAction } from "./actions";

// Vista de líder de comité (06-mapa-del-sitio.md, ADR-035 regla 15): roster sin correos, score del
// comité, sus ocasiones, "Nueva ocasión" en borrador y la serie semanal de reuniones.

type Search = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const inputClass =
  "w-full rounded-xl border-2 border-borde bg-fondo px-3 py-2 text-tinta focus:border-titulo focus:outline-none";

export async function generateMetadata({
  params,
}: PageProps<"/admin/comites/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const roster = await listInternalRoster(slug);
  return { title: roster?.committee.name ?? "" };
}

export default async function ComiteLiderPage({
  params,
  searchParams,
}: PageProps<"/admin/comites/[slug]">) {
  const { slug } = await params;
  const search = (await searchParams) as Search;
  const base = `/admin/comites/${slug}`;
  const actor = await requireAdminOrLeaderActor(base);
  const roster = await listInternalRoster(slug);
  if (!roster) {
    notFound();
  }
  if (!actor.isAdmin && !hasPermission(actor, "COMMITTEE_LEADER", roster.committee.id)) {
    redirect("/app");
  }
  const accion = single(search.accion);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const serie = single(search.serie);
  const hasta = single(search.hasta);
  const term = roster.term ?? (await getCurrentTerm());
  const encuestas = term
    ? await surveySummaryForCommittee(term.id, roster.committee.id)
    : { rows: [], answered: 0, average: null };
  const [encActividad, encRespondieron, encPromedio] = tList("T-1168");
  const [occasions, scores, ranking] = await Promise.all([
    term
      ? listOccasions({
          q: "",
          termId: term.id,
          committeeId: roster.committee.id,
          page: 1,
          pageSize: 100,
        })
      : Promise.resolve({ rows: [], total: 0 }),
    term ? listCommitteeScores(roster.committee.id, term.id) : Promise.resolve([]),
    term ? rankCommittees(term.id) : Promise.resolve([]),
  ]);
  const mine = ranking.find((item) => item.row.committeeId === roster.committee.id);
  const [tuComite, rosterTitulo, participacion, ocasionesTitulo] = tList("T-651");
  const [nuevaOcasion, crearSerie] = tList("T-652");
  const [serieTitulo, , serieHora, serieDuracion, serieLugar, seriePrimera] = tList("T-654");
  const scoreColumns = tList("T-657");
  const fieldLabels = tList("T-563");
  const categoryLabels = tList("T-566");
  const approvalLabels = tList("T-567");

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-4">
          <LogoComite slug={roster.committee.slug} name={roster.committee.name} size={64} />
          <div className="flex flex-col">
            <span className="eyebrow">{tuComite}</span>
            <h1 className="text-display-lg">{roster.committee.name}</h1>
          </div>
        </div>
        {term ? <p className="text-tinta-suave">{term.code}</p> : null}
        {guardado ? (
          <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
        ) : null}
        {serie ? (
          <output className="block font-semibold text-oe-blue">
            {t("T-655", { n: serie, fecha: hasta ? formatDate(new Date(hasta)) : "" })}
          </output>
        ) : null}
        {error && !accion ? (
          <p role="alert" className="font-semibold text-oe-orange">
            {error}
          </p>
        ) : null}
        <p className="max-w-prose text-sm text-tinta-suave">{t("T-653")}</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`${base}?accion=nueva`} className="boton-primario">
            {nuevaOcasion}
          </Link>
          <Link href={`${base}?accion=serie`} className="boton-secundario">
            {crearSerie}
          </Link>
        </div>
      </header>

      <section aria-label={participacion} className="flex flex-col gap-3">
        <h2 className="text-display-md">{participacion}</h2>
        {mine ? (
          <p className="font-semibold">
            {Math.round(mine.row.score * 100)} % · {tList("T-543")[2]}:{" "}
            {Math.round(mine.row.rawScore * 100)} %
          </p>
        ) : null}
        {scores.length === 0 ? (
          <p className="text-tinta-suave">{t("T-606")}</p>
        ) : (
          <AdminTableRegion label={roster.committee.name} className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left">
                  {scoreColumns.map((label) => (
                    <th scope="col" key={label} className="eyebrow py-2 pr-4 text-xs">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scores.map((row) => (
                  <tr key={row.id} className="border-borde border-t">
                    <td className="py-2 pr-4 font-semibold">
                      <Link href={`/admin/ocasiones/${row.occasionId}`}>{row.occasionTitle}</Link>
                    </td>
                    <td className="py-2 pr-4">{formatDateTime(row.occasionStartsAt)}</td>
                    <td className="py-2 pr-4">{row.present}</td>
                    <td className="py-2 pr-4">{row.eligible}</td>
                    <td className="py-2 pr-4">{Math.round(row.rate * 100)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminTableRegion>
        )}
      </section>

      <section aria-label={ocasionesTitulo} className="flex flex-col gap-3">
        <h2 className="text-display-md">{ocasionesTitulo}</h2>
        {occasions.rows.length === 0 ? (
          <p className="text-tinta-suave">{t("T-256")}</p>
        ) : (
          <ul className="flex list-none flex-col gap-2 p-0">
            {occasions.rows.map((row) => {
              const cell = occasionStatusCell(row.status);
              return (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-borde bg-fondo px-4 py-2"
                >
                  <span className="flex flex-col">
                    <Link href={`/admin/ocasiones/${row.id}`} className="font-semibold">
                      {row.title}
                    </Link>
                    <span className="text-sm text-tinta-suave">
                      {occasionKindLabel(row)} · {formatDateTime(row.startsAt)} · {row.points} GH
                      Points
                    </span>
                  </span>
                  <Insignia fondo={cell.badge}>{cell.text}</Insignia>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label={t("T-1167")} className="flex flex-col gap-3">
        <h2 className="text-display-md">{t("T-1167")}</h2>
        {encuestas.rows.length === 0 ? (
          <p className="text-tinta-suave">{t("T-1170")}</p>
        ) : (
          <>
            <p className="font-semibold">
              {t("T-1169", {
                promedio: encuestas.average === null ? "—" : encuestas.average.toFixed(1),
                n: encuestas.answered,
              })}
            </p>
            <AdminTableRegion
              label={roster.committee.name}
              className="overflow-x-auto rounded-[var(--radius-cartel)] border border-borde"
            >
              <table className="w-full text-left text-sm">
                <thead className="eyebrow bg-fondo-suave text-xs">
                  <tr>
                    <th scope="col" className="px-3 py-2">
                      {encActividad}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {encRespondieron}
                    </th>
                    <th scope="col" className="px-3 py-2">
                      {encPromedio}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {encuestas.rows.map((row) => (
                    <tr key={row.occasionId} className="border-t border-borde">
                      <td className="px-3 py-2 font-semibold">
                        <Link href={`/admin/ocasiones/${row.occasionId}`}>{row.title}</Link>
                        <span className="block text-xs text-tinta-suave">
                          {formatDate(row.startsAt)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {row.answered} / {row.invited}
                      </td>
                      <td className="px-3 py-2">
                        {row.average === null ? "—" : row.average.toFixed(1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </AdminTableRegion>
          </>
        )}
      </section>

      <section aria-label={rosterTitulo} className="flex flex-col gap-3">
        <h2 className="text-display-md">{rosterTitulo}</h2>
        {roster.members.length === 0 ? (
          <p className="text-tinta-suave">{t("T-384")}</p>
        ) : (
          <ul className="grid list-none gap-2 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {roster.members.map((member) => (
              <li
                key={member.personId}
                className="flex items-center justify-between gap-3 rounded-xl border border-borde bg-fondo px-4 py-2"
              >
                <span className="font-semibold">{member.fullName.trim()}</span>
                <span className="text-sm text-tinta-suave">{member.roleLabel}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {accion === "nueva" ? (
        <ResourcePanel title={nuevaOcasion ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <form action={proposeOccasionAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="slug" value={slug} />
              {error ? (
                <p role="alert" className="font-semibold text-oe-orange">
                  {error}
                </p>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fieldLabels[0]}</span>
                <input name="title" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fieldLabels[3]}</span>
                <select name="category" defaultValue="OTHER" className={inputClass}>
                  {OCCASION_CATEGORIES.map((value, index) => (
                    <option key={value} value={value}>
                      {categoryLabels[index] ?? value}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fieldLabels[7]}</span>
                <input name="startsAt" type="datetime-local" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fieldLabels[8]}</span>
                <input name="endsAt" type="datetime-local" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fieldLabels[6]}</span>
                <input name="location" className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fieldLabels[11]}</span>
                <input
                  name="points"
                  type="number"
                  min={0}
                  defaultValue={0}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fieldLabels[12]}</span>
                <select name="approval" defaultValue="AUTO" className={inputClass}>
                  <option value="AUTO">{approvalLabels[0]}</option>
                  <option value="MANUAL">{approvalLabels[1]}</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{fieldLabels[5]}</span>
                <textarea name="description" rows={4} className={inputClass} />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-primario">
                  {t("T-253")}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {accion === "serie" ? (
        <ResourcePanel title={crearSerie ?? ""} closeHref={base} closeLabel={t("T-291")}>
          <form action={createSeriesAction} className="flex flex-col gap-4">
            <AdminFormBody>
              <input type="hidden" name="slug" value={slug} />
              {error ? (
                <p role="alert" className="font-semibold text-oe-orange">
                  {error}
                </p>
              ) : null}
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{serieTitulo}</span>
                <input name="title" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{seriePrimera}</span>
                <input name="firstDate" type="date" required className={inputClass} />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{serieHora}</span>
                <input
                  name="time"
                  type="time"
                  required
                  defaultValue="18:00"
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{serieDuracion}</span>
                <input
                  name="durationMinutes"
                  type="number"
                  min={15}
                  max={600}
                  defaultValue={90}
                  className={inputClass}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="eyebrow text-xs">{serieLugar}</span>
                <input name="location" className={inputClass} />
              </label>
              <div className="flex items-center gap-3">
                <AdminSubmitButton type="submit" className="boton-primario">
                  {crearSerie}
                </AdminSubmitButton>
                <Link href={base} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}
    </div>
  );
}
