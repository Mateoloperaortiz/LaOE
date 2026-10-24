import { and, asc, count, eq, ilike, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { isUniqueViolation } from "@/db/errors";
import { type Actor, type CommandContext, type Executor, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { permanenceRecompute, workGroupMembershipChanged } from "@/domain-events/permanence";
import {
  findMembersByEmails,
  getPeopleByIds,
  listAppointmentsForTerm,
  listCommitteesByIds,
  listMembershipStatuses,
  listTermRoster,
} from "@/modules/people";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { MAX_INPUT_COLLECTION_ITEMS } from "@/shared/lib/input-collections";
import { workGroup, workGroupEvaluator, workGroupMembership } from "../schema";
import { resolveGroupEvent } from "./group-links";
import { parseGroupCsv } from "./groups-pure";
import { GROUP_CODE, WORK_GROUP_KINDS } from "./params";

// Grupos de trabajo (ADR-036 regla 6): comandos, siembra de los comités de trabajo, lecturas del
// admin, importación desde CSV y los roles derivados de los datos.

export interface GroupRef {
  id: string;
  name: string;
  kind: (typeof workGroup.$inferSelect)["kind"];
  code: string | null;
}

export interface MyGroupRoles {
  /** Grupos que la persona lidera en el término. */
  leads: GroupRef[];
  /** Grupos que la persona evalúa en el término. */
  evaluates: GroupRef[];
}

/** Roles derivados de los datos (no permisos técnicos): líder o evaluador de grupos del término. */
export async function listMyGroupRoles(personId: string, termId: string): Promise<MyGroupRoles> {
  const db = getDb();
  const columns = {
    id: workGroup.id,
    name: workGroup.name,
    kind: workGroup.kind,
    code: workGroup.code,
  };
  const leads = await db
    .select(columns)
    .from(workGroup)
    .where(and(eq(workGroup.termId, termId), eq(workGroup.leaderPersonId, personId)))
    .orderBy(asc(workGroup.name));
  const evaluatorRows = await db
    .select({ groupId: workGroupEvaluator.groupId })
    .from(workGroupEvaluator)
    .where(eq(workGroupEvaluator.personId, personId));
  const evaluates =
    evaluatorRows.length === 0
      ? []
      : await db
          .select(columns)
          .from(workGroup)
          .where(
            and(
              eq(workGroup.termId, termId),
              inArray(
                workGroup.id,
                evaluatorRows.map((row) => row.groupId),
              ),
            ),
          )
          .orderBy(asc(workGroup.name));
  return { leads, evaluates };
}

// ── Comandos (F4-T4) ──────────────────────────────────────────────────────────────────────────

const blankToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;
const optionalId = z.preprocess(blankToUndefined, z.string().min(1).optional());

export const groupInputSchema = z.object({
  termId: z.string().min(1),
  kind: z.enum(WORK_GROUP_KINDS),
  name: z.string().trim().min(2).max(120),
  code: z.preprocess(
    blankToUndefined,
    z.string().trim().toUpperCase().regex(GROUP_CODE).optional(),
  ),
  editionId: optionalId,
  eventId: optionalId,
  leaderPersonId: optionalId,
});
export type GroupInput = z.infer<typeof groupInputSchema>;

export type WorkGroupRow = typeof workGroup.$inferSelect;

export interface GroupListRow extends WorkGroupRow {
  leaderName: string;
  members: number;
  evaluators: number;
  pending: number;
}

export interface GroupMemberView {
  personId: string;
  name: string;
  joinedAt: Date;
  leftAt: Date | null;
  areas: string[];
  evaluation: "PENDING" | "GOOD" | "INSUFFICIENT";
  evaluatedById: string | null;
  evaluatedByName: string;
  evaluatedAt: Date | null;
  note: string | null;
  /** Comités vivos de la persona en el término del grupo (T-749). */
  committees: string[];
}

export interface GroupDetail {
  group: WorkGroupRow;
  leaderName: string;
  evaluators: Array<{ personId: string; name: string }>;
  members: GroupMemberView[];
}

function recompute(ctx: CommandContext, termId: string, personId: string) {
  return ctx.emit(
    eventOf(
      permanenceRecompute,
      { termId, personId },
      { dedupeKey: `permanence:${termId}:${personId}` },
    ),
  );
}

function toValues(input: GroupInput) {
  return {
    termId: input.termId,
    kind: input.kind,
    name: input.name,
    code: input.code ?? null,
    editionId: input.editionId ?? null,
    eventId: input.eventId ?? null,
    leaderPersonId: input.leaderPersonId ?? null,
  };
}

export async function createGroup(ctx: CommandContext, input: GroupInput): Promise<{ id: string }> {
  input = { ...input, eventId: await resolveGroupEvent(ctx, input) };
  try {
    const [row] = await ctx.tx
      .insert(workGroup)
      .values({ ...toValues(input), createdById: ctx.actor.personId })
      .returning({ id: workGroup.id });
    if (!row) {
      throw new Error("sin grupo");
    }
    await ctx.audit({
      action: "work-group.created",
      entityType: "work_group",
      entityId: row.id,
      after: toValues(input),
    });
    return row;
  } catch (error) {
    if (
      isUniqueViolation(error, "work_group_macroevent_term_unique") ||
      isUniqueViolation(error, "work_group_gap_macroevent_term_unique")
    ) {
      throw new DomainError(t("T-2352"));
    }
    if (isUniqueViolation(error, "work_group_code_unique")) {
      throw new DomainError(t("T-758"), "code");
    }
    throw error;
  }
}

export async function updateGroup(
  ctx: CommandContext,
  id: string,
  input: GroupInput,
): Promise<void> {
  const [before] = await ctx.tx.select().from(workGroup).where(eq(workGroup.id, id));
  if (!before) {
    throw new DomainError(t("T-032"));
  }
  input = {
    ...input,
    eventId: await resolveGroupEvent(ctx, {
      ...input,
      eventId: input.eventId ?? (input.editionId ? undefined : (before.eventId ?? undefined)),
    }),
  };
  try {
    await ctx.tx
      .update(workGroup)
      .set({ ...toValues(input), termId: before.termId })
      .where(eq(workGroup.id, id));
  } catch (error) {
    if (
      isUniqueViolation(error, "work_group_macroevent_term_unique") ||
      isUniqueViolation(error, "work_group_gap_macroevent_term_unique")
    ) {
      throw new DomainError(t("T-2352"));
    }
    if (isUniqueViolation(error, "work_group_code_unique")) {
      throw new DomainError(t("T-758"), "code");
    }
    throw error;
  }
  await ctx.audit({
    action: "work-group.updated",
    entityType: "work_group",
    entityId: id,
    before: { name: before.name, code: before.code, leaderPersonId: before.leaderPersonId },
    after: toValues(input),
  });
}

export const evaluatorIdsSchema = z
  .array(z.string().regex(/^[a-z0-9-]{10,40}$/))
  .max(MAX_INPUT_COLLECTION_ITEMS, { message: t("T-260") });

/** Reemplaza el conjunto de evaluadores del grupo. */
export async function setEvaluators(
  ctx: CommandContext,
  groupId: string,
  personIds: string[],
): Promise<void> {
  const parsed = evaluatorIdsSchema.safeParse(personIds);
  if (!parsed.success) throw new DomainError(t("T-260"));
  const wanted = [...new Set(parsed.data)];
  await ctx.tx.delete(workGroupEvaluator).where(eq(workGroupEvaluator.groupId, groupId));
  if (wanted.length > 0) {
    await ctx.tx
      .insert(workGroupEvaluator)
      .values(wanted.map((personId) => ({ groupId, personId })));
  }
  await ctx.audit({
    action: "work-group.evaluators-set",
    entityType: "work_group",
    entityId: groupId,
    after: { personIds: wanted },
  });
}

/** Tope de comités de trabajo por persona y término (Est. art. 4 par. 3). */
const MAX_WORK_COMMITTEES = 2;

export interface AddMembersContext {
  /** Estado de membresía de cada persona, leído en el wrapper: solo entran activos (T-752). */
  statuses: Map<string, { name: string; status: string }>;
}

/**
 * Por qué una persona no puede entrar al grupo, o `null` si puede: solo activos (T-752) y, en un comité
 * de trabajo, el tope por persona y término (T-2284). Es la misma comprobación para quien agrega y para
 * quien pregunta antes de aceptar una inscripción (ADR-116 regla 7).
 */
async function joinBlocker(
  exec: Executor,
  group: WorkGroupRow,
  personId: string,
  person: { name: string; status: string } | undefined,
): Promise<string | null> {
  if (!person || person.status !== "ACTIVE") {
    return t("T-752", { nombre: person?.name ?? personId });
  }
  // Nadie pertenece a más de dos comités de trabajo en un término (Est. art. 4 par. 3; ADR-060 regla 11).
  if (group.kind === "WORK_COMMITTEE") {
    const [others] = await exec
      .select({ n: count() })
      .from(workGroupMembership)
      .innerJoin(workGroup, eq(workGroup.id, workGroupMembership.groupId))
      .where(
        and(
          eq(workGroupMembership.personId, personId),
          isNull(workGroupMembership.leftAt),
          eq(workGroup.termId, group.termId),
          eq(workGroup.kind, "WORK_COMMITTEE"),
          ne(workGroup.id, group.id),
        ),
      );
    if ((others?.n ?? 0) >= MAX_WORK_COMMITTEES) {
      return t("T-2284", { nombre: person.name });
    }
  }
  return null;
}

/**
 * Lo que responde permanence cuando crm pregunta, antes de aceptar una inscripción, si el grupo de la
 * convocatoria admite a la persona (ADR-037 regla 10; ADR-116 regla 7): el motivo, o `null` si entra.
 * Es una lectura: quien de verdad decide es `addMembers`, cuando corre el trabajo que la agrega.
 */
export async function groupJoinBlocker(groupId: string, personId: string): Promise<string | null> {
  const group = await getGroup(groupId);
  if (!group) {
    return t("T-032");
  }
  const ref = (await listMembershipStatuses([personId])).get(personId);
  return joinBlocker(
    getDb(),
    group,
    personId,
    ref ? { name: ref.fullName, status: ref.status } : undefined,
  );
}

export interface AddMembersResult {
  /** Cuántas personas entraron: las nuevas y las que volvieron. */
  added: number;
  /** Quienes volvieron después de haber salido: su evaluación quedó pendiente otra vez (ADR-116 regla 5). */
  returned: string[];
  /** Quienes ya estaban en el grupo: no cambió nada. */
  already: string[];
}

/**
 * Agrega personas al grupo (idempotente: quien ya está, se queda). Quien había salido vuelve a su misma
 * pertenencia, con la fecha de ingreso que tenía y pendiente de una evaluación nueva; la anterior queda
 * en la auditoría (ADR-116 regla 5). Dice cuántas entraron, quiénes volvieron y quiénes ya estaban.
 */
export async function addMembers(
  ctx: CommandContext,
  groupId: string,
  personIds: string[],
  context: AddMembersContext,
): Promise<AddMembersResult> {
  const [group] = await ctx.tx.select().from(workGroup).where(eq(workGroup.id, groupId));
  if (!group) {
    throw new DomainError(t("T-032"));
  }
  const result: AddMembersResult = { added: 0, returned: [], already: [] };
  const joined = async (personId: string) => {
    result.added += 1;
    await ctx.emit(
      eventOf(workGroupMembershipChanged, {
        actorId: ctx.actor.personId,
        personId,
        termId: group.termId,
        groupId,
        groupName: group.name,
        kind: group.kind,
        change: "JOINED",
      }),
    );
    await recompute(ctx, group.termId, personId);
  };
  // En orden de id: dos altas con las mismas personas toman sus candados en el mismo orden.
  for (const personId of [...new Set(personIds)].sort()) {
    // Contar y escribir bajo el mismo candado: dos altas a la vez de la misma persona se esperan.
    if (group.kind === "WORK_COMMITTEE") {
      await ctx.tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`work-committees:${group.termId}:${personId}`}, 0))`,
      );
    }
    const blocker = await joinBlocker(ctx.tx, group, personId, context.statuses.get(personId));
    if (blocker) {
      throw new DomainError(blocker);
    }
    const [row] = await ctx.tx
      .insert(workGroupMembership)
      .values({ groupId, personId })
      .onConflictDoNothing()
      .returning({ id: workGroupMembership.id });
    if (row) {
      await ctx.audit({
        action: "work-group.member-added",
        entityType: "work_group_membership",
        entityId: row.id,
        after: { groupId, personId },
      });
      await joined(personId);
      continue;
    }
    // Ya tiene fila en el grupo (el índice único es por grupo y persona): se toma, y si había salido
    // vuelve a esa misma pertenencia. Una segunda alta a la vez espera acá y la encuentra viva.
    const [existing] = await ctx.tx
      .select()
      .from(workGroupMembership)
      .where(
        and(eq(workGroupMembership.groupId, groupId), eq(workGroupMembership.personId, personId)),
      )
      .for("update");
    if (!existing || existing.leftAt === null) {
      result.already.push(personId);
      continue;
    }
    await ctx.tx
      .update(workGroupMembership)
      .set({
        leftAt: null,
        evaluation: "PENDING",
        evaluatedAt: null,
        evaluatedById: null,
        note: null,
      })
      .where(eq(workGroupMembership.id, existing.id));
    result.returned.push(personId);
    await ctx.audit({
      action: "work-group.member-returned",
      entityType: "work_group_membership",
      entityId: existing.id,
      before: {
        leftAt: existing.leftAt,
        evaluation: existing.evaluation,
        evaluatedById: existing.evaluatedById,
        evaluatedAt: existing.evaluatedAt,
        note: existing.note,
      },
      after: { groupId, personId, evaluation: "PENDING" },
    });
    await joined(personId);
  }
  return result;
}

export async function removeMember(
  ctx: CommandContext,
  groupId: string,
  personId: string,
  now = new Date(),
): Promise<boolean> {
  const [group] = await ctx.tx.select().from(workGroup).where(eq(workGroup.id, groupId));
  if (!group) {
    throw new DomainError(t("T-032"));
  }
  const [row] = await ctx.tx
    .update(workGroupMembership)
    .set({ leftAt: now })
    .where(
      and(
        eq(workGroupMembership.groupId, groupId),
        eq(workGroupMembership.personId, personId),
        isNull(workGroupMembership.leftAt),
      ),
    )
    .returning({ id: workGroupMembership.id });
  if (!row) {
    return false;
  }
  await ctx.audit({
    action: "work-group.member-removed",
    entityType: "work_group_membership",
    entityId: row.id,
    after: { groupId, personId },
  });
  await ctx.emit(
    eventOf(workGroupMembershipChanged, {
      actorId: ctx.actor.personId,
      personId,
      termId: group.termId,
      groupId,
      groupName: group.name,
      kind: group.kind,
      change: "LEFT",
    }),
  );
  await recompute(ctx, group.termId, personId);
  return true;
}

/** Los siete comités de trabajo por código (12-permanencia), con el líder que da su cargo de junta. */
export const WORK_COMMITTEES: ReadonlyArray<{
  code: string;
  name: string;
  leaderKind: string | null;
}> = [
  { code: "CAP", name: "Comité de Acompañamiento Presidencial", leaderKind: "PRESIDENT" },
  { code: "CGH", name: "Comité de Gestión Humana", leaderKind: "VP_GH" },
  { code: "CCM", name: "Comité de Creatividad y Mercadeo", leaderKind: "VP_PUBLIC_RELATIONS" },
  { code: "CAE", name: "Comité de Alianzas Estratégicas", leaderKind: "VP_PUBLIC_RELATIONS" },
  { code: "CML", name: "Comité de Mejoramiento Logístico", leaderKind: "VP_ADMIN" },
  { code: "CAF", name: "Comité de Acompañamiento Financiero", leaderKind: "VP_FINANCE" },
  { code: "ATHLETIC", name: "Equipo deportivo Athletic OE", leaderKind: null },
];

/** Siembra los comités de trabajo que falten en el término; devuelve cuántos creó. */
export async function seedWorkCommittees(
  ctx: CommandContext,
  termId: string,
  appointments: ReadonlyArray<{ personId: string; kind: string }>,
): Promise<number> {
  const existing = new Set(
    (
      await ctx.tx
        .select({ code: workGroup.code })
        .from(workGroup)
        .where(and(eq(workGroup.termId, termId), eq(workGroup.kind, "WORK_COMMITTEE")))
    ).map((row) => row.code),
  );
  let created = 0;
  for (const item of WORK_COMMITTEES) {
    if (existing.has(item.code)) {
      continue;
    }
    const leader = item.leaderKind
      ? (appointments.find((a) => a.kind === item.leaderKind)?.personId ?? null)
      : null;
    await createGroup(ctx, {
      termId,
      kind: "WORK_COMMITTEE",
      name: item.name,
      code: item.code,
      leaderPersonId: leader ?? undefined,
    });
    created += 1;
  }
  return created;
}

// ── Lecturas para el admin (F4-T4) ────────────────────────────────────────────────────────────

export interface GroupListParams {
  q: string;
  termId: string | undefined;
  kind: string | undefined;
  page: number;
  pageSize: number;
}

export async function listGroups(
  params: GroupListParams,
): Promise<{ rows: GroupListRow[]; total: number }> {
  const db = getDb();
  const where = and(
    params.termId ? eq(workGroup.termId, params.termId) : undefined,
    params.kind && (WORK_GROUP_KINDS as readonly string[]).includes(params.kind)
      ? eq(workGroup.kind, params.kind as (typeof WORK_GROUP_KINDS)[number])
      : undefined,
    params.q ? ilike(workGroup.name, `%${params.q}%`) : undefined,
  );
  const [rows, [total]] = [
    await db
      .select()
      .from(workGroup)
      .where(where)
      .orderBy(asc(workGroup.kind), asc(workGroup.name))
      .limit(params.pageSize)
      .offset((params.page - 1) * params.pageSize),
    await db.select({ n: count() }).from(workGroup).where(where),
  ];
  if (rows.length === 0) {
    return { rows: [], total: total?.n ?? 0 };
  }
  const ids = rows.map((row) => row.id);
  const members = await db
    .select({
      groupId: workGroupMembership.groupId,
      total: count(),
      pending: sql<number>`count(*) filter (where ${workGroupMembership.evaluation} = 'PENDING' and ${workGroupMembership.leftAt} is null)`,
    })
    .from(workGroupMembership)
    .where(and(inArray(workGroupMembership.groupId, ids), isNull(workGroupMembership.leftAt)))
    .groupBy(workGroupMembership.groupId);
  const evaluators = await db
    .select({ groupId: workGroupEvaluator.groupId, total: count() })
    .from(workGroupEvaluator)
    .where(inArray(workGroupEvaluator.groupId, ids))
    .groupBy(workGroupEvaluator.groupId);
  const leaders = await getPeopleByIds(
    rows.map((row) => row.leaderPersonId).filter((id): id is string => id !== null),
  );
  const memberCounts = new Map(members.map((row) => [row.groupId, row]));
  const evaluatorCounts = new Map(evaluators.map((row) => [row.groupId, row.total]));
  return {
    rows: rows.map((row) => ({
      ...row,
      leaderName: row.leaderPersonId ? (leaders.get(row.leaderPersonId)?.fullName ?? "") : "",
      members: memberCounts.get(row.id)?.total ?? 0,
      pending: Number(memberCounts.get(row.id)?.pending ?? 0),
      evaluators: evaluatorCounts.get(row.id) ?? 0,
    })),
    total: total?.n ?? 0,
  };
}

export async function getGroup(id: string): Promise<WorkGroupRow | null> {
  const [row] = await getDb().select().from(workGroup).where(eq(workGroup.id, id)).limit(1);
  return row ?? null;
}

export async function getGroupDetail(id: string): Promise<GroupDetail | null> {
  const group = await getGroup(id);
  if (!group) {
    return null;
  }
  const db = getDb();
  const evaluatorRows = await db
    .select({ personId: workGroupEvaluator.personId })
    .from(workGroupEvaluator)
    .where(eq(workGroupEvaluator.groupId, id));
  const memberRows = await db
    .select()
    .from(workGroupMembership)
    .where(eq(workGroupMembership.groupId, id))
    .orderBy(asc(workGroupMembership.joinedAt));
  const ids = new Set<string>();
  for (const row of evaluatorRows) ids.add(row.personId);
  for (const row of memberRows) {
    ids.add(row.personId);
    if (row.evaluatedById) ids.add(row.evaluatedById);
  }
  if (group.leaderPersonId) ids.add(group.leaderPersonId);
  const people = await getPeopleByIds([...ids]);
  const name = (personId: string | null) =>
    personId ? (people.get(personId)?.fullName ?? "") : "";
  const memberIds = memberRows.map((row) => row.personId);
  const roster = memberIds.length > 0 ? await listTermRoster(group.termId, memberIds) : [];
  const committeeNames = new Map(
    (await listCommitteesByIds([...new Set(roster.map((row) => row.committeeId))])).map((c) => [
      c.id,
      c.name,
    ]),
  );
  const committeesOf = (personId: string) =>
    roster
      .filter((row) => row.personId === personId && row.leftAt === null)
      .map((row) => committeeNames.get(row.committeeId) ?? "")
      .filter((value) => value !== "")
      .sort((a, b) => a.localeCompare(b, "es"));
  return {
    group,
    leaderName: name(group.leaderPersonId),
    evaluators: evaluatorRows.map((row) => ({ personId: row.personId, name: name(row.personId) })),
    members: memberRows.map((row) => ({
      personId: row.personId,
      name: name(row.personId),
      joinedAt: row.joinedAt,
      leftAt: row.leftAt,
      areas: row.areas,
      evaluation: row.evaluation,
      evaluatedById: row.evaluatedById,
      evaluatedByName: name(row.evaluatedById),
      evaluatedAt: row.evaluatedAt,
      note: row.note,
      committees: committeesOf(row.personId),
    })),
  };
}

// ── Importación de miembros desde un CSV de correos ──────────────────────────────────────────

export interface ImportPreviewRow {
  email: string;
  personId: string | null;
  name: string;
  outcome: "ADD" | "ALREADY" | "INACTIVE" | "UNKNOWN";
}

export interface ImportPreview {
  rows: ImportPreviewRow[];
  add: number;
  already: number;
  inactive: number;
  unknown: number;
}

/** Lee el CSV (columna CORREO), cruza con el roster y clasifica cada fila; no escribe nada. */
export async function previewMemberImport(
  groupId: string,
  csvText: string,
): Promise<ImportPreview> {
  const emails = parseGroupCsv(csvText);
  if (emails.length === 0) {
    throw new DomainError(t("T-755"));
  }
  const detail = await getGroupDetail(groupId);
  if (!detail) {
    throw new DomainError(t("T-032"));
  }
  const current = new Set(
    detail.members.filter((member) => member.leftAt === null).map((member) => member.personId),
  );
  const found = await findMembersByEmails(emails);
  const rows: ImportPreviewRow[] = emails.map((email) => {
    const person = found.get(email);
    if (!person) {
      return { email, personId: null, name: "", outcome: "UNKNOWN" };
    }
    if (current.has(person.id)) {
      return { email, personId: person.id, name: person.fullName, outcome: "ALREADY" };
    }
    if (person.status !== "ACTIVE") {
      return { email, personId: person.id, name: person.fullName, outcome: "INACTIVE" };
    }
    return { email, personId: person.id, name: person.fullName, outcome: "ADD" };
  });
  return {
    rows,
    add: rows.filter((row) => row.outcome === "ADD").length,
    already: rows.filter((row) => row.outcome === "ALREADY").length,
    inactive: rows.filter((row) => row.outcome === "INACTIVE").length,
    unknown: rows.filter((row) => row.outcome === "UNKNOWN").length,
  };
}

// ── Wrappers ─────────────────────────────────────────────────────────────────────────────────

export function createGroupAs(actor: Actor, input: GroupInput) {
  return runCommand(actor, (ctx) => createGroup(ctx, input));
}

export function updateGroupAs(actor: Actor, id: string, input: GroupInput) {
  return runCommand(actor, (ctx) => updateGroup(ctx, id, input));
}

export function setEvaluatorsAs(actor: Actor, groupId: string, personIds: string[]) {
  return runCommand(actor, (ctx) => setEvaluators(ctx, groupId, personIds));
}

export async function addMembersAs(actor: Actor, groupId: string, personIds: string[]) {
  const refs = await listMembershipStatuses(personIds);
  const statuses = new Map(
    [...refs].map(([id, ref]) => [id, { name: ref.fullName, status: ref.status }]),
  );
  return runCommand(actor, (ctx) => addMembers(ctx, groupId, personIds, { statuses }));
}

export function removeMemberAs(actor: Actor, groupId: string, personId: string) {
  return runCommand(actor, (ctx) => removeMember(ctx, groupId, personId));
}

/** Aplica la vista previa: solo las filas ADD. Devuelve la vista con lo que de verdad entró. */
export async function applyMemberImportAs(actor: Actor, groupId: string, csvText: string) {
  const preview = await previewMemberImport(groupId, csvText);
  const ids = preview.rows
    .filter((row) => row.outcome === "ADD")
    .map((row) => row.personId)
    .filter((id): id is string => id !== null);
  if (ids.length === 0) {
    return { ...preview, added: 0 };
  }
  const result = await addMembersAs(actor, groupId, ids);
  // Quien entró por otro lado entre la vista previa y el clic ya estaba: la pantalla lo dice así.
  const already = new Set(result.already);
  const rows = preview.rows.map((row) =>
    row.personId !== null && already.has(row.personId)
      ? { ...row, outcome: "ALREADY" as const }
      : row,
  );
  return {
    ...preview,
    rows,
    add: rows.filter((row) => row.outcome === "ADD").length,
    already: rows.filter((row) => row.outcome === "ALREADY").length,
    added: result.added,
  };
}

export async function seedWorkCommitteesAs(actor: Actor, termId: string): Promise<number> {
  const appointments = await listAppointmentsForTerm(termId);
  return runCommand(actor, (ctx) => seedWorkCommittees(ctx, termId, appointments));
}

// Lecturas para las convocatorias internas (ADR-037 regla 10): crm no importa permanence, así que la
// capa de la app compone con estas referencias.

export async function listGroupRefs(ids: string[]): Promise<Map<string, GroupRef>> {
  const map = new Map<string, GroupRef>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await getDb()
    .select({ id: workGroup.id, name: workGroup.name, kind: workGroup.kind, code: workGroup.code })
    .from(workGroup)
    .where(inArray(workGroup.id, ids));
  for (const row of rows) {
    map.set(row.id, row);
  }
  return map;
}

/** Grupos de un término (o de todos) como opciones "código o nombre" para el kit de convocatorias. */
export async function listGroupOptions(
  termId?: string,
): Promise<Array<GroupRef & { termId: string }>> {
  return getDb()
    .select({
      id: workGroup.id,
      name: workGroup.name,
      kind: workGroup.kind,
      code: workGroup.code,
      termId: workGroup.termId,
    })
    .from(workGroup)
    .where(termId ? eq(workGroup.termId, termId) : undefined)
    .orderBy(asc(workGroup.name));
}

/** Ids de los grupos en los que la persona está viva (para no ofrecerle su propia convocatoria). */
export async function listGroupIdsOf(personId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ groupId: workGroupMembership.groupId })
    .from(workGroupMembership)
    .where(and(eq(workGroupMembership.personId, personId), isNull(workGroupMembership.leftAt)));
  return rows.map((row) => row.groupId);
}

/** Términos en los que la persona perteneció a un comité de trabajo (Regl. art. 23.5; ADR-060 regla 13). */
export async function listWorkCommitteeTermIds(personId: string): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ termId: workGroup.termId })
    .from(workGroupMembership)
    .innerJoin(workGroup, eq(workGroup.id, workGroupMembership.groupId))
    .where(and(eq(workGroupMembership.personId, personId), eq(workGroup.kind, "WORK_COMMITTEE")));
  return rows.map((row) => row.termId);
}
