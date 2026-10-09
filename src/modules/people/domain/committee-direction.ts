import { and, asc, eq, ilike, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod";
import { getDb } from "@/db/client";
import type { CommandContext, Executor } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { committeeMembershipChanged, committeeRemovalRequested } from "@/domain-events/people";
import { requireConfig } from "@/modules/system";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  committee,
  committeeMembership,
  committeeRole,
  committeeRoleAssignment,
  membership,
  person,
} from "../schema";
import {
  COMMITTEE_CAPABILITIES,
  type CommitteeCapability,
  parseCapabilities,
} from "./capabilities";
import {
  checkRolesChange,
  type DirectionActor,
  type RoleState,
  rolesChangeMessage,
} from "./committee-direction-pure";
import { liveCommitteesPayload } from "./committee-memberships";
import {
  listLiveRolesByMembership,
  normalizeRoles,
  type RoleAssignmentInput,
  replaceRoles,
  roleAssignmentInputSchema,
} from "./committee-role-assignments";
import type { CommitteeRef } from "./committees";
import { assertNoInhabilities, leadershipRolesOf } from "./inhabilities";

// La dirección del comité (ADR-058): qué comités dirige una persona y con qué capacidades, qué comités
// quedaron sin un cargo obligatorio, quién puede entrar a un comité y los comandos con eje comité
// (agregar, cargos y pedido de retiro). Las guardas releen la dirección de los datos aunque la página
// ya la haya comprobado (ADR-011). `people` no conoce `Permission`: ADMIN y el líder técnico llegan
// desde `src/app` con todas las capacidades.

const OPERATING_STATUSES = ["ACTIVE", "HONORARY"] as const;
/** Quien está en licencia conserva las capacidades de su cargo de mesa (Regl. art. 27 par. 6; ADR-060 regla 10). */
const DIRECTION_STATUSES = ["ACTIVE", "HONORARY", "ON_LEAVE"] as const;

export interface DirectedRole {
  roleCode: string;
  roleLabel: string;
  coDirector: boolean;
}

export interface DirectedCommittee {
  committee: CommitteeRef;
  roles: DirectedRole[];
  capabilities: CommitteeCapability[];
  isGeneral: boolean;
}

/**
 * Comités que la persona dirige en el término: cargos vivos de dirección, membresía que puede operar y
 * comité activo. Las capacidades son la unión de las de sus cargos.
 */
export const listMyCommitteeCapabilities = cache(
  async (personId: string, termId: string): Promise<DirectedCommittee[]> => {
    const rows = await getDb()
      .select({
        id: committee.id,
        slug: committee.slug,
        name: committee.name,
        logoKey: committee.logoKey,
        publicationStatus: committee.publicationStatus,
        roleCode: committeeRoleAssignment.roleCode,
        roleLabel: committeeRole.label,
        coDirector: committeeRoleAssignment.coDirector,
        capabilities: committeeRole.capabilities,
      })
      .from(committeeRoleAssignment)
      .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
      .innerJoin(committee, eq(committee.id, committeeRoleAssignment.committeeId))
      .innerJoin(membership, eq(membership.personId, committeeRoleAssignment.personId))
      .where(
        and(
          eq(committeeRoleAssignment.personId, personId),
          eq(committeeRoleAssignment.termId, termId),
          isNull(committeeRoleAssignment.endedAt),
          eq(committeeRole.isLeadership, true),
          inArray(committee.status, ["ACTIVE", "ON_TRIAL"]),
          inArray(membership.status, [...DIRECTION_STATUSES]),
        ),
      )
      .orderBy(asc(committee.name), asc(committeeRole.sortOrder), asc(committeeRole.label));
    const byCommittee = new Map<string, DirectedCommittee>();
    for (const row of rows) {
      let entry = byCommittee.get(row.id);
      if (!entry) {
        entry = {
          committee: {
            id: row.id,
            slug: row.slug,
            name: row.name,
            logoKey: row.logoKey,
            isPublished: row.publicationStatus === "PUBLISHED",
            // La consulta ya exige ACTIVE u ON_TRIAL: acá solo hay comités vivos.
            live: true,
          },
          roles: [],
          capabilities: [],
          isGeneral: false,
        };
        byCommittee.set(row.id, entry);
      }
      entry.roles.push({
        roleCode: row.roleCode,
        roleLabel: row.roleLabel,
        coDirector: row.coDirector,
      });
      entry.capabilities = parseCapabilities([...entry.capabilities, ...row.capabilities]);
      entry.isGeneral = entry.isGeneral || row.roleCode === "GENERAL";
    }
    return [...byCommittee.values()];
  },
);

export interface MissingRequiredRoles {
  committee: CommitteeRef;
  missing: Array<{ roleCode: string; roleLabel: string }>;
}

/**
 * Comités activos con gente en el término a los que les falta el titular de un cargo obligatorio
 * (T-2175). Un comité sin nadie todavía no cuenta: el roster llega a medias.
 */
export async function listCommitteesMissingRequiredRoles(
  termId: string,
): Promise<MissingRequiredRoles[]> {
  const db = getDb();
  const [required, populated, holders] = await Promise.all([
    db
      .select({ code: committeeRole.code, label: committeeRole.label })
      .from(committeeRole)
      .where(eq(committeeRole.required, true))
      .orderBy(asc(committeeRole.sortOrder), asc(committeeRole.label)),
    db
      .selectDistinct({
        id: committee.id,
        slug: committee.slug,
        name: committee.name,
        logoKey: committee.logoKey,
        publicationStatus: committee.publicationStatus,
      })
      .from(committee)
      .innerJoin(committeeMembership, eq(committeeMembership.committeeId, committee.id))
      .where(
        and(
          inArray(committee.status, ["ACTIVE", "ON_TRIAL"]),
          eq(committeeMembership.termId, termId),
          isNull(committeeMembership.leftAt),
        ),
      )
      .orderBy(asc(committee.name)),
    db
      .select({
        committeeId: committeeRoleAssignment.committeeId,
        roleCode: committeeRoleAssignment.roleCode,
      })
      .from(committeeRoleAssignment)
      .where(
        and(
          eq(committeeRoleAssignment.termId, termId),
          eq(committeeRoleAssignment.coDirector, false),
          isNull(committeeRoleAssignment.endedAt),
        ),
      ),
  ]);
  if (required.length === 0) {
    return [];
  }
  const held = new Set(holders.map((row) => `${row.committeeId}:${row.roleCode}`));
  const result: MissingRequiredRoles[] = [];
  for (const row of populated) {
    const missing = required
      .filter((role) => !held.has(`${row.id}:${role.code}`))
      .map((role) => ({ roleCode: role.code, roleLabel: role.label }));
    if (missing.length > 0) {
      result.push({
        committee: {
          id: row.id,
          slug: row.slug,
          name: row.name,
          logoKey: row.logoKey,
          isPublished: row.publicationStatus === "PUBLISHED",
          // La consulta ya exige ACTIVE u ON_TRIAL: acá solo hay comités vivos.
          live: true,
        },
        missing,
      });
    }
  }
  return result;
}

export interface EligibleMember {
  id: string;
  fullName: string;
  preferredName: string | null;
  /** Comités vivos que ya tiene en el término, para comparar con `committees.max`. */
  committeeCount: number;
}

/**
 * Miembros activos que no están en el comité este término, por parecido del nombre (`pg_trgm`) y
 * sin correo ni celular, con cuántos comités tienen ya.
 */
export async function searchEligibleMembers(
  committeeId: string,
  termId: string,
  q: string,
  limit = 8,
): Promise<EligibleMember[]> {
  const db = getDb();
  const alreadyIn = db
    .select({ one: sql`1` })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, person.id),
        eq(committeeMembership.committeeId, committeeId),
        eq(committeeMembership.termId, termId),
        isNull(committeeMembership.leftAt),
      ),
    );
  const rows = await db
    .select({
      id: person.id,
      fullName: person.fullName,
      preferredName: person.preferredName,
      committeeCount: sql<number>`(
        select count(*) from ${committeeMembership}
        where ${committeeMembership.personId} = ${person.id}
          and ${committeeMembership.termId} = ${termId}
          and ${committeeMembership.leftAt} is null
      )`.mapWith(Number),
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(
      and(
        eq(membership.status, "ACTIVE"),
        eq(person.stage, "MEMBER"),
        isNull(person.anonymizedAt),
        notExists(alreadyIn),
        or(sql`similarity(${person.fullName}, ${q}) > 0.2`, ilike(person.fullName, `%${q}%`)),
      ),
    )
    .orderBy(sql`similarity(${person.fullName}, ${q}) desc`, asc(person.fullName))
    .limit(limit);
  return rows.map((row) => ({ ...row, fullName: row.fullName?.trim() ?? "" }));
}

export const rosterChangeSchema = z.object({
  personId: z.string().trim().min(1),
  roles: z.array(roleAssignmentInputSchema).default([]),
});

export type RosterChangeInput = z.infer<typeof rosterChangeSchema>;

export const removalRequestSchema = z.object({
  personId: z.string().trim().min(1),
  reason: z.string().trim().min(2).max(500),
});

export type RemovalRequestInput = z.infer<typeof removalRequestSchema>;

/** Sobre qué comité y término actúa el comando. */
export interface RosterScope {
  committeeId: string;
  termId: string;
}

/** Cómo llega el actor desde `src/app`: `people` no conoce `Permission`. */
export interface RosterActorContext {
  isAdmin: boolean;
  /** Líder técnico del comité (`COMMITTEE_LEADER`): todas las capacidades sin depender del roster. */
  allCapabilities: boolean;
}

async function directionOf(
  exec: Executor,
  personId: string,
  scope: RosterScope,
): Promise<Set<string>> {
  const rows = await exec
    .select({ capabilities: committeeRole.capabilities })
    .from(committeeRoleAssignment)
    .innerJoin(committeeRole, eq(committeeRole.code, committeeRoleAssignment.roleCode))
    .innerJoin(membership, eq(membership.personId, committeeRoleAssignment.personId))
    .where(
      and(
        eq(committeeRoleAssignment.personId, personId),
        eq(committeeRoleAssignment.committeeId, scope.committeeId),
        eq(committeeRoleAssignment.termId, scope.termId),
        isNull(committeeRoleAssignment.endedAt),
        eq(committeeRole.isLeadership, true),
        inArray(membership.status, [...OPERATING_STATUSES]),
      ),
    );
  return new Set(rows.flatMap((row) => row.capabilities));
}

async function committeeName(exec: Executor, committeeId: string): Promise<string> {
  const [row] = await exec
    .select({ name: committee.name })
    .from(committee)
    .where(eq(committee.id, committeeId));
  if (!row) {
    throw new DomainError(t("T-032"));
  }
  return row.name;
}

/** Resuelve las capacidades del actor sobre el comité y exige la pedida (T-2162). */
async function requireDirection(
  ctx: CommandContext,
  scope: RosterScope,
  actor: RosterActorContext,
  capability: CommitteeCapability,
): Promise<{ direction: DirectionActor; committeeName: string }> {
  const name = await committeeName(ctx.tx, scope.committeeId);
  const capabilities =
    actor.isAdmin || actor.allCapabilities
      ? new Set<string>(COMMITTEE_CAPABILITIES)
      : ctx.actor.personId
        ? await directionOf(ctx.tx, ctx.actor.personId, scope)
        : new Set<string>();
  if (!capabilities.has(capability)) {
    throw new DomainError(t("T-2162", { comité: name }));
  }
  return { direction: { isAdmin: actor.isAdmin, capabilities }, committeeName: name };
}

async function roleStates(exec: Executor, roles: RoleAssignmentInput[]): Promise<RoleState[]> {
  const wanted = normalizeRoles(roles);
  if (wanted.length === 0) {
    return [];
  }
  const catalog = await exec
    .select({
      code: committeeRole.code,
      label: committeeRole.label,
      isLeadership: committeeRole.isLeadership,
      required: committeeRole.required,
    })
    .from(committeeRole)
    .where(
      inArray(
        committeeRole.code,
        wanted.map((role) => role.roleCode),
      ),
    );
  const byCode = new Map(catalog.map((row) => [row.code, row]));
  return wanted.map((role) => ({
    roleCode: role.roleCode,
    roleLabel: byCode.get(role.roleCode)?.label ?? role.roleCode,
    coDirector: role.coDirector,
    isLeadership: byCode.get(role.roleCode)?.isLeadership ?? false,
    required: byCode.get(role.roleCode)?.required ?? false,
  }));
}

interface TargetPerson {
  id: string;
  fullName: string;
  status: string;
}

async function targetPerson(exec: Executor, personId: string): Promise<TargetPerson> {
  const [row] = await exec
    .select({
      id: person.id,
      fullName: person.fullName,
      anonymizedAt: person.anonymizedAt,
      status: membership.status,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.id, personId));
  if (!row || row.anonymizedAt !== null) {
    throw new DomainError(t("T-032"), "personId");
  }
  return { id: row.id, fullName: row.fullName?.trim() ?? "", status: row.status };
}

async function membershipIn(exec: Executor, personId: string, scope: RosterScope) {
  const [row] = await exec
    .select({ id: committeeMembership.id, leftAt: committeeMembership.leftAt })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, personId),
        eq(committeeMembership.committeeId, scope.committeeId),
        eq(committeeMembership.termId, scope.termId),
      ),
    );
  return row ?? null;
}

/**
 * Agrega al comité, en el término, a un miembro activo que no esté ya en él y tenga cupo, como
 * Miembro o con cargos. Exige `ROSTER`; los cargos pasan por las mismas guardas que un cambio.
 */
export async function addCommitteeMember(
  ctx: CommandContext,
  scope: RosterScope,
  actor: RosterActorContext,
  input: RosterChangeInput,
  now = new Date(),
): Promise<{ membershipId: string; revived: boolean }> {
  const { direction } = await requireDirection(ctx, scope, actor, "ROSTER");
  // La fila de la membresía, con el candado de `setCommitteeMemberships` y de la baja (ADR-118 regla
  // 11): el estado y el cupo se leen después de tomarla. Una baja que llega a la vez no deja una
  // pertenencia viva, y dos «Agregar» de la misma persona cuentan su cupo uno después del otro.
  await ctx.tx
    .select({ personId: membership.personId })
    .from(membership)
    .where(eq(membership.personId, input.personId))
    .for("update");
  const who = await targetPerson(ctx.tx, input.personId);
  if (who.status !== "ACTIVE") {
    throw new DomainError(t("T-2164"), "personId");
  }
  const existing = await membershipIn(ctx.tx, who.id, scope);
  if (existing && existing.leftAt === null) {
    throw new DomainError(t("T-2165", { nombre: who.fullName }), "personId");
  }
  const [live] = await ctx.tx
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, who.id),
        eq(committeeMembership.termId, scope.termId),
        isNull(committeeMembership.leftAt),
      ),
    );
  const max = await requireConfig("committees.max");
  if ((live?.n ?? 0) >= max) {
    throw new DomainError(t("T-2166", { nombre: who.fullName, max }), "personId");
  }
  const target = await roleStates(ctx.tx, input.roles);
  const error = checkRolesChange({
    actor: direction,
    isSelf: who.id === ctx.actor.personId,
    current: [],
    target,
  });
  if (error) {
    throw new DomainError(rolesChangeMessage(error, [], target), "roles");
  }
  await assertNoInhabilities(ctx, {
    personId: who.id,
    termId: scope.termId,
    replacing: [{ kind: "COMMITTEE", scopeId: scope.committeeId }],
    wanted: await leadershipRolesOf(ctx.tx, scope.committeeId, input.roles),
    now,
  });
  let membershipId: string;
  if (existing) {
    await ctx.tx
      .update(committeeMembership)
      .set({ leftAt: null, joinedAt: now, transferredIn: false })
      .where(eq(committeeMembership.id, existing.id));
    membershipId = existing.id;
  } else {
    const [created] = await ctx.tx
      .insert(committeeMembership)
      .values({
        personId: who.id,
        committeeId: scope.committeeId,
        termId: scope.termId,
        transferredIn: false,
        joinedAt: now,
      })
      .returning({ id: committeeMembership.id });
    if (!created) {
      throw new Error("No se pudo crear la pertenencia");
    }
    membershipId = created.id;
  }
  const change = await replaceRoles(
    ctx.tx,
    { id: membershipId, personId: who.id, committeeId: scope.committeeId, termId: scope.termId },
    input.roles,
    now,
  );
  await ctx.audit({
    action: "committee-membership.added",
    entityType: "person",
    entityId: who.id,
    after: {
      committeeId: scope.committeeId,
      termId: scope.termId,
      roles: change.after,
      revived: existing !== null,
    },
  });
  await ctx.emit(
    eventOf(committeeMembershipChanged, {
      actorId: ctx.actor.personId,
      personId: who.id,
      termId: scope.termId,
      committees: await liveCommitteesPayload(ctx.tx, who.id, scope.termId),
    }),
  );
  return { membershipId, revived: existing !== null };
}

/** Deja los cargos de un miembro del comité como dice la lista. Exige `ROSTER` y las guardas de cargos. */
export async function setMemberRoles(
  ctx: CommandContext,
  scope: RosterScope,
  actor: RosterActorContext,
  input: RosterChangeInput,
  now = new Date(),
): Promise<{ changed: boolean }> {
  const { direction } = await requireDirection(ctx, scope, actor, "ROSTER");
  const who = await targetPerson(ctx.tx, input.personId);
  const existing = await membershipIn(ctx.tx, who.id, scope);
  if (!existing || existing.leftAt !== null) {
    throw new DomainError(t("T-2173"), "personId");
  }
  const liveRoles = (await listLiveRolesByMembership(ctx.tx, [existing.id])).get(existing.id) ?? [];
  const current: RoleState[] = liveRoles.map((role) => ({
    roleCode: role.roleCode,
    roleLabel: role.roleLabel,
    coDirector: role.coDirector,
    isLeadership: role.isLeadership,
    required: role.required,
  }));
  const target = await roleStates(ctx.tx, input.roles);
  const error = checkRolesChange({
    actor: direction,
    isSelf: who.id === ctx.actor.personId,
    current,
    target,
  });
  if (error) {
    throw new DomainError(rolesChangeMessage(error, current, target), "roles");
  }
  await assertNoInhabilities(ctx, {
    personId: who.id,
    termId: scope.termId,
    replacing: [{ kind: "COMMITTEE", scopeId: scope.committeeId }],
    wanted: await leadershipRolesOf(ctx.tx, scope.committeeId, input.roles),
    now,
  });
  const change = await replaceRoles(
    ctx.tx,
    { id: existing.id, personId: who.id, committeeId: scope.committeeId, termId: scope.termId },
    input.roles,
    now,
  );
  if (!change.changed) {
    return { changed: false };
  }
  await ctx.audit({
    action: "committee-roles.set",
    entityType: "person",
    entityId: who.id,
    before: { committeeId: scope.committeeId, termId: scope.termId, roles: change.before },
    after: { committeeId: scope.committeeId, termId: scope.termId, roles: change.after },
  });
  await ctx.emit(
    eventOf(committeeMembershipChanged, {
      actorId: ctx.actor.personId,
      personId: who.id,
      termId: scope.termId,
      committees: await liveCommitteesPayload(ctx.tx, who.id, scope.termId),
    }),
  );
  return { changed: true };
}

/**
 * Pide a GH que retire a alguien del comité: no cierra la pertenencia; `crm` convierte el evento en una
 * tarea sin responsable y en una interacción. Exige `ROSTER`; nadie pide su propio retiro por acá.
 */
export async function requestCommitteeRemoval(
  ctx: CommandContext,
  scope: RosterScope,
  actor: RosterActorContext,
  input: RemovalRequestInput,
): Promise<void> {
  await requireDirection(ctx, scope, actor, "ROSTER");
  const who = await targetPerson(ctx.tx, input.personId);
  if (who.id === ctx.actor.personId && !actor.isAdmin) {
    throw new DomainError(t("T-2163"), "personId");
  }
  const existing = await membershipIn(ctx.tx, who.id, scope);
  if (!existing || existing.leftAt !== null) {
    throw new DomainError(t("T-2173"), "personId");
  }
  await ctx.audit({
    action: "committee-membership.removal-requested",
    entityType: "person",
    entityId: who.id,
    after: { committeeId: scope.committeeId, termId: scope.termId, reason: input.reason },
  });
  await ctx.emit(
    eventOf(committeeRemovalRequested, {
      actorId: ctx.actor.personId,
      personId: who.id,
      committeeId: scope.committeeId,
      termId: scope.termId,
      reason: input.reason,
    }),
  );
}
