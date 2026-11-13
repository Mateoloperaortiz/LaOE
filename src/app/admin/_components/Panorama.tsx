import type { AdminAreaRoles } from "@/app/_authz/admin-area";
import { getCampaignQuotaStatus, listActiveCampaigns } from "@/modules/comms";
import { listOccasionsBetween, listPendingReviews } from "@/modules/participation";
import { listCommitteesMissingRequiredRoles } from "@/modules/people";
import { boardIndicators, countPendingFor } from "@/modules/permanence";
import { Numeral } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDateTime } from "@/shared/lib/dates";
import { AppLink as Link } from "@/shared/ui/AppLink";

// Los panoramas por rol (ADR-169 regla 2): un bloque por cada rol del actor, con numerales grandes en
// la letra condensada. Son agregados sin nombres, salvo la dirección de un comité, que ya ve a su gente.

const DAY_MS = 86_400_000;

type Term = { id: string; code: string };

export function panoramaRoles(roles: AdminAreaRoles) {
  // Las campañas son de ADMIN: la vicepresidencia de comunicaciones es un cargo de la junta y todavía
  // no tiene acceso propio a ellas.
  const comms = roles.isAdmin;
  const directed = roles.committees.filter((item) => item.capabilities.length > 0);
  return {
    board: roles.isAdmin || roles.isBoard,
    gh: roles.isAdmin,
    committees: roles.isAdmin ? [] : directed,
    comms,
  };
}

/** Si el actor tiene algún bloque en el Panorama. */
export function hasPanorama(roles: AdminAreaRoles): boolean {
  const which = panoramaRoles(roles);
  return which.board || which.gh || which.committees.length > 0 || which.comms;
}

function Cifra({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <>
      <Numeral valor={value} className="panorama-cifra-valor" />
      <span className="panorama-cifra-label">
        <span className="sr-only">{value} </span>
        {label}
      </span>
    </>
  );
  return (
    <li className="panorama-cifra">
      {href ? (
        <Link href={href} className="panorama-cifra-enlace">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

function pct(value: number | null): string {
  return value === null ? "—" : `${value} %`;
}

export async function Panorama({ roles, term }: { roles: AdminAreaRoles; term: Term | null }) {
  const which = panoramaRoles(roles);
  const now = new Date();
  const [board, missing, upcoming, reviews, evaluations, campaigns, quota] = await Promise.all([
    term && (which.board || which.gh || which.committees.length > 0)
      ? boardIndicators(term.id, now)
      : null,
    term && which.board ? listCommitteesMissingRequiredRoles(term.id) : [],
    which.board || which.committees.length > 0
      ? listOccasionsBetween(now, new Date(now.getTime() + 30 * DAY_MS))
      : [],
    term && which.gh ? listPendingReviews(term.id) : [],
    term && which.gh ? countPendingFor(roles.actor.personId, term.id) : 0,
    which.comms ? listActiveCampaigns() : [],
    which.comms ? getCampaignQuotaStatus(now) : null,
  ]);
  const [juntaTitulo, ghTitulo, comiteTitulo, commsTitulo] = tList("T-4922");
  const juntaCifras = tList("T-4923");
  const [ghRiesgo, ghEvaluaciones, ghEvidencias] = tList("T-4924");
  const [comiteMiembros, comiteAsistencia, comiteRiesgo, comiteProximas, comiteSinProximas] =
    tList("T-4925");
  const [commsCampanas, commsCupo, commsSinCupo, commsSinCampanas] = tList("T-4926");
  const [salud, comiteCol, miembrosCol, asistenciaCol, riesgoCol, cargosCol, proximasAsambleas] =
    tList("T-4927");
  const missingBy = new Map(missing.map((row) => [row.committee.id, row.missing.length]));
  const assemblies = upcoming.filter((row) => row.kind === "ASSEMBLY");
  const atRisk = [...(board?.committees ?? [])]
    .filter((row) => row.enRiesgo + row.noAlcanza > 0)
    .sort((a, b) => b.enRiesgo + b.noAlcanza - (a.enRiesgo + a.noAlcanza))
    .slice(0, 5);

  return (
    <div className="panorama flex flex-col gap-6">
      {which.board && board ? (
        <section aria-labelledby="panorama-junta" className="panorama-bloque">
          <h2 id="panorama-junta" className="panorama-titulo">
            {juntaTitulo}
          </h2>
          <ul className="panorama-cifras">
            <Cifra label={juntaCifras[0] ?? ""} value={board.cards.active} href="/admin/junta" />
            <Cifra label={juntaCifras[1] ?? ""} value={board.cards.newcomers} />
            <Cifra
              label={juntaCifras[2] ?? ""}
              value={board.cards.enRiesgo + board.cards.noAlcanza}
            />
            <Cifra label={juntaCifras[3] ?? ""} value={pct(board.cards.meetingAttendance)} />
          </ul>
          {board.committees.length > 0 ? (
            <div className="admin-table-region overflow-x-auto">
              <table className="admin-data-table w-full text-sm">
                <caption className="etiqueta-corta text-left text-tinta-secundaria">
                  {salud}
                </caption>
                <thead>
                  <tr className="text-left">
                    {[comiteCol, miembrosCol, asistenciaCol, riesgoCol, cargosCol].map((label) => (
                      <th key={label} scope="col" className="py-2 pr-3 text-xs">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {board.committees.map((row) => (
                    <tr key={row.committeeId} className="border-t border-borde">
                      <td className="py-2 pr-3 font-semibold">{row.committeeName}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.members}</td>
                      <td className="py-2 pr-3 tabular-nums">{pct(row.attendance)}</td>
                      <td className="py-2 pr-3 tabular-nums">{row.enRiesgo + row.noAlcanza}</td>
                      <td className="py-2 pr-3 tabular-nums">
                        {missingBy.get(row.committeeId) ?? 0}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {assemblies.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="etiqueta-corta text-tinta-secundaria">{proximasAsambleas}</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0">
                {assemblies.map((row) => (
                  <li key={row.id}>
                    <Link href={`/admin/ocasiones/${row.id}`} className="font-semibold">
                      {row.title}
                    </Link>{" "}
                    <span className="text-sm text-tinta-secundaria">
                      {formatDateTime(row.startsAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {which.gh ? (
        <section aria-labelledby="panorama-gh" className="panorama-bloque">
          <h2 id="panorama-gh" className="panorama-titulo">
            {ghTitulo}
          </h2>
          <ul className="panorama-cifras">
            <Cifra
              label={ghRiesgo ?? ""}
              value={board ? board.cards.enRiesgo + board.cards.noAlcanza : 0}
              href="/admin/permanencia/cumplimiento"
            />
            <Cifra
              label={ghEvaluaciones ?? ""}
              value={evaluations}
              href="/admin/permanencia/evaluaciones"
            />
            <Cifra
              label={ghEvidencias ?? ""}
              value={reviews.length}
              href="/admin/gamificacion/revision"
            />
          </ul>
          {atRisk.length > 0 ? (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
              {atRisk.map((row) => (
                <li key={row.committeeId} className="flex justify-between gap-3">
                  <span className="font-semibold">{row.committeeName}</span>
                  <span className="tabular-nums">{row.enRiesgo + row.noAlcanza}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {which.committees.map((item) => {
        const row = board?.committees.find((entry) => entry.committeeId === item.committee.id);
        const next = upcoming
          .filter((entry) => entry.committeeId === item.committee.id)
          .filter((entry) => entry.startsAt.getTime() - now.getTime() < 14 * DAY_MS)
          .slice(0, 5);
        const id = `panorama-comite-${item.committee.slug}`;
        return (
          <section key={item.committee.id} aria-labelledby={id} className="panorama-bloque">
            <h2 id={id} className="panorama-titulo">
              {t("T-4928", { comité: item.committee.name, rol: comiteTitulo ?? "" })}
            </h2>
            <ul className="panorama-cifras">
              <Cifra
                label={comiteMiembros ?? ""}
                value={row?.members ?? 0}
                href={`/admin/comites/${item.committee.slug}`}
              />
              <Cifra label={comiteAsistencia ?? ""} value={pct(row?.attendance ?? null)} />
              <Cifra
                label={comiteRiesgo ?? ""}
                value={row ? row.enRiesgo + row.noAlcanza : 0}
                href={`/admin/comites/${item.committee.slug}/permanencia`}
              />
            </ul>
            <div className="flex flex-col gap-2">
              <h3 className="etiqueta-corta text-tinta-secundaria">{comiteProximas}</h3>
              {next.length === 0 ? (
                <p className="text-sm text-tinta-secundaria">{comiteSinProximas}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {next.map((entry) => (
                    <li key={entry.id}>
                      <Link href={`/admin/ocasiones/${entry.id}`} className="font-semibold">
                        {entry.title}
                      </Link>{" "}
                      <span className="text-sm text-tinta-secundaria">
                        {formatDateTime(entry.startsAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        );
      })}

      {which.comms ? (
        <section aria-labelledby="panorama-comms" className="panorama-bloque">
          <h2 id="panorama-comms" className="panorama-titulo">
            {commsTitulo}
          </h2>
          <ul className="panorama-cifras">
            <Cifra label={commsCampanas ?? ""} value={campaigns.length} href="/admin/campanas" />
            <Cifra
              label={quota?.daily ? (commsCupo ?? "") : (commsSinCupo ?? "")}
              value={
                quota?.daily
                  ? Math.max(0, quota.daily.ceiling - quota.daily.sentToday - quota.daily.claimed)
                  : "—"
              }
            />
          </ul>
          {campaigns.length === 0 ? (
            <p className="text-sm text-tinta-secundaria">{commsSinCampanas}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0">
              {campaigns.map((row) => (
                <li key={row.id}>
                  <Link href={`/admin/campanas/${row.id}`} className="font-semibold">
                    {row.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
