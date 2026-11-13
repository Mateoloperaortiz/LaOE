import { cache } from "react";
import { requireAdminAreaRoles } from "@/app/_authz/admin-area";
import { listPendingExcusesForCommittee, listRequests, listTasks } from "@/modules/crm";
import {
  listCommitteeViability,
  listPendingReviews,
  VIABILITY_ALERTS,
} from "@/modules/participation";
import { listCommitteesMissingRequiredRoles } from "@/modules/people";
import { countPendingFor } from "@/modules/permanence";
import { countDeadLetters } from "@/modules/system";
import { getCurrentTerm } from "@/modules/terms";
import { t, tLabels, tList } from "@/shared/copy";
import { formatCount } from "@/shared/ui/list-navigation";
import {
  composeDesk,
  DESK_ROWS,
  type Desk,
  type DeskItem,
  deskSection,
  taskDate,
  taskHref,
} from "./desk-items";

// La Mesa (ADR-159 regla 3, tramo O2): lo que le toca al actor, venga del módulo que venga. Lee solo
// de la API pública de cada módulo y no escribe nada: cada elemento lleva a su pantalla de origen, que
// lo resuelve con su orden y su auditoría de siempre. El alcance es el de las pantallas de origen:
// - ADMIN: sus tareas, las solicitudes, las evidencias por revisar, las alertas de todos los comités y
//   los trabajos con error.
// - La dirección de un comité: las excusas de su comité si tiene PERMANENCE, y las alertas de su comité.
// - Quien evalúa un grupo del término: cuántas evaluaciones le faltan.
// La pintan la página de la Mesa y el contador de la barra superior en el mismo pedido; `cache` hace que
// se lea una sola vez.

export const loadDesk = cache(async (): Promise<Desk> => {
  const roles = await requireAdminAreaRoles("/admin/mesa");
  const term = await getCurrentTerm();
  const now = new Date();
  const personId = roles.actor.personId;
  const scope = roles.isAdmin ? null : new Set(roles.committees.map((row) => row.committee.id));
  const inScope = (committeeId: string) => scope === null || scope.has(committeeId);
  const excuseCommittees = roles.committees.filter((row) =>
    row.capabilities.includes("PERMANENCE"),
  );
  const watchesCommittees = roles.isAdmin || roles.committees.length > 0;

  const [tasks, requests, reviews, excuses, evaluations, missing, viability, deadLetters] =
    await Promise.all([
      roles.isAdmin
        ? listTasks({
            q: "",
            status: "OPEN",
            assignee: "mine",
            actorId: personId,
            page: 1,
            pageSize: DESK_ROWS,
          })
        : null,
      roles.isAdmin
        ? listRequests({ status: "PENDING", order: "oldest", page: 1, pageSize: DESK_ROWS })
        : null,
      roles.isAdmin && term ? listPendingReviews(term.id) : [],
      term
        ? Promise.all(
            excuseCommittees.map(async (row) => ({
              committee: row.committee,
              rows: await listPendingExcusesForCommittee(row.committee.id, term.id),
            })),
          )
        : [],
      term ? countPendingFor(personId, term.id) : 0,
      watchesCommittees && term ? listCommitteesMissingRequiredRoles(term.id) : [],
      watchesCommittees && term ? listCommitteeViability(term.id, now) : [],
      roles.isAdmin ? countDeadLetters() : 0,
    ]);

  const viabilityLabels = tLabels("T-2264", VIABILITY_ALERTS);
  const [evaluationOne, evaluationOther] = tList("T-4870");
  const alerts: DeskItem[] = [
    ...missing
      .filter((row) => inScope(row.committee.id))
      .flatMap((row) =>
        row.missing.map((role) => ({
          id: `cargo-${row.committee.id}-${role.roleCode}`,
          title: t("T-2175", { comité: row.committee.name, cargo: role.roleLabel }),
          detail: null,
          href: `/admin/comites/${row.committee.slug}`,
          date: null,
        })),
      ),
    // El cargo obligatorio vacío ya salió arriba, con el nombre del cargo.
    ...viability
      .filter((row) => inScope(row.committeeId))
      .flatMap((row) =>
        row.alerts
          .filter((alert) => alert !== "MISSING_REQUIRED")
          .map((alert) => ({
            id: `viabilidad-${row.committeeId}-${alert}`,
            title: t("T-2261", {
              comité: row.committeeName,
              alerta: viabilityLabels[alert] ?? alert,
            }),
            detail: null,
            href: `/admin/comites/${row.committeeSlug}`,
            date: null,
          })),
      ),
    ...(deadLetters > 0
      ? [
          {
            id: "trabajos-con-error",
            title: t("T-1039", { n: deadLetters }),
            detail: null,
            href: "/admin/sistema/jobs",
            date: null,
          },
        ]
      : []),
  ];
  const excuseRows = excuses.flatMap(({ committee, rows }) =>
    rows.map((row) => ({ committee, row })),
  );
  const onlyExcuseCommittee = excuses.length === 1 ? excuses[0]?.committee : undefined;

  return composeDesk([
    ...deskSection(
      "tasks",
      tasks?.total ?? 0,
      (tasks?.rows ?? []).map((row) => ({
        id: row.id,
        title: row.title,
        detail: row.personName ?? row.organizationName,
        href: taskHref(row),
        date: taskDate(row.dueAt, now),
      })),
      "/admin/tareas?status=OPEN&assignee=mine",
    ),
    ...deskSection(
      "requests",
      requests?.total ?? 0,
      (requests?.rows ?? []).map((row) => ({
        id: row.id,
        title: row.personName,
        detail: row.kindLabel,
        href: `/admin/solicitudes?solicitud=${row.id}`,
        date: { kind: "arrived", at: row.createdAt },
      })),
      "/admin/solicitudes",
    ),
    ...deskSection(
      "excuses",
      excuseRows.length,
      excuseRows.map(({ committee, row }) => ({
        id: row.id,
        title: row.personName,
        detail: onlyExcuseCommittee ? row.detail : `${committee.name} · ${row.detail}`,
        href: `/admin/comites/${committee.slug}/permanencia#excusas`,
        date: { kind: "arrived", at: row.createdAt },
      })),
      onlyExcuseCommittee ? `/admin/comites/${onlyExcuseCommittee.slug}/permanencia#excusas` : null,
    ),
    ...deskSection(
      "reviews",
      reviews.length,
      reviews.map((row) => ({
        id: row.participation.id,
        title: row.personName,
        detail: row.challenge.title || null,
        href: "/admin/gamificacion/revision",
        date: { kind: "arrived", at: row.participation.submittedAt },
      })),
      "/admin/gamificacion/revision",
    ),
    ...deskSection(
      "evaluations",
      evaluations,
      [
        {
          id: "evaluaciones",
          title: formatCount(evaluations, { one: evaluationOne, other: evaluationOther }),
          detail: null,
          href: "/admin/permanencia/evaluaciones",
          date: null,
        },
      ],
      "/admin/permanencia/evaluaciones",
    ),
    ...deskSection("alerts", alerts.length, alerts, roles.isAdmin ? "/admin/comites" : null),
  ]);
});
