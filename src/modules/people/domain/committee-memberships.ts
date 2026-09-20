import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { committeeMembershipChanged } from "@/domain-events/people";
import { requireConfig } from "@/modules/system";
import { getCurrentTerm, listAllTerms, type TermRow } from "@/modules/terms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { committee, committeeMembership, committeeRole, membership } from "../schema";
import type { RoleView } from "./committee-direction-pure";
import {
  endRoles,
  type LiveRole,
  listLiveRolesByMembership,
  type RoleAssignmentInput,
  replaceRoles,
  roleAssignmentInputSchema,
  rolesFromInput,
} from "./committee-role-assignments";
import { assertNoInhabilities, leadershipRolesOf, type Override } from "./inhabilities";
import type { HeldRole } from "./inhabilities-pure";

// Pertenencia a comité por término (ADR-005): de 1 a 3 para activos. Los cargos viven en
// `committee_role_assignment` (ADR-058), con un titular y una codirección por cargo, comité y término;
// `roleCode` conserva el cargo principal derivado.

export const committeeMembershipInputSchema = z.object({
  committeeId: z.string().trim().min(1),
  /** Cargo suelto (ADR-029), para quien todavía manda uno solo; si viene `roles`, manda `roles`. */
  roleCode: z.string().trim().min(1).max(40).default("MIEMBRO"),
  roles: z.array(roleAssignmentInputSchema).default([]),
  transferredIn: z.boolean().default(false),
});

/** Lo que aceptan los comandos: `roles` y `transferredIn` pueden faltar (la validación pone los valores por defecto). */
export type CommitteeMembershipInput = z.input<typeof committeeMembershipInputSchema>;

export interface CommitteeMembershipView {
  id: string;
  committeeId: string;
  committeeName: string;
  committeeSlug: string;
  /** Cargo principal derivado (ADR-058); `roles` trae todos los vivos, con codirección. */
  roleCode: string;
  roleLabel: string;
  isLeadership: boolean;
  roles: RoleView[];
  transferredIn: boolean;
  joinedAt: Date | null;
  leftAt: Date | null;
}

/** Los cargos vivos de una pertenencia como vista: solo lo que la interfaz muestra. */
export function rolesOf(roles: Map<string, LiveRole[]>, membershipId: string): RoleView[] {
  return (roles.get(membershipId) ?? []).map(({ roleCode, roleLabel, coDirector }) => ({
    roleCode,
    roleLabel,
    coDirector,
  }));
}

export interface TermCommittees {
  termId: string;
  termCode: string;
  items: CommitteeMembershipView[];
}

const viewColumns = {
  id: committeeMembership.id,
  committeeId: committeeMembership.committeeId,
  committeeName: committee.name,
  committeeSlug: committee.slug,
  roleCode: committeeMembership.roleCode,
  roleLabel: committeeRole.label,
  isLeadership: committeeRole.isLeadership,
  transferredIn: committeeMembership.transferredIn,
  joinedAt: committeeMembership.joinedAt,
  leftAt: committeeMembership.leftAt,
};

/** Comités por término, del más reciente al más viejo, con el cargo en cada uno. */
export async function listCommitteeMembershipsByTerm(personId: string): Promise<TermCommittees[]> {
  const [rows, terms] = await Promise.all([
    getDb()
      .select({ ...viewColumns, termId: committeeMembership.termId })
      .from(committeeMembership)
      .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
      .innerJoin(committeeRole, eq(committeeRole.code, committeeMembership.roleCode))
      .where(eq(committeeMembership.personId, personId))
      .orderBy(asc(committee.name)),
    listAllTerms(),
  ]);
  const roles = await listLiveRolesByMembership(
    getDb(),
    rows.map((row) => row.id),
  );
  const termById = new Map(terms.map((term) => [term.id, term]));
  const grouped: TermCommittees[] = [];
  for (const row of rows) {
    let group = grouped.find((item) => item.termId === row.termId);
    if (!group) {
      group = { termId: row.termId, termCode: termById.get(row.termId)?.code ?? "", items: [] };
      grouped.push(group);
    }
    const { termId: _termId, ...view } = row;
    group.items.push({ ...view, roles: rolesOf(roles, row.id) });
  }
  return grouped.sort((a, b) =>
    (termById.get(b.termId)?.startsOn ?? "").localeCompare(termById.get(a.termId)?.startsOn ?? ""),
  );
}

export interface MyMembership {
  term: TermRow | null;
  committees: CommitteeMembershipView[];
  /** Entró en el término actual: el inicio le muestra el onboarding. */
  isNew: boolean;
}

/** Los comités vivos de la persona en el término actual (inicio de Mi OE, directorio, carnet). */
export async function getMyMembership(
  personId: string,
  exec: Executor = getDb(),
  now = new Date(),
): Promise<MyMembership> {
  const current = await getCurrentTerm(now, exec);
  if (!current) {
    return { term: null, committees: [], isNew: false };
  }
  const [own] = await exec
    .select({ firstTermId: membership.firstTermId })
    .from(membership)
    .where(eq(membership.personId, personId));
  const rows = await exec
    .select(viewColumns)
    .from(committeeMembership)
    .innerJoin(committee, eq(committee.id, committeeMembership.committeeId))
    .innerJoin(committeeRole, eq(committeeRole.code, committeeMembership.roleCode))
    .where(
      and(
        eq(committeeMembership.personId, personId),
        eq(committeeMembership.termId, current.id),
        isNull(committeeMembership.leftAt),
      ),
    )
    .orderBy(asc(committee.name));
  const roles = await listLiveRolesByMembership(
    exec,
    rows.map((row) => row.id),
  );
  return {
    term: current,
    committees: rows.map((row) => ({ ...row, roles: rolesOf(roles, row.id) })),
    isNew: own?.firstTermId === current.id,
  };
}

export interface LiveCommitteePayload {
  committeeId: string;
  /** Cargo principal derivado: el de menor orden entre los vivos, o MIEMBRO. */
  roleCode: string;
  transferredIn: boolean;
  roles: RoleAssignmentInput[];
}

/**
 * Las pertenencias vivas de la persona en el término, con el cargo principal y todos sus cargos: es
 * lo que viaja en la auditoría y en `committee-membership.changed` (permanencia, billetera y línea de
 * tiempo leen `committeeId` y `roleCode`; los lectores nuevos, `roles`).
 */
export async function liveCommitteesPayload(
  exec: Executor,
  personId: string,
  termId: string,
): Promise<LiveCommitteePayload[]> {
  const rows = await exec
    .select({
      id: committeeMembership.id,
      committeeId: committeeMembership.committeeId,
      roleCode: committeeMembership.roleCode,
      transferredIn: committeeMembership.transferredIn,
    })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, personId),
        eq(committeeMembership.termId, termId),
        isNull(committeeMembership.leftAt),
      ),
    );
  const roles = await listLiveRolesByMembership(
    exec,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    committeeId: row.committeeId,
    roleCode: row.roleCode,
    transferredIn: row.transferredIn,
    roles: (roles.get(row.id) ?? []).map(({ roleCode, coDirector }) => ({ roleCode, coDirector })),
  }));
}

/**
 * Deja las pertenencias de la persona en un término como dice la lista: cierra las que ya no figuran
 * (con sus cargos), actualiza transferencia y cargos en las que siguen y crea las nuevas. Los activos
 * necesitan entre `committees.min` y `committees.max` comités. Los cargos se validan y escriben en
 * `replaceRoles`, que traduce a T-452 el choque con un titular o una codirección que ya existe.
 */
export async function setCommitteeMemberships(
  ctx: CommandContext,
  personId: string,
  termId: string,
  rows: CommitteeMembershipInput[],
  now = new Date(),
  override?: Override,
): Promise<void> {
  const wanted = new Map<string, { transferredIn: boolean; roles: RoleAssignmentInput[] }>();
  for (const row of rows) {
    wanted.set(row.committeeId, {
      transferredIn: row.transferredIn ?? false,
      roles: rolesFromInput(row.roleCode, row.roles),
    });
  }
  const [current] = await ctx.tx
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, personId));
  if (current?.status === "ACTIVE") {
    const [min, max] = await Promise.all([
      requireConfig("committees.min"),
      requireConfig("committees.max"),
    ]);
    if (wanted.size < min || wanted.size > max) {
      throw new DomainError(t("T-451", { min, max }), "committeeId");
    }
  }
  // Inhabilidades y topes (ADR-060 regla 11): la lista es el conjunto final de cargos de comité.
  const wantedRoles: HeldRole[] = [];
  for (const [committeeId, target] of wanted) {
    wantedRoles.push(...(await leadershipRolesOf(ctx.tx, committeeId, target.roles)));
  }
  await assertNoInhabilities(ctx, {
    personId,
    termId,
    replacing: [],
    replacingAllCommittees: true,
    wanted: wantedRoles,
    override,
    now,
  });
  const existing = await ctx.tx
    .select()
    .from(committeeMembership)
    .where(and(eq(committeeMembership.personId, personId), eq(committeeMembership.termId, termId)));
  // ADR-073 regla 3: un comité desactivado no recibe pertenencias nuevas ni reabre una cerrada.
  // Salir nunca se bloquea, así que lo que ya está vivo se puede conservar y cerrar.
  const opening = [...wanted.keys()].filter((committeeId) => {
    const row = existing.find((item) => item.committeeId === committeeId);
    return !row || row.leftAt !== null;
  });
  if (opening.length > 0) {
    const [inactive] = await ctx.tx
      .select({ name: committee.name })
      .from(committee)
      .where(and(inArray(committee.id, opening), eq(committee.status, "INACTIVE")))
      .orderBy(asc(committee.name))
      .limit(1);
    if (inactive) {
      throw new DomainError(t("T-2618", { comité: inactive.name }), "committeeId");
    }
  }
  const before = await liveCommitteesPayload(ctx.tx, personId, termId);
  // Primero se cierran las que sobran, con sus cargos: así un cargo que pasa a otra pertenencia no
  // choca con el anterior dentro de la misma transacción.
  for (const row of existing) {
    if (!wanted.has(row.committeeId) && row.leftAt === null) {
      await ctx.tx
        .update(committeeMembership)
        .set({ leftAt: now })
        .where(eq(committeeMembership.id, row.id));
      await endRoles(ctx.tx, row.id, now);
    }
  }
  for (const row of existing) {
    const target = wanted.get(row.committeeId);
    if (!target) {
      continue;
    }
    await ctx.tx
      .update(committeeMembership)
      .set({ transferredIn: target.transferredIn, leftAt: null })
      .where(eq(committeeMembership.id, row.id));
    await replaceRoles(
      ctx.tx,
      { id: row.id, personId, committeeId: row.committeeId, termId },
      target.roles,
      now,
    );
    wanted.delete(row.committeeId);
  }
  for (const [committeeId, target] of wanted) {
    const [created] = await ctx.tx
      .insert(committeeMembership)
      .values({
        personId,
        committeeId,
        termId,
        transferredIn: target.transferredIn,
        joinedAt: now,
      })
      .returning({ id: committeeMembership.id });
    if (!created) {
      throw new Error("No se pudo crear la pertenencia");
    }
    await replaceRoles(
      ctx.tx,
      { id: created.id, personId, committeeId, termId },
      target.roles,
      now,
    );
  }
  const after = await liveCommitteesPayload(ctx.tx, personId, termId);
  await ctx.audit({
    action: "committee-membership.set",
    entityType: "person",
    entityId: personId,
    before: { termId, committees: before },
    after: { termId, committees: after },
  });
  await ctx.emit(
    eventOf(committeeMembershipChanged, {
      actorId: ctx.actor.personId,
      personId,
      termId,
      committees: after,
    }),
  );
}

export interface CommitteeRoleRow {
  id: string;
  code: string;
  label: string;
  isLeadership: boolean;
  /** No puede faltar en ningún comité (ADR-058): General y Financiero. */
  required: boolean;
  /** Capacidades que el cargo habilita sobre su comité (domain/capabilities.ts). */
  capabilities: string[];
  sortOrder: number;
  /** Retirado del catálogo de comités y su reemplazo (ADR-060 regla 4). */
  retired: boolean;
  replacedByCode: string | null;
}

export async function listCommitteeRoles(): Promise<CommitteeRoleRow[]> {
  const rows = await getDb()
    .select()
    .from(committeeRole)
    .orderBy(asc(committeeRole.sortOrder), asc(committeeRole.label));
  return rows.map((row) => ({ ...row, id: row.code }));
}
