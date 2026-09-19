import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { listActiveCampaigns } from "@/modules/comms";
import { campaignStatusLabel } from "@/modules/comms/admin";
import { dashboardForAdmin, type TaskRow } from "@/modules/crm";
import { recentSubmissionCounts } from "@/modules/forms";
import { listCommitteeViability, listOccasions, VIABILITY_ALERTS } from "@/modules/participation";
import { listCommitteesMissingRequiredRoles } from "@/modules/people";
import { listGroupRefs } from "@/modules/permanence";
import { countDeadLetters, getBackupStatus } from "@/modules/system";
import { getCurrentTerm } from "@/modules/terms";
import { Insignia } from "@/shared/brand";
import { t, tList } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";
import { requireAdminAreaRoles } from "./_kit/acceso";

// Inicio del admin (ADR-037 regla 11): las secciones de T-160 y el tablero de pendientes de ADMIN
// (tareas propias, vencidas del equipo, solicitudes, respuestas de la semana, pipelines, convocatorias,
// ocasiones abiertas y alertas de sistema). Quien no es ADMIN entra derecho a lo suyo.

const OCCASION_ROWS = 6;

function taskHref(row: TaskRow): string {
  if (row.kind === "REQUEST") {
    return `/admin/solicitudes?tarea=${row.id}`;
  }
  if (row.personId) {
    return `/admin/personas/${row.personId}`;
  }
  if (row.organizationId) {
    return `/admin/organizaciones/${row.organizationId}`;
  }
  return "/admin/tareas";
}

function Bloque({
  id,
  titulo,
  href,
  children,
}: {
  id: string;
  titulo: string;
  href: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-[var(--radius-cartel)] border border-borde bg-fondo p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={id} className="text-titulo-md">
          {titulo}
        </h2>
        <Link href={href} className="text-sm underline">
          {t("T-1041")}
        </Link>
      </div>
      {children}
    </section>
  );
}

function Vacio({ texto }: { texto: string }) {
  return <p className="text-tinta-suave">{texto}</p>;
}

function Tareas({ rows, conResponsable }: { rows: TaskRow[]; conResponsable: boolean }) {
  return (
    <ul className="flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <Link href={taskHref(row)} className="font-semibold">
            {row.title}
          </Link>
          <span className="text-sm text-tinta-suave">
            {[
              conResponsable ? row.assigneeName : (row.personName ?? row.organizationName),
              row.dueAt ? formatDate(row.dueAt) : null,
            ]
              .filter((item) => item)
              .join(" · ")}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function AdminHome() {
  const roles = await requireAdminAreaRoles("/admin");
  if (!roles.isAdmin) {
    // Quien no es ADMIN entra derecho a lo suyo (ADR-035 regla 15, ADR-036 regla 10).
    const committee = roles.committees[0]?.committee;
    const group = roles.ledGroups[0];
    redirect(
      committee
        ? `/admin/comites/${committee.slug}`
        : group
          ? `/admin/permanencia/grupos/${group.id}`
          : roles.evaluatedGroups.length > 0
            ? "/admin/permanencia/evaluaciones"
            : roles.isBoard
              ? "/admin/junta"
              : "/app",
    );
  }
  const term = await getCurrentTerm();
  const [tablero, respuestas, ocasiones, deadLetters, backup, campanas, sinCargos, viabilidad] =
    await Promise.all([
      dashboardForAdmin(roles.actor.personId, term?.id ?? null),
      recentSubmissionCounts(7),
      term
        ? listOccasions({
            q: "",
            termId: term.id,
            status: "OPEN",
            order: "asc",
            page: 1,
            pageSize: OCCASION_ROWS,
          })
        : Promise.resolve({ rows: [], total: 0 }),
      countDeadLetters(),
      getBackupStatus(),
      listActiveCampaigns(),
      term ? listCommitteesMissingRequiredRoles(term.id) : Promise.resolve([]),
      term ? listCommitteeViability(term.id) : Promise.resolve([]),
    ]);
  const viabilityLabels = tList("T-2264");
  const grupos = await listGroupRefs(tablero.openCalls.map((call) => call.groupId));
  const [bPendientes, bVencidas, bSolicitudes, bRespuestas, bPipelines, bConvocatorias, bSistema] =
    tList("T-1033");
  const [conCopia, sinCopias] = tList("T-1040");

  return (
    <div className="admin-dashboard flex flex-col gap-6">
      <header className="admin-page-header">
        <div>
          <p className="text-sm text-tinta-suave">{t("T-1410")}</p>
          <h1>{t("T-236")}</h1>
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <Bloque id="pendientes" titulo={bPendientes} href="/admin/tareas?status=OPEN&assignee=mine">
          {tablero.myTasks.rows.length === 0 ? (
            <Vacio texto={t("T-1034")} />
          ) : (
            <Tareas rows={tablero.myTasks.rows} conResponsable={false} />
          )}
        </Bloque>

        <Bloque id="vencidas" titulo={bVencidas} href="/admin/tareas?status=OPEN">
          {tablero.overdueTasks.rows.length === 0 ? (
            <Vacio texto={t("T-1035")} />
          ) : (
            <Tareas rows={tablero.overdueTasks.rows} conResponsable />
          )}
        </Bloque>

        <Bloque id="solicitudes" titulo={bSolicitudes} href="/admin/solicitudes">
          <p className="text-display-md">{t("T-1043", { n: tablero.pendingRequests })}</p>
        </Bloque>

        <Bloque id="respuestas" titulo={bRespuestas} href="/admin/formularios">
          {respuestas.length === 0 ? (
            <Vacio texto={t("T-1036")} />
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {respuestas.map((row) => (
                <li
                  key={row.formId}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                >
                  <Link
                    href={`/admin/formularios/${row.formId}/respuestas`}
                    className="font-semibold"
                  >
                    {row.title}
                  </Link>
                  <span className="text-sm text-tinta-suave">{t("T-1042", { n: row.count })}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque id="pipelines" titulo={bPipelines} href="/admin/pipelines">
          {tablero.boards.length === 0 ? (
            <Vacio texto={t("T-1037")} />
          ) : (
            <ul className="flex list-none flex-col gap-3 p-0">
              {tablero.boards.map((board) => (
                <li key={board.pipelineId} className="flex flex-col gap-1">
                  <Link href={`/admin/pipelines/${board.pipelineId}`} className="font-semibold">
                    {board.name}
                  </Link>
                  <ul className="flex list-none flex-wrap gap-2 p-0">
                    {board.stages.map((stage) => (
                      <li key={stage.name}>
                        <Insignia fondo={stage.open > 0 ? "amarillo" : "sky"}>
                          {stage.name} · {stage.open}
                        </Insignia>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque id="convocatorias" titulo={bConvocatorias} href="/admin/convocatorias">
          {tablero.openCalls.length === 0 ? (
            <Vacio texto={t("T-1038")} />
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {tablero.openCalls.map((call) => (
                <li
                  key={call.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                >
                  <Link href={`/admin/convocatorias/${call.id}`} className="font-semibold">
                    {call.title}
                  </Link>
                  <span className="text-sm text-tinta-suave">
                    {[
                      grupos.get(call.groupId)?.name,
                      call.capacity
                        ? t("T-1027", { aceptados: call.accepted, cupo: call.capacity })
                        : null,
                      formatDate(call.closesAt),
                    ]
                      .filter((item) => item)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque id="ocasiones" titulo={t("T-672")} href="/admin/ocasiones?status=OPEN">
          {ocasiones.rows.length === 0 ? (
            <Vacio texto={t("T-1044")} />
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {ocasiones.rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                >
                  <Link href={`/admin/ocasiones/${row.id}`} className="font-semibold">
                    {row.title}
                  </Link>
                  <span className="text-sm text-tinta-suave">{formatDateTime(row.startsAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque id="campanas" titulo={t("T-1156")} href="/admin/campanas">
          {campanas.length === 0 ? (
            <Vacio texto={t("T-1157")} />
          ) : (
            <ul className="flex list-none flex-col gap-2 p-0">
              {campanas.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                >
                  <Link href={`/admin/campanas/${row.id}`} className="font-semibold">
                    {row.name}
                  </Link>
                  <span className="text-sm text-tinta-suave">
                    {campaignStatusLabel(row.status)}
                    {row.scheduledAt ? ` · ${formatDateTime(row.scheduledAt)}` : ""}
                    {row.status === "SENDING" ? ` · ${row.sentCount} / ${row.totalCount}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        {viabilidad.length > 0 ? (
          <Bloque id="viabilidad" titulo={t("T-2263")} href="/admin/comites">
            <ul className="flex list-none flex-col gap-2 p-0">
              {viabilidad.flatMap((row) =>
                row.alerts
                  .filter((alert) => alert !== "MISSING_REQUIRED")
                  .map((alert) => (
                    <li key={`${row.committeeId}-${alert}`}>
                      <Link href={`/admin/comites/${row.committeeSlug}`}>
                        <Insignia fondo="naranja">
                          {t("T-2261", {
                            comité: row.committeeName,
                            alerta: viabilityLabels[VIABILITY_ALERTS.indexOf(alert)] ?? alert,
                          })}
                        </Insignia>
                      </Link>
                    </li>
                  )),
              )}
            </ul>
          </Bloque>
        ) : null}

        {sinCargos.length > 0 ? (
          <Bloque id="cargos" titulo={t("T-2176")} href="/admin/comites">
            <ul className="flex list-none flex-col gap-2 p-0">
              {sinCargos.flatMap((row) =>
                row.missing.map((role) => (
                  <li key={`${row.committee.id}-${role.roleCode}`}>
                    <Link href={`/admin/comites/${row.committee.slug}`}>
                      <Insignia fondo="naranja">
                        {t("T-2175", { comité: row.committee.name, cargo: role.roleLabel })}
                      </Insignia>
                    </Link>
                  </li>
                )),
              )}
            </ul>
          </Bloque>
        ) : null}

        <Bloque id="sistema" titulo={bSistema} href="/admin/sistema/jobs">
          <ul className="flex list-none flex-col gap-2 p-0">
            <li>
              <Insignia fondo={deadLetters > 0 ? "naranja" : "sky"}>
                {deadLetters > 0 ? t("T-1039", { n: deadLetters }) : t("T-1045")}
              </Insignia>
            </li>
            <li>
              <Insignia fondo={backup?.ok ? "sky" : "naranja"}>
                {backup?.lastRunAt
                  ? conCopia.replace("{fecha}", formatDate(new Date(backup.lastRunAt)))
                  : sinCopias}
              </Insignia>
            </li>
          </ul>
        </Bloque>
      </div>
    </div>
  );
}
