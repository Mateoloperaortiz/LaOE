import {
  evaluationRecorded,
  leaderScoreRecorded,
  manualCreditGranted,
  permanenceDecided,
  workGroupMembershipChanged,
} from "@/domain-events/permanence";
import { fill, label, rule, type TimelineRule } from "./kit";

// Permanencia: evaluaciones, puntajes del líder, créditos manuales, grupos de trabajo y el cierre.

export const PERMANENCE_RULES: readonly TimelineRule[] = [
  rule(
    evaluationRecorded,
    ({ groupId, groupName, evaluation, note, evaluatorName }, { labels }) => ({
      kind: "PERMANENCE",
      summary: fill(labels.permanenceTexts[evaluation === "GOOD" ? 0 : 1] ?? "", {
        grupo: groupName,
        evaluador: evaluatorName || "GH",
        nota: note,
      }),
      metadata: { groupId, evaluation },
    }),
  ),

  rule(
    leaderScoreRecorded,
    ({ committeeId, ruleId, criterion, value, weight, note }, { labels, lookup }) => {
      const base = fill(labels.permanenceTexts[2] ?? "", {
        criterio: criterion,
        comité: committeeId ? lookup.committeeName(committeeId) : "",
        valor: String(value),
        peso: String(weight),
      });
      return {
        kind: "PERMANENCE",
        summary: note ? `${base}: ${note}` : base,
        metadata: { ruleId, value, weight },
      };
    },
  ),

  rule(manualCreditGranted, ({ ruleId, criterion, value, reason }, { labels }) => ({
    kind: "PERMANENCE",
    summary: fill(labels.permanenceTexts[3] ?? "", {
      criterio: criterion,
      valor: String(value),
      motivo: reason,
    }),
    metadata: { ruleId, value },
  })),

  rule(workGroupMembershipChanged, ({ groupId, groupName, change }, { labels }) => ({
    kind: "PERMANENCE",
    summary: fill(labels.permanenceTexts[change === "JOINED" ? 4 : 5] ?? "", { grupo: groupName }),
    metadata: { groupId, change },
  })),

  rule(permanenceDecided, ({ termId, committeeId, decision, reason }, { labels, lookup }) => {
    const committee = committeeId ? ` (${lookup.committeeName(committeeId)})` : "";
    const base = fill(labels.permanenceTexts[6] ?? "", {
      término: lookup.termCode(termId),
      decisión: `${label(labels.decisions, decision)}${committee}`,
    });
    return {
      kind: "PERMANENCE",
      summary: reason ? `${base}: ${reason}` : base,
      metadata: { termId, committeeId: committeeId || null, decision },
    };
  }),
];
