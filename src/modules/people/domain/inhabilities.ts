import { and, eq, inArray, isNull } from "drizzle-orm";
import type { CommandContext, Executor } from "@/db/tx";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import {
  appointment,
  committeeRole,
  committeeRoleAssignment,
  membership,
  membershipTerm,
} from "../schema";
import {
  type HeldRole,
  type InhabilityCode,
  inhabilities,
  inhabilityLabels,
} from "./inhabilities-pure";
import { sanctionStateFor } from "./sanctions";

// Inhabilidades y topes al nombrar cargos (ADR-060 regla 11): las guardas releen los datos en la
// transacción; ADMIN puede forzarlas con motivo y queda auditado. `people` no conoce `Permission`: el
// motivo de excepción solo llega desde caminos de ADMIN (Persona 360, mesa de macroevento, roster).

/** Los seis cargos de la Junta Directiva (Est. art. 21); GH no es junta. */
export const BOARD_KINDS = [
  "PRESIDENT",
  "VP_GH",
  "VP_PUBLIC_RELATIONS",
  "VP_ADMIN",
  "VP_FINANCE",
  "VP_COMMUNICATIONS",
] as const;

export interface Override {
  reason: string;
}

export interface LeadershipContext {
  existing: HeldRole[];
  hasBoardAppointment: boolean;
  isNew: boolean;
  officeBan: boolean;
}

/** Cargos directivos vivos, junta, condición de nuevo e inhabilidad de la persona en el término. */
export async function leadershipContext(
  exec: Executor,
  personId: string,
  termId: string,
  now = new Date(),
): Promise<LeadershipContext> {
  const [committeeRoles, appointments, [member], veteran, sanctions] = await Promise.all([
    exec
      .select({
        committeeId: committeeRoleAssignment.committeeId,
        roleCode: committeeRoleAssignment.roleCode,
        coDirector: committeeRoleAssignment.coDirector,
      })
      .from(committeeRoleAssignment)
      .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
      .where(
        and(
          eq(committeeRoleAssignment.personId, personId),
          eq(committeeRoleAssignment.termId, termId),
          isNull(committeeRoleAssignment.endedAt),
          eq(committeeRole.isLeadership, true),
        ),
      ),
    exec
      .select({
        kind: appointment.kind,
        editionId: appointment.editionId,
        roleCode: appointment.roleCode,
        coDirector: appointment.coDirector,
      })
      .from(appointment)
      .where(and(eq(appointment.personId, personId), eq(appointment.termId, termId))),
    exec
      .select({ firstTermId: membership.firstTermId })
      .from(membership)
      .where(eq(membership.personId, personId))
      .limit(1),
    exec
      .select({ id: membershipTerm.id })
      .from(membershipTerm)
      .where(
        and(
          eq(membershipTerm.personId, personId),
          eq(membershipTerm.termId, termId),
          eq(membershipTerm.reportAsVeteran, true),
        ),
      )
      .limit(1),
    sanctionStateFor(personId, now),
  ]);
  const existing: HeldRole[] = [
    ...committeeRoles.map((row) => ({
      kind: "COMMITTEE" as const,
      scopeId: row.committeeId,
      roleCode: row.roleCode,
      coDirector: row.coDirector,
    })),
    ...appointments.flatMap((row) =>
      row.kind === "MACROEVENT_DIRECTOR" && row.editionId && row.roleCode
        ? [
            {
              kind: "MACROEVENT" as const,
              scopeId: row.editionId,
              roleCode: row.roleCode,
              coDirector: row.coDirector,
            },
          ]
        : [],
    ),
  ];
  return {
    existing,
    hasBoardAppointment: appointments.some((row) =>
      (BOARD_KINDS as readonly string[]).includes(row.kind),
    ),
    isNew: member?.firstTermId === termId && veteran.length === 0,
    officeBan: sanctions.officeBan,
  };
}

export interface InhabilityCheck {
  personId: string;
  termId: string;
  /** Ámbitos cuyos cargos vivos se reemplazan (no cuentan como existentes). */
  replacing: readonly Pick<HeldRole, "kind" | "scopeId">[];
  /** Si se reemplazan todos los cargos de comité (Persona 360 y roster), solo quedan los de macroevento. */
  replacingAllCommittees?: boolean;
  wanted: readonly HeldRole[];
  wantsBoard?: boolean;
  override?: Override | undefined;
  now?: Date;
}

/**
 * Lanza T-2282 si hay inhabilidad; con motivo de excepción la audita y devuelve los códigos forzados.
 * Vacío si no hay nada que impida el nombramiento.
 */
export async function assertNoInhabilities(
  ctx: CommandContext,
  check: InhabilityCheck,
): Promise<InhabilityCode[]> {
  const context = await leadershipContext(ctx.tx, check.personId, check.termId, check.now);
  const existing = context.existing.filter(
    (role) =>
      !(check.replacingAllCommittees && role.kind === "COMMITTEE") &&
      !check.replacing.some((scope) => scope.kind === role.kind && scope.scopeId === role.scopeId),
  );
  const codes = inhabilities({
    existing,
    wanted: check.wanted,
    wantsBoard: check.wantsBoard ?? false,
    hasBoardAppointment: context.hasBoardAppointment,
    isNew: context.isNew,
    officeBan: context.officeBan,
  });
  if (codes.length === 0) {
    return [];
  }
  const reason = check.override?.reason.trim();
  if (reason) {
    await ctx.audit({
      action: "inhabilities.overridden",
      entityType: "person",
      entityId: check.personId,
      after: { termId: check.termId, wanted: [...check.wanted], codes, reason },
    });
    return codes;
  }
  throw new DomainError(
    t("T-2282", { motivos: inhabilityLabels(codes, tList("T-2281")).join("; ") }),
    "roles",
  );
}

/** Cargos de comité de una lista como `HeldRole`, solo los de dirección del catálogo. */
export async function leadershipRolesOf(
  exec: Executor,
  committeeId: string,
  roles: ReadonlyArray<{ roleCode: string; coDirector?: boolean | undefined }>,
): Promise<HeldRole[]> {
  const codes = [...new Set(roles.map((role) => role.roleCode))];
  if (codes.length === 0) {
    return [];
  }
  const leadership = await exec
    .select({ code: committeeRole.code })
    .from(committeeRole)
    .where(and(inArray(committeeRole.code, codes), eq(committeeRole.isLeadership, true)));
  const set = new Set(leadership.map((row) => row.code));
  return roles
    .filter((role) => set.has(role.roleCode))
    .map((role) => ({
      kind: "COMMITTEE" as const,
      scopeId: committeeId,
      roleCode: role.roleCode,
      coDirector: role.coDirector ?? false,
    }));
}
