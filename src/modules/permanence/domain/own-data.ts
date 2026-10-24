import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { OWN_DATA_QUERY_LIMIT, ownDataCollections } from "@/shared/lib/own-data";
import {
  leaderScore,
  manualCredit,
  permanenceDecision,
  permanenceSnapshot,
  workGroup,
  workGroupEvaluator,
  workGroupMembership,
} from "../schema";
import type { CriterionResult } from "./permanence-pure";
import { committeeResultSchema, criterionSchema, mandatorySchema } from "./snapshot-pure";

function ownCriterion(row: CriterionResult) {
  const d = row.detail;
  const detail = (() => {
    switch (d.type) {
      case "CHECKIN_COUNT":
        return {
          type: d.type,
          attended: d.attended,
          perUnit: d.perUnit,
          occurred: d.occurred,
          opportunities: d.opportunities,
        };
      case "CHECKIN_THRESHOLD":
        return {
          type: d.type,
          attended: d.attended,
          minCount: d.minCount,
          occurred: d.occurred,
          opportunities: d.opportunities,
        };
      case "CHECKIN_RATE":
        return { type: d.type, attended: d.attended, held: d.held, future: d.future, rate: d.rate };
      case "GROUP_EVALUATED":
        return {
          type: d.type,
          goodCount: d.goodCount,
          pendingCount: d.pendingCount,
          tier: d.tier,
          groups: d.groups.map((g) => ({
            groupId: g.groupId,
            evaluation: g.evaluation,
            equivalentKind: g.equivalentKind,
          })),
        };
      case "COMPOSITE":
        return {
          type: d.type,
          attended: d.attended,
          minCount: d.minCount,
          group: d.group
            ? {
                groupId: d.group.groupId,
                evaluation: d.group.evaluation,
                equivalentKind: d.group.equivalentKind,
              }
            : null,
        };
      case "LEADER_SCORE":
        return { type: d.type, value: d.value, scoredAt: d.scoredAt, mandatory: d.mandatory };
      case "MANUAL":
        return { type: d.type, credited: d.credited };
    }
  })();
  return {
    ruleId: row.ruleId,
    key: row.key,
    computation: row.computation,
    weight: row.weight,
    achieved: row.achieved,
    remaining: row.remaining,
    detail,
  };
}

/** Puntajes y cierres propios; no incorpora evaluadores, observaciones ni JSON sin validar. */
export async function collectOwnPermanenceData(personId: string) {
  const db = getDb();
  const [
    snapshots,
    permanenceDecisions,
    leaderScores,
    manualCredits,
    workGroupMemberships,
    workGroupEvaluations,
    workGroupLeaderships,
  ] = await Promise.all([
    db
      .select({
        id: permanenceSnapshot.id,
        termId: permanenceSnapshot.termId,
        status: permanenceSnapshot.status,
        isNew: permanenceSnapshot.isNew,
        probation: permanenceSnapshot.probation,
        expulsionWarning: permanenceSnapshot.expulsionWarning,
        generalTotal: permanenceSnapshot.generalTotal,
        generalMax: permanenceSnapshot.generalMax,
        general: permanenceSnapshot.general,
        results: permanenceSnapshot.results,
        mandatory: permanenceSnapshot.mandatory,
        computedAt: permanenceSnapshot.computedAt,
        frozenAt: permanenceSnapshot.frozenAt,
      })
      .from(permanenceSnapshot)
      .where(eq(permanenceSnapshot.personId, personId))
      .orderBy(desc(permanenceSnapshot.computedAt), desc(permanenceSnapshot.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: permanenceDecision.id,
        termId: permanenceDecision.termId,
        committeeId: permanenceDecision.committeeId,
        proposed: permanenceDecision.proposed,
        decision: permanenceDecision.decision,
        proposalReason: permanenceDecision.proposalReason,
        decidedAt: permanenceDecision.decidedAt,
        appliedAt: permanenceDecision.appliedAt,
        createdAt: permanenceDecision.createdAt,
      })
      .from(permanenceDecision)
      .where(eq(permanenceDecision.personId, personId))
      .orderBy(desc(permanenceDecision.createdAt), desc(permanenceDecision.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: leaderScore.id,
        termId: leaderScore.termId,
        ruleId: leaderScore.ruleId,
        value: leaderScore.value,
        scoredAt: leaderScore.scoredAt,
        createdAt: leaderScore.createdAt,
        updatedAt: leaderScore.updatedAt,
      })
      .from(leaderScore)
      .where(eq(leaderScore.personId, personId))
      .orderBy(desc(leaderScore.createdAt), desc(leaderScore.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: manualCredit.id,
        termId: manualCredit.termId,
        ruleId: manualCredit.ruleId,
        value: manualCredit.value,
        createdAt: manualCredit.createdAt,
        updatedAt: manualCredit.updatedAt,
      })
      .from(manualCredit)
      .where(eq(manualCredit.personId, personId))
      .orderBy(desc(manualCredit.createdAt), desc(manualCredit.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: workGroupMembership.id,
        groupId: workGroupMembership.groupId,
        joinedAt: workGroupMembership.joinedAt,
        leftAt: workGroupMembership.leftAt,
        areas: workGroupMembership.areas,
        evaluation: workGroupMembership.evaluation,
        evaluatedAt: workGroupMembership.evaluatedAt,
        createdAt: workGroupMembership.createdAt,
      })
      .from(workGroupMembership)
      .where(eq(workGroupMembership.personId, personId))
      .orderBy(desc(workGroupMembership.createdAt), desc(workGroupMembership.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: workGroupEvaluator.id,
        groupId: workGroupEvaluator.groupId,
        createdAt: workGroupEvaluator.createdAt,
      })
      .from(workGroupEvaluator)
      .where(eq(workGroupEvaluator.personId, personId))
      .orderBy(desc(workGroupEvaluator.createdAt), desc(workGroupEvaluator.id))
      .limit(OWN_DATA_QUERY_LIMIT),
    db
      .select({
        id: workGroup.id,
        termId: workGroup.termId,
        kind: workGroup.kind,
        name: workGroup.name,
        code: workGroup.code,
        editionId: workGroup.editionId,
        eventId: workGroup.eventId,
        createdAt: workGroup.createdAt,
        updatedAt: workGroup.updatedAt,
      })
      .from(workGroup)
      .where(eq(workGroup.leaderPersonId, personId))
      .orderBy(desc(workGroup.createdAt), desc(workGroup.id))
      .limit(OWN_DATA_QUERY_LIMIT),
  ]);
  return ownDataCollections({
    permanenceSnapshots: snapshots.map((row) => {
      const general = z.array(criterionSchema).safeParse(row.general);
      const results = z.array(committeeResultSchema).safeParse(row.results);
      const mandatory = mandatorySchema.safeParse(row.mandatory);
      return {
        id: row.id,
        termId: row.termId,
        status: row.status,
        isNew: row.isNew,
        probation: row.probation,
        expulsionWarning: row.expulsionWarning,
        generalTotal: row.generalTotal,
        generalMax: row.generalMax,
        computedAt: row.computedAt,
        frozenAt: row.frozenAt,
        generalAvailable: general.success,
        general: general.success ? general.data.map(ownCriterion) : null,
        resultsAvailable: results.success,
        results: results.success
          ? results.data.map((r) => ({
              committeeId: r.committeeId,
              transferredIn: r.transferredIn,
              condition: r.condition,
              threshold: r.threshold,
              committeeTotal: r.committeeTotal,
              committeeMax: r.committeeMax,
              total: r.total,
              remaining: r.remaining,
              margin: r.margin,
              state: r.state,
              finalState: r.finalState,
              criteria: r.criteria.map(ownCriterion),
            }))
          : null,
        mandatoryAvailable: mandatory.success,
        mandatory: mandatory.success
          ? {
              required: mandatory.data.required,
              attended: mandatory.data.attended,
              met: mandatory.data.met,
              missing: mandatory.data.missing,
              lost: mandatory.data.lost,
              excused: mandatory.data.excused,
              induction: mandatory.data.induction,
            }
          : null,
      };
    }),
    permanenceDecisions,
    leaderScores,
    manualCredits,
    workGroupMemberships,
    workGroupEvaluations,
    workGroupLeaderships,
  });
}
