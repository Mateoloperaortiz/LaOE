import { z } from "zod";
import { COMPUTATIONS, WORK_GROUP_KINDS } from "./params";
import type { CommitteeResult, CriterionResult, MandatoryView } from "./permanence-pure";

// Esquemas de los JSON del snapshot (03-modelo): se validan al leer con `.catch` para que una fila
// vieja o dañada degrade a vacío en vez de romper la pantalla.

const evaluation = z.enum(["PENDING", "GOOD", "INSUFFICIENT"]);
const assemblyKind = z.enum(["ORDINARY", "BOARD_ELECTION", "RUNOFF"]);
const upcoming = z.object({
  occasionId: z.string(),
  title: z.string(),
  location: z.string().catch(""),
  startsAt: z.string(),
});
const groupRef = z.object({
  groupId: z.string(),
  name: z.string(),
  // Los snapshots congelados antes de ADR-071 no lo traen: degradan a nulo en vez de romper.
  equivalentKind: z.enum(WORK_GROUP_KINDS).nullable().default(null).catch(null),
  evaluation,
  evaluatorIds: z.array(z.string()),
});

const detail = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("CHECKIN_COUNT"),
    attended: z.number(),
    perUnit: z.number(),
    occurred: z.number(),
    upcoming: z.array(upcoming),
    opportunities: z.number().nullable(),
  }),
  z.object({
    type: z.literal("CHECKIN_THRESHOLD"),
    attended: z.number(),
    minCount: z.number(),
    occurred: z.number(),
    upcoming: z.array(upcoming),
    opportunities: z.number().nullable(),
  }),
  z.object({
    type: z.literal("CHECKIN_RATE"),
    attended: z.number(),
    held: z.number(),
    future: z.number(),
    rate: z.number(),
  }),
  z.object({
    type: z.literal("GROUP_EVALUATED"),
    groups: z.array(groupRef),
    goodCount: z.number(),
    pendingCount: z.number(),
    tier: z.number().nullable(),
  }),
  z.object({
    type: z.literal("COMPOSITE"),
    attended: z.number(),
    minCount: z.number(),
    upcoming: z.array(upcoming),
    group: groupRef.nullable(),
  }),
  z.object({
    type: z.literal("LEADER_SCORE"),
    value: z.number().nullable(),
    note: z.string().nullable(),
    scoredAt: z.string().nullable(),
    mandatory: z.boolean(),
  }),
  z.object({
    type: z.literal("MANUAL"),
    credited: z.number().nullable(),
    reason: z.string().nullable(),
  }),
]);

export const criterionSchema: z.ZodType<CriterionResult> = z.object({
  ruleId: z.string(),
  key: z.string(),
  label: z.string(),
  computation: z.enum(COMPUTATIONS),
  weight: z.number(),
  achieved: z.number(),
  remaining: z.number(),
  detail,
});

const state = z.enum(["EN_CAMINO", "EN_RIESGO", "NO_ALCANZA", "CUMPLE", "PRUEBA", "NO_CUMPLE"]);

export const committeeResultSchema: z.ZodType<CommitteeResult> = z.object({
  committeeId: z.string(),
  transferredIn: z.boolean(),
  condition: z.enum(["ACTIVE", "NEW", "PROBATION", "TRANSFER"]),
  threshold: z.number(),
  committeeTotal: z.number(),
  committeeMax: z.number(),
  total: z.number(),
  remaining: z.number(),
  margin: z.number(),
  state,
  finalState: z.enum(["CUMPLE", "PRUEBA", "NO_CUMPLE"]),
  criteria: z.array(criterionSchema),
});

export const mandatorySchema: z.ZodType<MandatoryView> = z.object({
  required: z.object({ ordinary: z.number(), boardElection: z.boolean(), runoff: z.boolean() }),
  attended: z.object({ ordinary: z.number(), boardElection: z.boolean(), runoff: z.boolean() }),
  met: z.boolean(),
  missing: z.array(assemblyKind),
  lost: z.array(assemblyKind),
  // Los snapshots anteriores a ADR-060 no traen excusas ni inducción.
  excused: z.array(assemblyKind).default([]),
  upcoming: z.array(upcoming.extend({ assemblyKind })),
  induction: z
    .object({
      required: z.boolean(),
      attended: z.boolean(),
      excused: z.boolean(),
      pending: z.boolean(),
    })
    .default({ required: false, attended: false, excused: false, pending: false }),
});

export const EMPTY_MANDATORY: MandatoryView = {
  required: { ordinary: 0, boardElection: false, runoff: false },
  attended: { ordinary: 0, boardElection: false, runoff: false },
  met: true,
  missing: [],
  lost: [],
  excused: [],
  induction: { required: false, attended: false, excused: false, pending: false },
  upcoming: [],
};

export function parseGeneral(raw: unknown): CriterionResult[] {
  return z.array(criterionSchema).catch([]).parse(raw);
}

export function parseResults(raw: unknown): CommitteeResult[] {
  return z.array(committeeResultSchema).catch([]).parse(raw);
}

export function parseMandatory(raw: unknown): MandatoryView {
  return mandatorySchema.catch(EMPTY_MANDATORY).parse(raw);
}
