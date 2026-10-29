import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { committeeMembershipChanged } from "@/domain-events/people";
import { getMacroeventEdition, isMacroeventSlug } from "@/modules/events";
import { findTermContaining, getCurrentTerm, getTerm } from "@/modules/terms";
import { t } from "@/shared/copy";
import { APP_TIME_ZONE, dateKeyIn, todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  appointment,
  committee,
  committeeMembership,
  committeeRoleAssignment,
  membership,
  person,
} from "../schema";
import { addMacroeventDirector, removeAppointment } from "./appointments";
import { liveCommitteesPayload } from "./committee-memberships";
import { listLiveRolesByMembership, replaceRoles } from "./committee-role-assignments";
import { assertNoInhabilities, leadershipRolesOf } from "./inhabilities";
import { lockMembershipCycles } from "./wallet-member";

const OPERATING = ["ACTIVE", "HONORARY"] as const;

export type LogisticsSource = {
  kind: "COMMITTEE_ASSIGNMENT" | "MACROEVENT_APPOINTMENT";
  id: string;
};

export interface LogisticsSourceView extends LogisticsSource {
  personId: string;
  termId: string;
  committeeId: string | null;
  editionId: string | null;
  label: string;
  live: boolean;
}

/** El cargo se deriva de datos vigentes; no concede ADMIN ni usa el líder histórico del CML. */
export async function hasCurrentVpAdmin(
  personId: string,
  exec: Executor = getDb(),
  now = new Date(),
): Promise<boolean> {
  const current = await getCurrentTerm(now, exec);
  if (!current) return false;
  return hasVpAdminInTerm(personId, current.id, exec);
}

/** Consulta el cargo en el término que la composición ya resolvió; no vuelve a buscar el actual. */
export async function hasVpAdminInTerm(
  personId: string,
  termId: string,
  exec: Executor = getDb(),
): Promise<boolean> {
  const [row] = await exec
    .select({ id: appointment.id })
    .from(appointment)
    .innerJoin(membership, eq(membership.personId, appointment.personId))
    .innerJoin(person, eq(person.id, appointment.personId))
    .where(
      and(
        eq(appointment.personId, personId),
        eq(appointment.termId, termId),
        eq(appointment.kind, "VP_ADMIN"),
        inArray(membership.status, [...OPERATING]),
        isNull(person.anonymizedAt),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Resuelve la asignación exacta: una baja y nueva designación nunca recuperan una concesión vieja. */
export async function resolveLogisticsSource(
  source: LogisticsSource,
  exec: Executor = getDb(),
  now = new Date(),
): Promise<LogisticsSourceView | null> {
  if (!source || !source.id) return null;
  if (source.kind === "COMMITTEE_ASSIGNMENT") {
    const [row] = await exec
      .select({
        id: committeeRoleAssignment.id,
        personId: committeeRoleAssignment.personId,
        termId: committeeRoleAssignment.termId,
        committeeId: committee.id,
        name: committee.name,
        status: committee.status,
        endedAt: committeeRoleAssignment.endedAt,
        leftAt: committeeMembership.leftAt,
        memberStatus: membership.status,
        anonymizedAt: person.anonymizedAt,
      })
      .from(committeeRoleAssignment)
      .innerJoin(committee, eq(committee.id, committeeRoleAssignment.committeeId))
      .innerJoin(
        committeeMembership,
        eq(committeeMembership.id, committeeRoleAssignment.membershipId),
      )
      .innerJoin(membership, eq(membership.personId, committeeRoleAssignment.personId))
      .innerJoin(person, eq(person.id, committeeRoleAssignment.personId))
      .where(
        and(
          eq(committeeRoleAssignment.id, source.id),
          eq(committeeRoleAssignment.roleCode, "LOGISTICA"),
        ),
      )
      .limit(1);
    if (!row) return null;
    const current = await getCurrentTerm(now, exec);
    const term = await getTerm(row.termId, exec);
    return {
      kind: source.kind,
      id: row.id,
      personId: row.personId,
      termId: row.termId,
      committeeId: row.committeeId,
      editionId: null,
      label: t("T-4109", { comité: row.name, semestre: term?.code ?? "" }),
      live:
        current?.id === row.termId &&
        row.endedAt === null &&
        row.leftAt === null &&
        row.anonymizedAt === null &&
        row.status !== "INACTIVE" &&
        OPERATING.some((status) => status === row.memberStatus),
    };
  }
  if (source.kind !== "MACROEVENT_APPOINTMENT") return null;
  const [row] = await exec
    .select({
      id: appointment.id,
      personId: appointment.personId,
      termId: appointment.termId,
      editionId: appointment.editionId,
      memberStatus: membership.status,
      anonymizedAt: person.anonymizedAt,
    })
    .from(appointment)
    .innerJoin(membership, eq(membership.personId, appointment.personId))
    .innerJoin(person, eq(person.id, appointment.personId))
    .where(
      and(
        eq(appointment.id, source.id),
        eq(appointment.kind, "MACROEVENT_DIRECTOR"),
        eq(appointment.roleCode, "LOGISTICA"),
      ),
    )
    .limit(1);
  if (!row?.editionId) return null;
  const edition = await getMacroeventEdition(row.editionId, exec);
  const term = await getTerm(row.termId, exec);
  if (!edition || !isMacroeventSlug(edition.eventSlug) || !term) return null;
  const editionTerm = await findTermContaining(dateKeyIn(APP_TIME_ZONE, edition.startsAt), exec);
  return {
    kind: source.kind,
    id: row.id,
    personId: row.personId,
    termId: row.termId,
    committeeId: null,
    editionId: row.editionId,
    label: t("T-4110", { evento: edition.eventName, edición: edition.name, semestre: term.code }),
    live:
      term.endsOn >= todayKey(now) &&
      editionTerm?.id === term.id &&
      row.anonymizedAt === null &&
      OPERATING.some((status) => status === row.memberStatus),
  };
}

/** Fuentes habilitables; la concesión de reservas pertenece a inventario. */
export async function listLogisticsSources(
  personId?: string,
  exec: Executor = getDb(),
  now = new Date(),
): Promise<LogisticsSourceView[]> {
  const committeeRows = await exec
    .select({ id: committeeRoleAssignment.id })
    .from(committeeRoleAssignment)
    .where(
      and(
        eq(committeeRoleAssignment.roleCode, "LOGISTICA"),
        isNull(committeeRoleAssignment.endedAt),
        personId ? eq(committeeRoleAssignment.personId, personId) : undefined,
      ),
    );
  const macroRows = await exec
    .select({ id: appointment.id })
    .from(appointment)
    .where(
      and(
        eq(appointment.kind, "MACROEVENT_DIRECTOR"),
        eq(appointment.roleCode, "LOGISTICA"),
        personId ? eq(appointment.personId, personId) : undefined,
      ),
    );
  const sources: LogisticsSource[] = [
    ...committeeRows.map((row) => ({ kind: "COMMITTEE_ASSIGNMENT" as const, id: row.id })),
    ...macroRows.map((row) => ({ kind: "MACROEVENT_APPOINTMENT" as const, id: row.id })),
  ];
  const result: LogisticsSourceView[] = [];
  for (const source of sources) {
    const resolved = await resolveLogisticsSource(source, exec, now);
    if (resolved?.live) result.push(resolved);
  }
  return result.sort(
    (a, b) => a.label.localeCompare(b.label) || a.personId.localeCompare(b.personId),
  );
}

export interface LogisticsManagerActor extends Actor {
  personId: string;
  isAdmin: boolean;
}
export type LogisticsScope =
  | { kind: "COMMITTEE"; committeeId: string; termId: string }
  | { kind: "MACROEVENT"; editionId: string };
export interface LogisticsDirectorInput {
  personId: string;
  assigned: boolean;
  coDirector?: boolean;
}
const scopeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("COMMITTEE"),
    committeeId: z.string().min(1),
    termId: z.string().min(1),
  }),
  z.strictObject({ kind: z.literal("MACROEVENT"), editionId: z.string().min(1) }),
]);
const directorSchema = z.strictObject({
  personId: z.string().min(1),
  assigned: z.boolean(),
  coDirector: z.boolean().default(false),
});

async function setDirector(
  ctx: CommandContext,
  actor: LogisticsManagerActor,
  scope: LogisticsScope,
  input: z.output<typeof directorSchema>,
  now: Date,
): Promise<{ changed: boolean }> {
  await lockMembershipCycles(ctx.tx, [actor.personId, input.personId]);
  const [operator] = await ctx.tx
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, actor.personId))
    .limit(1);
  if (
    !operator ||
    !OPERATING.some((status) => status === operator.status) ||
    (!actor.isAdmin && !(await hasCurrentVpAdmin(actor.personId, ctx.tx, now)))
  )
    throw new DomainError(t("T-4106"));
  const [member] = await ctx.tx
    .select({ status: membership.status })
    .from(membership)
    .where(eq(membership.personId, input.personId))
    .for("update");
  if (!member) throw new DomainError(t("T-032"));
  if (scope.kind === "MACROEVENT") {
    const edition = await getMacroeventEdition(scope.editionId, ctx.tx);
    const term = edition
      ? await findTermContaining(dateKeyIn(APP_TIME_ZONE, edition.startsAt), ctx.tx)
      : null;
    if (!edition || !isMacroeventSlug(edition.eventSlug) || !term || term.endsOn < todayKey(now))
      throw new DomainError(t("T-4108"));
    const [existing] = await ctx.tx
      .select({ id: appointment.id, coDirector: appointment.coDirector })
      .from(appointment)
      .where(
        and(
          eq(appointment.personId, input.personId),
          eq(appointment.editionId, scope.editionId),
          eq(appointment.kind, "MACROEVENT_DIRECTOR"),
          eq(appointment.roleCode, "LOGISTICA"),
        ),
      )
      .limit(1);
    if (!input.assigned) {
      if (!existing) return { changed: false };
      await removeAppointment(ctx, existing.id, { editionId: scope.editionId });
      return { changed: true };
    }
    if (existing?.coDirector === input.coDirector) return { changed: false };
    // Cambiar titular/codirección conserva la atomicidad y las inhabilidades del comando existente.
    if (existing) await removeAppointment(ctx, existing.id, { editionId: scope.editionId });
    await addMacroeventDirector(ctx, {
      editionId: edition.id,
      termId: term.id,
      personId: input.personId,
      roleCode: "LOGISTICA",
      coDirector: input.coDirector,
    });
    return { changed: true };
  }
  const current = await getCurrentTerm(now, ctx.tx);
  const [group] = await ctx.tx
    .select({ status: committee.status })
    .from(committee)
    .where(eq(committee.id, scope.committeeId));
  if (!current || scope.termId !== current.id || !group || group.status === "INACTIVE")
    throw new DomainError(t("T-4108"));
  const [entry] = await ctx.tx
    .select({
      id: committeeMembership.id,
      personId: committeeMembership.personId,
      committeeId: committeeMembership.committeeId,
      termId: committeeMembership.termId,
    })
    .from(committeeMembership)
    .where(
      and(
        eq(committeeMembership.personId, input.personId),
        eq(committeeMembership.committeeId, scope.committeeId),
        eq(committeeMembership.termId, scope.termId),
        isNull(committeeMembership.leftAt),
      ),
    )
    .limit(1);
  if (!entry) throw new DomainError(t("T-2173"), "personId");
  if (input.assigned && member.status !== "ACTIVE") throw new DomainError(t("T-2173"), "personId");
  const roles = (await listLiveRolesByMembership(ctx.tx, [entry.id])).get(entry.id) ?? [];
  const wanted = roles
    .filter((role) => role.roleCode !== "LOGISTICA")
    .map(({ roleCode, coDirector }) => ({ roleCode, coDirector }));
  if (input.assigned) wanted.push({ roleCode: "LOGISTICA", coDirector: input.coDirector });
  await assertNoInhabilities(ctx, {
    personId: input.personId,
    termId: scope.termId,
    replacing: [{ kind: "COMMITTEE", scopeId: scope.committeeId }],
    wanted: await leadershipRolesOf(ctx.tx, scope.committeeId, wanted),
    now,
  });
  const change = await replaceRoles(ctx.tx, entry, wanted, now);
  if (!change.changed) return { changed: false };
  await ctx.audit({
    action: "committee-roles.set",
    entityType: "person",
    entityId: input.personId,
    before: { committeeId: scope.committeeId, termId: scope.termId, roles: change.before },
    after: { committeeId: scope.committeeId, termId: scope.termId, roles: change.after },
  });
  await ctx.emit(
    eventOf(committeeMembershipChanged, {
      actorId: ctx.actor.personId,
      personId: input.personId,
      termId: scope.termId,
      committees: await liveCommitteesPayload(ctx.tx, input.personId, scope.termId),
    }),
  );
  return { changed: true };
}

/** Solo cambia LOGISTICA; nunca concede DIRECTION ni permite modificar otros cargos. */
export function setLogisticsDirectorAs(
  actor: LogisticsManagerActor,
  scope: LogisticsScope,
  input: LogisticsDirectorInput,
): Promise<{ changed: boolean }> {
  const parsedScope = scopeSchema.safeParse(scope);
  const parsedInput = directorSchema.safeParse(input);
  if (!parsedScope.success || !parsedInput.success)
    return Promise.reject(new DomainError(t("T-4107")));
  return runCommand(actor, (ctx) =>
    setDirector(ctx, actor, parsedScope.data, parsedInput.data, new Date()),
  );
}
