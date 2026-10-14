import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { type Executor, runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { checkinApproved, scoreRecompute } from "@/domain-events/participation";
import {
  evaluationRecorded,
  permanenceRecompute,
  workGroupMembershipChanged,
} from "@/domain-events/permanence";
import { permission } from "@/modules/identity/schema";
import { creditCheckIn } from "@/modules/participation/domain/ledger";
import { newPublicId } from "@/modules/participation/domain/public-id-pure";
import { checkIn, occasion, pointEntry } from "@/modules/participation/schema";
import { membership, person } from "@/modules/people/schema";
import { createGroup } from "@/modules/permanence/domain/groups";
import { createRule } from "@/modules/permanence/domain/rules";
import {
  permanenceRule,
  permanenceTable,
  workGroup,
  workGroupMembership,
} from "@/modules/permanence/schema";
import { createImportJob, updateImportJob } from "@/modules/system/domain/imports";
import { lockOpenTermPoints } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { t } from "@/shared/copy";
import {
  categoryFor,
  dayWindow,
  evidenceGroup,
  GhImportError,
  type GhManifest,
  type GhSnapshot,
  kindFor,
  legacyKey,
  planGhImport,
  pointsFor,
} from "./ghpoints-plan";

/** La consulta y la escritura comparten el mismo recorte del término y de las personas. */
export async function readGhSnapshot(
  db: Executor,
  manifest: GhManifest,
  environment: string,
): Promise<GhSnapshot> {
  const terms = await db
    .select({
      id: term.id,
      code: term.code,
      starts_on: term.startsOn,
      ends_on: term.endsOn,
      points_closed_at: term.pointsClosedAt,
      permanence_closed_at: term.permanenceClosedAt,
    })
    .from(term)
    .where(eq(term.code, manifest.termCode));
  const selected = terms[0];
  if (!selected) throw new GhImportError("No existe el término del lote");
  const emails = [
    ...new Set(manifest.activities.flatMap((a) => a.participants.map((p) => p.email))),
  ];
  const people = await db
    .select({
      id: person.id,
      email: person.email,
      full_name: person.fullName,
      stage: person.stage,
      anonymized_at: person.anonymizedAt,
      status: membership.status,
      first_term_id: membership.firstTermId,
    })
    .from(person)
    .leftJoin(membership, eq(membership.personId, person.id))
    .where(inArray(person.email, emails));
  const ids = people.map((p) => p.id);
  const occasions = await db
    .select({
      id: occasion.id,
      legacy_id: occasion.legacyId,
      title: occasion.title,
      kind: occasion.kind,
      assembly_kind: occasion.assemblyKind,
      category: occasion.category,
      new_members_only: occasion.newMembersOnly,
      status: occasion.status,
      points: occasion.points,
      starts_at: occasion.startsAt,
      ends_at: occasion.endsAt,
    })
    .from(occasion)
    .where(eq(occasion.termId, selected.id));
  const checkIns = ids.length
    ? await db
        .select({
          id: checkIn.id,
          occasion_id: checkIn.occasionId,
          person_id: checkIn.personId,
          status: checkIn.status,
        })
        .from(checkIn)
        .innerJoin(occasion, eq(occasion.id, checkIn.occasionId))
        .where(and(eq(occasion.termId, selected.id), inArray(checkIn.personId, ids)))
    : [];
  const entries = ids.length
    ? await db
        .select({
          id: pointEntry.id,
          person_id: pointEntry.personId,
          check_in_id: pointEntry.checkInId,
          kind: pointEntry.kind,
          points: pointEntry.points,
          reason: pointEntry.reason,
          reversal_of_id: pointEntry.reversalOfId,
        })
        .from(pointEntry)
        .where(and(eq(pointEntry.termId, selected.id), inArray(pointEntry.personId, ids)))
    : [];
  const groups = await db
    .select({ id: workGroup.id, code: workGroup.code, name: workGroup.name, kind: workGroup.kind })
    .from(workGroup)
    .where(eq(workGroup.termId, selected.id));
  const groupMemberships = ids.length
    ? await db
        .select({
          id: workGroupMembership.id,
          group_id: workGroupMembership.groupId,
          person_id: workGroupMembership.personId,
          evaluation: workGroupMembership.evaluation,
          left_at: workGroupMembership.leftAt,
        })
        .from(workGroupMembership)
        .innerJoin(workGroup, eq(workGroup.id, workGroupMembership.groupId))
        .where(and(eq(workGroup.termId, selected.id), inArray(workGroupMembership.personId, ids)))
    : [];
  const rules = await db
    .select({
      id: permanenceRule.id,
      key: permanenceRule.key,
      weight: permanenceRule.weight,
      computation: permanenceRule.computation,
      params: permanenceRule.params,
      applies_to: permanenceRule.appliesTo,
    })
    .from(permanenceRule)
    .where(and(eq(permanenceRule.termId, selected.id), eq(permanenceRule.scope, "GENERAL")));
  const [table] = await db
    .select({ lockedAt: permanenceTable.lockedAt })
    .from(permanenceTable)
    .where(and(eq(permanenceTable.termId, selected.id), eq(permanenceTable.scope, "GENERAL")));
  return {
    queriedAt: new Date().toISOString(),
    environment,
    terms: terms.map((t) => ({
      ...t,
      points_closed_at: t.points_closed_at?.toISOString() ?? null,
      permanence_closed_at: t.permanence_closed_at?.toISOString() ?? null,
    })),
    people: people.map((p) => ({ ...p, anonymized_at: p.anonymized_at?.toISOString() ?? null })),
    occasions: occasions.map((o) => ({
      ...o,
      starts_at: o.starts_at.toISOString(),
      ends_at: o.ends_at?.toISOString() ?? null,
    })),
    checkIns,
    entries,
    groups,
    groupMemberships: groupMemberships.map((g) => ({
      ...g,
      left_at: g.left_at?.toISOString() ?? null,
    })),
    rules,
    generalTableLocked: Boolean(table?.lockedAt),
  };
}

export async function previewGhImport(manifest: GhManifest, environment: string) {
  return getDb().transaction(
    async (tx) => planGhImport(manifest, await readGhSnapshot(tx, manifest, environment)),
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

export async function requireGhImportAdmin(db: Executor, actorId: string) {
  const [admin] = await db
    .select({ id: person.id })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .innerJoin(permission, eq(permission.personId, person.id))
    .where(
      and(
        eq(person.id, actorId),
        eq(person.stage, "MEMBER"),
        isNull(person.anonymizedAt),
        inArray(membership.status, ["ACTIVE", "HONORARY"]),
        eq(permission.code, "ADMIN"),
      ),
    );
  if (!admin) throw new GhImportError("La carga necesita un ADMIN vigente");
}

export interface GhApplyOptions {
  actorId: string;
  environment: string;
  planHash: string;
  skipBlocked: boolean;
  /** Objetos cuya integridad ya verificó y subió el CLI al bucket privado. */
  evidenceKeys: Record<string, string>;
  manifestKey: string;
}

/** Importación administrativa histórica. Ninguna escritura se hace durante la vista previa. */
export async function applyGhImport(manifest: GhManifest, options: GhApplyOptions) {
  // Un script no tiene request: el ADMIN que lo corre va sin IP.
  return runCommand({ personId: options.actorId, ip: null }, async (ctx) => {
    // Lote administrativo acotado: bloquea escritores durante el cruce final y la carga.
    // Evita carreras con cambios de membresía, cierre, créditos y edición de las reglas.
    await ctx.tx.execute(sql`set local lock_timeout = '5s'`);
    await ctx.tx.execute(sql`set local statement_timeout = '30s'`);
    await ctx.tx.execute(
      sql`lock table term, permission, person, membership, occasion, check_in, point_entry, work_group, work_group_membership, permanence_rule, permanence_table in share row exclusive mode`,
    );
    await requireGhImportAdmin(ctx.tx, options.actorId);
    const snapshot = await readGhSnapshot(ctx.tx, manifest, options.environment);
    const plan = planGhImport(manifest, snapshot);
    if (plan.planHash !== options.planHash)
      throw new GhImportError("Cambió la vista previa; regenerala antes de aplicar");
    if (
      plan.ruleChanges.some((r) => r.action === "BLOCKED") ||
      plan.activities.some((a) => a.action === "BLOCKED")
    )
      throw new GhImportError("Hay conflictos de actividades, reglas o cierre del término");
    if (plan.summary.rowsBlocked && !options.skipBlocked)
      throw new GhImportError(
        "Hay asistencias retenidas; resolvelas o seleccioná explícitamente omitirlas",
      );
    if (manifest.sources.some((s) => !options.evidenceKeys[s.key]))
      throw new GhImportError("Faltan objetos de evidencia");
    await lockOpenTermPoints(ctx.tx, plan.termId);
    const changes =
      plan.summary.rowsToAdd +
      plan.ruleChanges.filter((r) => r.action === "CREATE").length +
      plan.activities
        .flatMap((a) => a.rows)
        .filter((r) => ["ADD", "EVALUATE"].includes(r.evidenceAction)).length;
    if (!changes) return { applied: false, summary: plan.summary, importJobId: null };
    const job = await createImportJob(ctx, {
      type: "GHPOINTS_ATTENDANCE",
      filename: `${manifest.batchId}.json`,
      fileKey: options.manifestKey,
      termId: plan.termId,
      mapping: {
        batchId: manifest.batchId,
        planHash: plan.planHash,
        evidenceKeys: options.evidenceKeys,
      },
      payload: { manifest, plan },
      summary: plan.summary,
    });
    for (const change of plan.ruleChanges) {
      if (change.action !== "CREATE") continue;
      const input = manifest.permanenceRules.find((r) => r.key === change.key);
      if (!input) throw new GhImportError("Regla sin definición");
      await createRule(ctx, { termId: plan.termId, committeeId: null, scope: "GENERAL" }, input, {
        bypassLock: false,
        closed: false,
      });
    }
    const groups = new Map(snapshot.groups.map((g) => [g.code, g.id]));
    const memberships = new Map(
      snapshot.groupMemberships.map((m) => [`${m.group_id}:${m.person_id}`, m]),
    );
    const now = new Date();
    for (const activityPlan of plan.activities) {
      const activity = manifest.activities.find((a) => a.key === activityPlan.key);
      if (!activity) throw new GhImportError("Actividad sin definición");
      const rows = activityPlan.rows.filter((r) => r.action !== "BLOCKED");
      if (!rows.length) continue;
      const window = dayWindow(activity);
      if (window.endsAt > now)
        throw new GhImportError("La importación histórica no admite actividades futuras");
      let occasionId = activityPlan.occasionId;
      if (!occasionId) {
        const [created] = await ctx.tx
          .insert(occasion)
          .values({
            publicId: newPublicId(),
            termId: plan.termId,
            kind: kindFor(activity.type),
            assemblyKind: activity.assemblyKind ?? null,
            category: categoryFor(activity.type),
            title: activity.title,
            description: t("T-2340", { inicio: activity.date, fin: activity.endDate }),
            newMembersOnly: activity.newMembersOnly,
            startsAt: window.startsAt,
            endsAt: window.endsAt,
            checkInOpensAt: window.startsAt,
            checkInClosesAt: window.endsAt,
            points: pointsFor(activity.type),
            approval: "MANUAL",
            status: "CLOSED",
            closedAt: now,
            createdById: options.actorId,
            legacyId: legacyKey(manifest, activity),
          })
          .returning({ id: occasion.id });
        if (!created) throw new GhImportError("No se creó la ocasión");
        occasionId = created.id;
        await ctx.audit({
          action: "occasion.imported",
          entityType: "occasion",
          entityId: occasionId,
          after: {
            importJobId: job.id,
            activityKey: activity.key,
            datePrecision: "DAY",
            date: activity.date,
            endDate: activity.endDate,
            assemblyKind: activity.assemblyKind ?? null,
          },
        });
      }
      for (const row of rows) {
        if (!row.personId) throw new GhImportError("Asistencia sin persona");
        const participant = activity.participants.find((p) => p.recordId === row.recordId);
        const evidence = {
          importJobId: job.id,
          sourceKey: activity.sourceKey,
          fileKey: options.evidenceKeys[activity.sourceKey],
          sourceRow: participant?.sourceRow,
          sourceSheet: activity.sourceSheet ?? null,
          recordId: row.recordId,
          datePrecision: "DAY",
        };
        if (row.action === "ADD") {
          const [created] = await ctx.tx
            .insert(checkIn)
            .values({
              occasionId,
              personId: row.personId,
              source: "IMPORT",
              status: "APPROVED",
              at: window.startsAt,
              decidedAt: now,
              decidedById: options.actorId,
              reason: `${manifest.batchId} / ${row.recordId}`,
              legacyId: `gh-import:${manifest.batchId}:${row.recordId}`,
            })
            .returning({ id: checkIn.id });
          if (!created) throw new GhImportError("No se creó la asistencia");
          await creditCheckIn(ctx, {
            checkInId: created.id,
            personId: row.personId,
            termId: plan.termId,
            points: row.points,
            reason: activity.title,
          });
          await ctx.audit({
            action: "checkin.imported",
            entityType: "check_in",
            entityId: created.id,
            after: { ...evidence, personId: row.personId, occasionId, points: row.points },
          });
          await ctx.emit(
            eventOf(checkinApproved, {
              personId: row.personId,
              occasionId,
              occasionTitle: activity.title,
              termId: plan.termId,
              category: categoryFor(activity.type),
              kind: kindFor(activity.type),
              points: row.points,
              source: "IMPORT",
            }),
          );
        }
        const ref = evidenceGroup(activity);
        if (ref && row.evidenceAction !== "NONE") {
          let groupId = groups.get(ref.code);
          if (!groupId) {
            groupId = (
              await createGroup(ctx, {
                termId: plan.termId,
                kind: ref.kind,
                code: ref.code,
                name: t(ref.kind === "NEW_MEMBER_TASK" ? "T-2341" : "T-2342"),
              })
            ).id;
            groups.set(ref.code, groupId);
          }
          const mk = `${groupId}:${row.personId}`;
          let gm = memberships.get(mk);
          if (!gm) {
            const [added] = await ctx.tx
              .insert(workGroupMembership)
              .values({ groupId, personId: row.personId, joinedAt: window.startsAt })
              .returning();
            if (!added) throw new GhImportError("No se registró la evidencia de grupo");
            gm = {
              id: added.id,
              group_id: groupId,
              person_id: row.personId,
              evaluation: added.evaluation,
              left_at: null,
            };
            memberships.set(mk, gm);
            await ctx.emit(
              eventOf(workGroupMembershipChanged, {
                actorId: options.actorId,
                personId: row.personId,
                termId: plan.termId,
                groupId,
                groupName: t(ref.kind === "NEW_MEMBER_TASK" ? "T-2341" : "T-2342"),
                kind: ref.kind,
                change: "JOINED",
              }),
            );
          }
          await ctx.audit({
            action: "work-group.evidence-imported",
            entityType: "work_group_membership",
            entityId: gm.id,
            after: {
              ...evidence,
              groupId,
              personId: row.personId,
              evaluation: activity.evidenceEvaluation,
            },
          });
          if (activity.evidenceEvaluation === "GOOD" && gm.evaluation === "PENDING") {
            await ctx.tx
              .update(workGroupMembership)
              .set({
                evaluation: "GOOD",
                evaluatedAt: now,
                evaluatedById: options.actorId,
                note: t("T-2343"),
              })
              .where(eq(workGroupMembership.id, gm.id));
            gm.evaluation = "GOOD";
            await ctx.emit(
              eventOf(evaluationRecorded, {
                actorId: options.actorId,
                personId: row.personId,
                termId: plan.termId,
                groupId,
                groupName: t(ref.kind === "NEW_MEMBER_TASK" ? "T-2341" : "T-2342"),
                kind: ref.kind,
                evaluation: "GOOD",
                note: t("T-2343"),
              }),
            );
          }
        }
      }
      if (rows.some((r) => r.action === "ADD"))
        await ctx.emit(
          eventOf(scoreRecompute, { occasionId }, { dedupeKey: `score:${occasionId}` }),
        );
    }
    await ctx.emit(
      eventOf(
        permanenceRecompute,
        { termId: plan.termId },
        { dedupeKey: `permanence:${plan.termId}:*` },
      ),
    );
    await updateImportJob(ctx, job.id, {
      status: "APPLIED",
      appliedAt: now,
      summary: plan.summary,
    });
    return { applied: true, summary: plan.summary, importJobId: job.id };
  });
}
