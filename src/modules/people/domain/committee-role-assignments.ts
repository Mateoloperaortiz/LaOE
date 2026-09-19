import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { isUniqueViolation } from "@/db/errors";
import type { Executor } from "@/db/tx";
import { t, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { committee, committeeMembership, committeeRole, committeeRoleAssignment } from "../schema";

// Cargos asignados de una pertenencia (ADR-058): una fila por cargo, titular o codirección, con
// inicio y fin. `committee_membership.roleCode` conserva el cargo principal (el vivo de menor orden,
// MIEMBRO si no hay ninguno) y se recalcula aquí en cada escritura, para que los lectores que solo
// necesitan un cargo sigan funcionando mientras migran a la lista.

export const MEMBER_ROLE = "MIEMBRO";

export const roleAssignmentInputSchema = z.object({
  roleCode: z.string().trim().min(1).max(40),
  coDirector: z.boolean().default(false),
});

export type RoleAssignmentInput = z.infer<typeof roleAssignmentInputSchema>;

/** Un cargo como llega de un formulario o de un lector viejo: la codirección puede faltar. */
export type RoleAssignmentLike = { roleCode: string; coDirector?: boolean | undefined };

export interface LiveRole extends RoleAssignmentInput {
  roleLabel: string;
  isLeadership: boolean;
  required: boolean;
  capabilities: string[];
  sortOrder: number;
}

export interface MembershipRef {
  id: string;
  personId: string;
  committeeId: string;
  termId: string;
}

const liveColumns = {
  membershipId: committeeRoleAssignment.membershipId,
  roleCode: committeeRoleAssignment.roleCode,
  coDirector: committeeRoleAssignment.coDirector,
  roleLabel: committeeRole.label,
  isLeadership: committeeRole.isLeadership,
  required: committeeRole.required,
  capabilities: committeeRole.capabilities,
  sortOrder: committeeRole.sortOrder,
};

/** Cargos vivos de varias pertenencias, en el orden del catálogo, agrupados por pertenencia. */
export async function listLiveRolesByMembership(
  exec: Executor,
  membershipIds: string[],
): Promise<Map<string, LiveRole[]>> {
  const grouped = new Map<string, LiveRole[]>();
  if (membershipIds.length === 0) {
    return grouped;
  }
  const rows = await exec
    .select(liveColumns)
    .from(committeeRoleAssignment)
    .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
    .where(
      and(
        inArray(committeeRoleAssignment.membershipId, membershipIds),
        isNull(committeeRoleAssignment.endedAt),
      ),
    )
    .orderBy(asc(committeeRole.sortOrder), asc(committeeRole.label));
  for (const { membershipId, ...role } of rows) {
    const list = grouped.get(membershipId) ?? [];
    list.push(role);
    grouped.set(membershipId, list);
  }
  return grouped;
}

/** Sin MIEMBRO (no es un cargo) y sin repetir código: el último gana. */
export function normalizeRoles(roles: RoleAssignmentLike[]): RoleAssignmentInput[] {
  const byCode = new Map<string, RoleAssignmentInput>();
  for (const role of roles) {
    if (role.roleCode === MEMBER_ROLE) {
      continue;
    }
    byCode.set(role.roleCode, { roleCode: role.roleCode, coDirector: role.coDirector ?? false });
  }
  return [...byCode.values()];
}

/** Compatibilidad con el cargo suelto de ADR-029: si viene la lista, manda la lista. */
export function rolesFromInput(
  roleCode: string | undefined,
  roles: RoleAssignmentLike[] | undefined,
): RoleAssignmentInput[] {
  if (roles && roles.length > 0) {
    return normalizeRoles(roles);
  }
  return roleCode && roleCode !== MEMBER_ROLE ? [{ roleCode, coDirector: false }] : [];
}

function sameRole(a: RoleAssignmentInput, b: RoleAssignmentInput): boolean {
  return a.roleCode === b.roleCode && a.coDirector === b.coDirector;
}

export interface RolesChange {
  changed: boolean;
  before: RoleAssignmentInput[];
  after: RoleAssignmentInput[];
}

/**
 * Deja los cargos vivos de la pertenencia como dice la lista: cierra los que sobran y abre los nuevos.
 * Valida que el cargo exista y que solo los de dirección lleven codirección; una violación de los
 * índices únicos (un titular y una codirección por cargo, comité y término) se traduce a T-452.
 */
export async function replaceRoles(
  exec: Executor,
  membership: MembershipRef,
  roles: RoleAssignmentInput[],
  now = new Date(),
): Promise<RolesChange> {
  const wanted = normalizeRoles(roles);
  const catalog = await exec
    .select({
      code: committeeRole.code,
      label: committeeRole.label,
      isLeadership: committeeRole.isLeadership,
      retired: committeeRole.retired,
      replacedByCode: committeeRole.replacedByCode,
    })
    .from(committeeRole);
  const byCode = new Map(catalog.map((row) => [row.code, row]));
  const errors = tList("T-165");
  for (const role of wanted) {
    const known = byCode.get(role.roleCode);
    if (!known) {
      throw new DomainError(errors[6] ?? "", "roleCode");
    }
    if (role.coDirector && !known.isLeadership) {
      throw new DomainError(t("T-2169"), "roleCode");
    }
  }
  const current = await exec
    .select({
      id: committeeRoleAssignment.id,
      roleCode: committeeRoleAssignment.roleCode,
      coDirector: committeeRoleAssignment.coDirector,
    })
    .from(committeeRoleAssignment)
    .where(
      and(
        eq(committeeRoleAssignment.membershipId, membership.id),
        isNull(committeeRoleAssignment.endedAt),
      ),
    );
  const before = current.map(({ roleCode, coDirector }) => ({ roleCode, coDirector }));
  const toEnd = current.filter((row) => !wanted.some((role) => sameRole(role, row)));
  const toAdd = wanted.filter((role) => !current.some((row) => sameRole(role, row)));
  // Un cargo retirado no se abre nuevo; quien ya lo tiene lo conserva (ADR-060 regla 4).
  for (const role of toAdd) {
    const known = byCode.get(role.roleCode);
    if (known?.retired && !current.some((row) => row.roleCode === role.roleCode)) {
      const replacement = known.replacedByCode ? byCode.get(known.replacedByCode) : undefined;
      throw new DomainError(
        replacement
          ? t("T-2212", { cargo: known.label, nuevo: replacement.label })
          : t("T-2214", { cargo: known.label }),
        "roleCode",
      );
    }
  }
  if (toEnd.length === 0 && toAdd.length === 0) {
    return { changed: false, before, after: before };
  }
  if (toEnd.length > 0) {
    await exec
      .update(committeeRoleAssignment)
      .set({ endedAt: now })
      .where(
        inArray(
          committeeRoleAssignment.id,
          toEnd.map((row) => row.id),
        ),
      );
  }
  // El nombre del comité se lee antes de escribir: tras una violación la transacción ya no responde.
  const [ref] =
    toAdd.length > 0
      ? await exec
          .select({ name: committee.name })
          .from(committee)
          .where(eq(committee.id, membership.committeeId))
      : [];
  for (const role of toAdd) {
    try {
      await exec.insert(committeeRoleAssignment).values({
        membershipId: membership.id,
        personId: membership.personId,
        committeeId: membership.committeeId,
        termId: membership.termId,
        roleCode: role.roleCode,
        coDirector: role.coDirector,
        startedAt: now,
      });
    } catch (error) {
      if (
        isUniqueViolation(error, "committee_role_assignment_titular_unique") ||
        isUniqueViolation(error, "committee_role_assignment_codireccion_unique")
      ) {
        const label = byCode.get(role.roleCode)?.label ?? role.roleCode;
        throw new DomainError(
          t("T-452", {
            comité: ref?.name ?? "",
            cargo: role.coDirector ? t("T-2144", { cargo: label }) : label,
          }),
          "roleCode",
        );
      }
      throw error;
    }
  }
  await syncPrincipalRole(exec, membership.id);
  return { changed: true, before, after: wanted };
}

/** Cierra todos los cargos vivos de la pertenencia (al cerrar la pertenencia). */
export async function endRoles(
  exec: Executor,
  membershipId: string,
  now = new Date(),
): Promise<void> {
  await exec
    .update(committeeRoleAssignment)
    .set({ endedAt: now })
    .where(
      and(
        eq(committeeRoleAssignment.membershipId, membershipId),
        isNull(committeeRoleAssignment.endedAt),
      ),
    );
  await syncPrincipalRole(exec, membershipId);
}

/** Cierra los cargos vivos de todas las pertenencias de la persona (baja y anonimización). */
export async function endRolesForPerson(
  exec: Executor,
  personId: string,
  now = new Date(),
): Promise<void> {
  const live = await exec
    .select({ membershipId: committeeRoleAssignment.membershipId })
    .from(committeeRoleAssignment)
    .where(
      and(eq(committeeRoleAssignment.personId, personId), isNull(committeeRoleAssignment.endedAt)),
    );
  for (const membershipId of new Set(live.map((row) => row.membershipId))) {
    await endRoles(exec, membershipId, now);
  }
}

/** Recalcula el cargo principal de la pertenencia: el vivo de menor orden, o MIEMBRO. */
export async function syncPrincipalRole(exec: Executor, membershipId: string): Promise<string> {
  const [first] = await exec
    .select({ roleCode: committeeRoleAssignment.roleCode })
    .from(committeeRoleAssignment)
    .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
    .where(
      and(
        eq(committeeRoleAssignment.membershipId, membershipId),
        isNull(committeeRoleAssignment.endedAt),
      ),
    )
    .orderBy(asc(committeeRole.sortOrder), asc(committeeRole.label))
    .limit(1);
  const roleCode = first?.roleCode ?? MEMBER_ROLE;
  await exec
    .update(committeeMembership)
    .set({ roleCode })
    .where(eq(committeeMembership.id, membershipId));
  return roleCode;
}
