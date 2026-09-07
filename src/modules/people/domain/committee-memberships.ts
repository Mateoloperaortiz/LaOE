import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext, Executor } from "@/db/tx";
import { requireConfig } from "@/modules/system";
import { getCurrentTerm, listAllTerms, type TermRow } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import { committee, committeeMembership, committeeRole, membership } from "../schema";

// Pertenencia a comité por término (ADR-005) con el cargo en la pertenencia (ADR-029): de 1 a 3 para
// activos y un solo General vivo por comité y término.

export const committeeMembershipInputSchema = z.object({
  committeeId: z.string().trim().min(1),
  roleCode: z.string().trim().min(1).max(40).default("MIEMBRO"),
  transferredIn: z.boolean().default(false),
});

export type CommitteeMembershipInput = z.infer<typeof committeeMembershipInputSchema>;

export interface CommitteeMembershipView {
  id: string;
  committeeId: string;
  committeeName: string;
  committeeSlug: string;
  roleCode: string;
  roleLabel: string;
  isLeadership: boolean;
  transferredIn: boolean;
  joinedAt: Date | null;
  leftAt: Date | null;
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
  const termById = new Map(terms.map((term) => [term.id, term]));
  const grouped: TermCommittees[] = [];
  for (const row of rows) {
    let group = grouped.find((item) => item.termId === row.termId);
    if (!group) {
      group = { termId: row.termId, termCode: termById.get(row.termId)?.code ?? "", items: [] };
      grouped.push(group);
    }
    const { termId: _termId, ...view } = row;
    group.items.push(view);
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
  return { term: current, committees: rows, isNew: own?.firstTermId === current.id };
}

/**
 * Deja las pertenencias de la persona en un término como dice la lista: cierra las que ya no figuran,
 * actualiza cargo y transferencia en las que siguen y crea las nuevas. Los activos necesitan entre
 * `committees.min` y `committees.max` comités.
 */
export async function setCommitteeMemberships(
  ctx: CommandContext,
  personId: string,
  termId: string,
  rows: CommitteeMembershipInput[],
  now = new Date(),
): Promise<void> {
  const wanted = new Map<string, CommitteeMembershipInput>();
  for (const row of rows) {
    wanted.set(row.committeeId, row);
  }
  const roles = await ctx.tx.select({ code: committeeRole.code }).from(committeeRole);
  const known = new Set(roles.map((role) => role.code));
  const errors = tList("T-165");
  for (const row of wanted.values()) {
    if (!known.has(row.roleCode)) {
      throw new DomainError(errors[6] ?? "", "roleCode");
    }
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
  const existing = await ctx.tx
    .select()
    .from(committeeMembership)
    .where(and(eq(committeeMembership.personId, personId), eq(committeeMembership.termId, termId)));
  // El nombre del comité del General se lee antes de escribir: tras una violación la transacción ya no responde.
  const general = rows.find((row) => row.roleCode === "GENERAL");
  const [generalCommittee] = general
    ? await ctx.tx
        .select({ name: committee.name })
        .from(committee)
        .where(eq(committee.id, general.committeeId))
    : [];
  try {
    // Primero se cierran las que sobran y se retiran los Generales que dejan de serlo: así un
    // General nuevo no choca con el anterior dentro de la misma transacción.
    for (const row of existing) {
      if (!wanted.has(row.committeeId) && row.leftAt === null) {
        await ctx.tx
          .update(committeeMembership)
          .set({ leftAt: now })
          .where(eq(committeeMembership.id, row.id));
      }
    }
    for (const row of existing) {
      const target = wanted.get(row.committeeId);
      if (target && row.roleCode === "GENERAL" && target.roleCode !== "GENERAL") {
        await ctx.tx
          .update(committeeMembership)
          .set({ roleCode: target.roleCode })
          .where(eq(committeeMembership.id, row.id));
      }
    }
    for (const row of existing) {
      const target = wanted.get(row.committeeId);
      if (!target) {
        continue;
      }
      await ctx.tx
        .update(committeeMembership)
        .set({ roleCode: target.roleCode, transferredIn: target.transferredIn, leftAt: null })
        .where(eq(committeeMembership.id, row.id));
      wanted.delete(row.committeeId);
    }
    for (const target of wanted.values()) {
      await ctx.tx.insert(committeeMembership).values({
        personId,
        committeeId: target.committeeId,
        termId,
        roleCode: target.roleCode,
        transferredIn: target.transferredIn,
        joinedAt: now,
      });
    }
  } catch (error) {
    if (isUniqueViolation(error, "committee_membership_one_general")) {
      throw new DomainError(t("T-452", { comité: generalCommittee?.name ?? "" }), "roleCode");
    }
    throw error;
  }
  const after = rows.map((row) => ({
    committeeId: row.committeeId,
    roleCode: row.roleCode,
    transferredIn: row.transferredIn,
  }));
  await ctx.audit({
    action: "committee-membership.set",
    entityType: "person",
    entityId: personId,
    before: existing
      .filter((row) => row.leftAt === null)
      .map((row) => ({ committeeId: row.committeeId, roleCode: row.roleCode })),
    after: { termId, committees: after },
  });
  await ctx.emit({
    type: "committee-membership.changed",
    payload: { actorId: ctx.actor.personId, personId, termId, committees: after },
  });
}

export interface CommitteeRoleRow {
  id: string;
  code: string;
  label: string;
  isLeadership: boolean;
  sortOrder: number;
}

export async function listCommitteeRoles(): Promise<CommitteeRoleRow[]> {
  const rows = await getDb()
    .select()
    .from(committeeRole)
    .orderBy(asc(committeeRole.sortOrder), asc(committeeRole.label));
  return rows.map((row) => ({ ...row, id: row.code }));
}
