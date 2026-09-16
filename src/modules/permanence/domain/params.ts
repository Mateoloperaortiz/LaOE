import { z } from "zod";
import type { OccasionCategory, OccasionKind } from "@/modules/participation";

// Parámetros de cada tipo de cálculo (ADR-036 regla 3): se validan al escribir la regla y se
// vuelven a parsear al leerla. `weight` vive en la regla y es el máximo del criterio.

export const SCOPES = ["GENERAL", "COMMITTEE"] as const;
export type Scope = (typeof SCOPES)[number];

export const APPLIES_TO = ["ALL", "NEW", "VETERAN"] as const;
export type AppliesTo = (typeof APPLIES_TO)[number];

export const COMPUTATIONS = [
  "CHECKIN_COUNT",
  "CHECKIN_THRESHOLD",
  "CHECKIN_RATE",
  "GROUP_EVALUATED",
  "COMPOSITE",
  "LEADER_SCORE",
  "MANUAL",
] as const;
export type Computation = (typeof COMPUTATIONS)[number];

export const WORK_GROUP_KINDS = [
  "WORK_COMMITTEE",
  "GT_MACROEVENT",
  "GAP",
  "GAP_OE",
  "BARRA_BRAVA",
  "NEW_MEMBER_TASK",
] as const;
export type WorkGroupKind = (typeof WORK_GROUP_KINDS)[number];

export const GROUP_MODES = ["FIXED", "PER_GROUP", "TIERS"] as const;

export const NEW_MEMBERS_FILTERS = ["ANY", "ONLY", "EXCLUDE"] as const;
export const COMMITTEE_FILTERS = ["ANY", "OWN"] as const;

const CATEGORIES = [
  "INTEGRATION",
  "ATHLETIC_MATCH",
  "COMMITTEE_MEETING",
  "TALK",
  "WORKSHOP",
  "SOCIAL",
  "OTHER",
] as const satisfies readonly OccasionCategory[];
const KINDS = [
  "ACTIVITY",
  "ASSEMBLY",
  "EDITION_SESSION",
] as const satisfies readonly OccasionKind[];

export const GROUP_CODE = /^[A-Z0-9-]{2,20}$/;
export const RULE_KEY = /^[a-z0-9-]{2,40}$/;

/** Qué ocasiones cuentan: categoría o tipo (al menos uno, salvo que se listen ocasiones concretas). */
export const occasionFilterSchema = z
  .object({
    category: z.enum(CATEGORIES).optional(),
    kind: z.enum(KINDS).optional(),
    committee: z.enum(COMMITTEE_FILTERS).default("ANY"),
    occasionIds: z.array(z.string().min(1)).max(20).optional(),
    newMembersOnly: z.enum(NEW_MEMBERS_FILTERS).default("ANY"),
    /** Cuántas ocasiones habrá en el semestre, para "lo que aún es posible" sin calendario cargado. */
    expectedCount: z.number().int().min(0).optional(),
  })
  .refine((f) => f.category || f.kind || (f.occasionIds?.length ?? 0) > 0, {
    message: "categoria-o-tipo",
    path: ["category"],
  });
export type OccasionFilter = z.infer<typeof occasionFilterSchema>;

const tierSchema = z.object({ count: z.number().int().min(1), value: z.number().min(0) });

export const groupParamsSchema = z
  .object({
    groupKind: z.enum(WORK_GROUP_KINDS),
    code: z.string().regex(GROUP_CODE).optional(),
    mode: z.enum(GROUP_MODES).default("FIXED"),
    perGroup: z.number().positive().optional(),
    tiers: z.array(tierSchema).max(10).optional(),
    /** Otros tipos de grupo que también cumplen el criterio (ADR-071); un código fijo los ignora. */
    alsoCounts: z.array(z.enum(WORK_GROUP_KINDS)).max(5).default([]),
  })
  .superRefine((p, ctx) => {
    if (p.mode === "PER_GROUP" && !p.perGroup) {
      ctx.addIssue({ code: "custom", message: "per-group", path: ["perGroup"] });
    }
    if (p.mode === "TIERS" && (!p.tiers || p.tiers.length === 0)) {
      ctx.addIssue({ code: "custom", message: "tiers", path: ["tiers"] });
    }
    if (p.alsoCounts.includes(p.groupKind)) {
      ctx.addIssue({ code: "custom", message: "also-counts-propio", path: ["alsoCounts"] });
    }
    if (new Set(p.alsoCounts).size !== p.alsoCounts.length) {
      ctx.addIssue({ code: "custom", message: "also-counts-repetido", path: ["alsoCounts"] });
    }
  });

export const PARAMS_SCHEMAS = {
  CHECKIN_COUNT: occasionFilterSchema.safeExtend({ perUnit: z.number().positive() }),
  CHECKIN_THRESHOLD: occasionFilterSchema.safeExtend({ minCount: z.number().int().min(1) }),
  CHECKIN_RATE: z.object({
    category: z.enum(CATEGORIES).default("COMMITTEE_MEETING"),
    committee: z.literal("OWN").default("OWN"),
  }),
  GROUP_EVALUATED: groupParamsSchema,
  COMPOSITE: z.object({
    checkIns: occasionFilterSchema.safeExtend({ minCount: z.number().int().min(1) }),
    group: z.object({
      groupKind: z.enum(WORK_GROUP_KINDS),
      code: z.string().regex(GROUP_CODE).optional(),
    }),
  }),
  LEADER_SCORE: z.object({ mandatory: z.boolean().default(false) }),
  MANUAL: z.object({}),
} as const;

export type ParamsOf<C extends Computation> = z.infer<(typeof PARAMS_SCHEMAS)[C]>;

/** Regla tipada por su cálculo: el discriminante es `computation` y `params` ya viene parseado. */
export type RuleSpec = {
  [C in Computation]: { computation: C; params: ParamsOf<C> };
}[Computation];

export interface RuleBase {
  id: string;
  termId: string;
  scope: Scope;
  committeeId: string | null;
  key: string;
  label: string;
  description: string;
  weight: number;
  appliesTo: AppliesTo;
  sortOrder: number;
}

export type Rule = RuleBase & RuleSpec;

export function paramsSchemaFor(computation: Computation): z.ZodType<Record<string, unknown>> {
  return PARAMS_SCHEMAS[computation] as unknown as z.ZodType<Record<string, unknown>>;
}

export function parseParams(computation: Computation, raw: unknown): RuleSpec {
  const parsed = paramsSchemaFor(computation).parse(raw ?? {});
  return { computation, params: parsed } as RuleSpec;
}

/** Lo que se escribe desde el editor: la clave, el peso, a quién aplica, el cálculo y sus parámetros. */
export const ruleInputSchema = z
  .object({
    key: z.string().trim().regex(RULE_KEY),
    label: z.string().trim().min(2).max(80),
    description: z.string().trim().max(500).default(""),
    weight: z.number().min(0).max(100),
    appliesTo: z.enum(APPLIES_TO).default("ALL"),
    computation: z.enum(COMPUTATIONS),
    params: z.record(z.string(), z.unknown()).default({}),
    sortOrder: z.number().int().min(0).default(0),
  })
  .superRefine((input, ctx) => {
    const result = paramsSchemaFor(input.computation).safeParse(input.params);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: "custom", message: issue.message, path: ["params", ...issue.path] });
      }
    }
  });
export type RuleInput = z.infer<typeof ruleInputSchema>;
/** Lo que llega antes de aplicar los valores por defecto (formularios, plantillas y pruebas). */
export type RuleInputValues = z.input<typeof ruleInputSchema>;

/** Una regla leída de la base: `params` se parsea con el esquema de su cálculo. */
export function toRule(row: RuleBase & { computation: Computation; params: unknown }): Rule {
  return { ...row, ...parseParams(row.computation, row.params) };
}
