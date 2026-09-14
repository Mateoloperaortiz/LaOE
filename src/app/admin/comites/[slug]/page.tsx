import type { Metadata } from "next";
import Link from "next/link";
import { listCommitteeAnnouncements } from "@/modules/content";
import { listEditionsByCommittee } from "@/modules/events";
import { getBudgetSummary, listCommitteeBudgets, listEventApprovals } from "@/modules/finance";
import {
  listCommitteeRepresentation,
  listCommitteeScores,
  listCommitteeViability,
  listOccasions,
  OCCASION_CATEGORIES,
  rankCommittees,
  surveySummaryForCommittee,
  VIABILITY_ALERTS,
} from "@/modules/participation";
import { occasionKindLabel, occasionStatusCell } from "@/modules/participation/admin";
import {
  areasFor,
  type CommitteeArea,
  listCommitteeRoles,
  listCommitteesMissingRequiredRoles,
  listInternalRoster,
  listRepresentatives,
  searchEligibleMembers,
} from "@/modules/people";
import { requireConfig } from "@/modules/system";
import { getCurrentTerm } from "@/modules/terms";
import { ResourcePanel } from "@/shared/admin-kit";
import { AdminFormBody } from "@/shared/admin-kit/AdminFormBody";
import { AdminSubmitButton } from "@/shared/admin-kit/AdminSubmitButton";
import { AdminTableRegion } from "@/shared/admin-kit/AdminTableRegion";
import { Insignia, LogoComite } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime, todayKey } from "@/shared/lib/dates";
import { requireCommitteeAccess } from "../_kit/capacidades";
import { Areas } from "./_ui/Areas";
import { Comunicacion } from "./_ui/Comunicacion";
import { Finanzas } from "./_ui/Finanzas";
import { Personas } from "./_ui/Personas";
import { createSeriesAction, proposeOccasionAction } from "./actions";

// Vista del comité por áreas (06-mapa-del-sitio.md, ADR-058): la ven ADMIN, el líder técnico y la
// dirección por sus cargos, cada uno con las pestañas de sus capacidades. Personas (roster y cargos),
// Actividades (score, ocasiones, encuestas y ediciones), Comunicación (cartelera interna y ficha),
// Aliados y Finanzas (llegan en fases siguientes). Nunca correos ni celulares.

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

export default async function ComitePage({
  params,
  searchParams,
}: PageProps<"/admin/comites/[slug]">) {
  const { slug } = await params;
  const search = (await searchParams) as Search;
  const base = `/admin/comites/${slug}`;
  const access = await requireCommitteeAccess(slug, base);
  const { roster, capabilities } = access;
  const term = roster.term ?? (await getCurrentTerm());
  const areas = areasFor(capabilities);
  const requested = single(search.area) as CommitteeArea;
  const area: CommitteeArea = areas.includes(requested) ? requested : (areas[0] ?? "personas");
  const accion = single(search.accion);
  const error = single(search.error);
  const guardado = single(search.guardado) === "1";
  const agregado = single(search.agregado);
  const pedido = single(search.pedido) === "1";
  const serie = single(search.serie);
  const hasta = single(search.hasta);
  const q = single(search.q).trim();
  const persona = single(search.persona);
  const canOperate = capabilities.has("OCCASIONS");
  const [tuComite] = tList("T-651");

  const missing = term
    ? ((await listCommitteesMissingRequiredRoles(term.id)).find(
        (row) => row.committee.id === roster.committee.id,
      )?.missing ?? [])
    : [];
  // Viabilidad (Regl. art. 25 y 26; ADR-060 regla 8): los avisos que no sean el de cargos obligatorios.
  const viability = term
    ? ((await listCommitteeViability(term.id)).find(
        (row) => row.committeeId === roster.committee.id,
      ) ?? null)
    : null;
  const viabilityLabels = tList("T-2264");

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
        {viability?.status === "ON_TRIAL" && viability.trialEndsOn ? (
          <Insignia fondo="sky">
            {t("T-2265", {
              fecha: formatDate(new Date(`${viability.trialEndsOn}T12:00:00Z`)),
            })}
          </Insignia>
        ) : null}
        {viability?.alerts.some((alert) => alert !== "MISSING_REQUIRED") ? (
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {viability.alerts
              .filter((alert) => alert !== "MISSING_REQUIRED")
              .map((alert) => (
                <li key={alert}>
                  <Insignia fondo="naranja">
                    {viabilityLabels[VIABILITY_ALERTS.indexOf(alert)] ?? alert}
                  </Insignia>
                </li>
              ))}
          </ul>
        ) : null}
        {missing.length > 0 ? (
          <ul className="flex list-none flex-wrap gap-2 p-0">
            {missing.map((role) => (
              <li key={role.roleCode}>
                <Insignia fondo="naranja">
                  {t("T-2175", { comité: roster.committee.name, cargo: role.roleLabel })}
                </Insignia>
              </li>
            ))}
          </ul>
        ) : null}
        {guardado ? (
          <output className="block font-semibold text-oe-blue">{t("T-259")}</output>
        ) : null}
        {agregado ? (
          <output className="block font-semibold text-oe-blue">
            {t("T-2161", { nombre: agregado })}
          </output>
        ) : null}
        {pedido ? (
          <output className="block font-semibold text-oe-blue">{t("T-2160")}</output>
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
      </header>

      <Areas base={base} active={area} areas={areas} />

      {area === "personas" ? (
        <Personas
          slug={slug}
          base={base}
          committeeName={roster.committee.name}
          members={roster.members}
          hasTerm={term !== null}
          isAdmin={access.isAdmin}
          canDirect={capabilities.has("DIRECTION")}
          canRoster={access.isAdmin || capabilities.has("ROSTER")}
          representatives={term ? await listRepresentatives(term.id, roster.committee.id) : []}
          representation={
            term
              ? ((await listCommitteeRepresentation(term.id)).find(
                  (row) => row.committeeId === roster.committee.id,
                ) ?? null)
              : null
          }
          actorPersonId={access.actor.personId}
          roles={await listCommitteeRoles()}
          max={await requireConfig("committees.max")}
          q={q}
          candidates={
            accion === "agregar" && q.length >= 2 && term
              ? await searchEligibleMembers(roster.committee.id, term.id, q)
              : []
          }
          accion={accion}
          persona={persona}
          error={error}
        />
      ) : null}

      {area === "actividades" ? (
        <Actividades
          base={base}
          slug={slug}
          committeeId={roster.committee.id}
          committeeName={roster.committee.name}
          termId={term?.id ?? null}
          canOperate={canOperate}
          canSeeEvents={capabilities.has("EVENTS")}
          accion={accion}
          error={error}
        />
      ) : null}

      {area === "comunicacion" ? (
        <Comunicacion
          slug={slug}
          base={base}
          committee={roster.committee}
          announcements={await listCommitteeAnnouncements(roster.committee.id, 12)}
          canBoard={capabilities.has("BOARD")}
          canProfile={capabilities.has("PROFILE")}
          accion={accion}
          error={error}
        />
      ) : null}

      {area === "aliados" ? (
        <section aria-label={tList("T-2174")[3] ?? ""} className="flex flex-col gap-2">
          <p className="max-w-prose text-lg">{t("T-2186")}</p>
          <p className="text-tinta-suave">{t("T-240")}</p>
        </section>
      ) : null}

      {area === "finanzas" ? (
        <FinanzasArea
          slug={slug}
          committeeId={access.roster.committee.id}
          guardado={single(search.guardado)}
        />
      ) : null}
    </div>
  );
}

/** Actividades: lo que ya veía el líder (score, ocasiones, encuestas) más las ediciones que organiza. */
async function Actividades({
  base,
  slug,
  committeeId,
  committeeName,
  termId,
  canOperate,
  canSeeEvents,
  accion,
  error,
}: {
  base: string;
  slug: string;
  committeeId: string;
  committeeName: string;
  termId: string | null;
  canOperate: boolean;
  canSeeEvents: boolean;
  accion: string;
  error: string;
}) {
  const closeHref = `${base}?area=actividades`;
  const [, , participacion, ocasionesTitulo] = tList("T-651");
  const [nuevaOcasion, crearSerie] = tList("T-652");
  const [serieTitulo, , serieHora, serieDuracion, serieLugar, seriePrimera] = tList("T-654");
  const scoreColumns = tList("T-657");
  const fieldLabels = tList("T-563");
  const categoryLabels = tList("T-566");
  const approvalLabels = tList("T-567");
  const [encActividad, encRespondieron, encPromedio] = tList("T-1168");
  const [occasions, scores, ranking, encuestas, editions] = await Promise.all([
    termId
      ? listOccasions({ q: "", termId, committeeId, page: 1, pageSize: 100 })
      : Promise.resolve({ rows: [], total: 0 }),
    termId ? listCommitteeScores(committeeId, termId) : Promise.resolve([]),
    termId ? rankCommittees(termId) : Promise.resolve([]),
    termId
      ? surveySummaryForCommittee(termId, committeeId)
      : Promise.resolve({ rows: [], answered: 0, average: null }),
    canSeeEvents ? listEditionsByCommittee(committeeId) : Promise.resolve([]),
  ]);
  const mine = ranking.find((item) => item.row.committeeId === committeeId);

  return (
    <div className="flex flex-col gap-8">
      {canOperate ? (
        <div className="flex flex-col gap-3">
          <p className="max-w-prose text-sm text-tinta-suave">{t("T-653")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href={`${closeHref}&accion=nueva`} className="boton-primario">
              {nuevaOcasion}
            </Link>
            <Link href={`${closeHref}&accion=serie`} className="boton-secundario">
              {crearSerie}
            </Link>
          </div>
        </div>
      ) : null}

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
          <AdminTableRegion label={committeeName} className="overflow-x-auto">
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
                    {canOperate ? (
                      <Link href={`/admin/ocasiones/${row.id}`} className="font-semibold">
                        {row.title}
                      </Link>
                    ) : (
                      <span className="font-semibold">{row.title}</span>
                    )}
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
              label={committeeName}
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
                        {canOperate ? (
                          <Link href={`/admin/ocasiones/${row.occasionId}`}>{row.title}</Link>
                        ) : (
                          row.title
                        )}
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

      {canSeeEvents ? (
        <section aria-label={t("T-2185")} className="flex flex-col gap-3">
          <h2 className="text-display-md">{t("T-2185")}</h2>
          {editions.length === 0 ? (
            <p className="text-tinta-suave">{t("T-256")}</p>
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {editions.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-borde bg-fondo px-4 py-2"
                >
                  <span className="font-semibold">
                    {row.eventName} · {row.name}
                  </span>
                  <span className="text-sm text-tinta-suave">{formatDate(row.startsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {canOperate && accion === "nueva" ? (
        <ResourcePanel title={nuevaOcasion ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
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
                <Link href={closeHref} className="boton-secundario">
                  {t("T-254")}
                </Link>
              </div>
            </AdminFormBody>
          </form>
        </ResourcePanel>
      ) : null}

      {canOperate && accion === "serie" ? (
        <ResourcePanel title={crearSerie ?? ""} closeHref={closeHref} closeLabel={t("T-291")}>
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
                <Link href={closeHref} className="boton-secundario">
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

/** Finanzas (ADR-059, ADR-060 regla 12): los presupuestos del año calendario en curso y los avales. */
async function FinanzasArea({
  slug,
  committeeId,
  guardado,
}: {
  slug: string;
  committeeId: string;
  guardado: string;
}) {
  const year = Number.parseInt(todayKey().slice(0, 4), 10);
  const [budgets, approvals, editions] = await Promise.all([
    listCommitteeBudgets(committeeId, year),
    listEventApprovals({ committeeId }),
    listEditionsByCommittee(committeeId),
  ]);
  const summaries = (
    await Promise.all(budgets.map((budget) => getBudgetSummary(budget.id)))
  ).flatMap((summary) => (summary ? [summary] : []));
  return (
    <Finanzas
      slug={slug}
      year={year}
      budgets={summaries}
      approvals={approvals}
      editions={editions.map((item) => ({
        id: item.id,
        label: `${item.eventName} · ${item.name}`,
      }))}
      guardado={guardado}
    />
  );
}
