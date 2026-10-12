import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { isUniqueViolation } from "@/db/errors";
import type { CommandContext } from "@/db/tx";
import { getMembershipRef, getPeopleByIds, isMacroeventDirector } from "@/modules/people";
import { t, tLabels, tList } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  competitionBase,
  competitionMatchup,
  competitionRotation,
  competitionStaff,
  competitionSupport,
} from "../schema";
import { type CompetitionActor, THE_GAMES_ROLE_CODE } from "./access";
import type { Day } from "./schedule-pure";
import { openCompetition } from "./setup";
import {
  type CurrentStaffRow,
  type DesiredStaffRow,
  leaderWarnings,
  MAX_STAFF_TEXT,
  type ParsedStaffRow,
  parseStaffSheet,
  planStaffChanges,
  type StaffDirectory,
  type StaffSheetProblem,
  type StaffSheetRole,
  SUPPORT_STATUSES,
  type SupportRole,
  staffPlanFingerprint,
} from "./staff-import-pure";

// El personal de una jornada desde la hoja del GAP (ADR-101). ADMIN o la Dirección pegan la hoja,
// revisan y guardan: la carga reemplaza los jueces (líderes de base) y el apoyo de esa jornada, y no
// toca a los operadores ni a la otra jornada. La auditoría lleva conteos y los ids de los jueces que
// entran y salen, porque esos dan acceso; nunca nombres. El texto pegado no se guarda.

export const importStaffInputSchema = z.object({
  day: z.coerce
    .number()
    .int()
    .pipe(z.union([z.literal(1), z.literal(2)])),
  text: z.string().max(MAX_STAFF_TEXT),
  /** La huella de la revisión que se está guardando; `null` para solo revisar. */
  fingerprint: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .nullable()
    .default(null),
});
export type ImportStaffInput = z.input<typeof importStaffInputSchema>;

export interface StaffPreviewBase {
  name: string;
  location: string | null;
  leaders: string[];
  graders: string[];
  overseers: string[];
  vars: string[];
}

export interface ImportStaffResult {
  saved: boolean;
  /** Guardado sin cambios: la jornada ya tenía ese personal. */
  unchanged: boolean;
  /** La revisión que se quiso guardar ya no corresponde: se devuelve la nueva. */
  stale: boolean;
  /** Bloquean: no se guardó nada. */
  errors: string[];
  fingerprint: string | null;
  preview: {
    bases: StaffPreviewBase[];
    /** «Línea N: «hoja» es nombre», para revisar. */
    partial: string[];
    removals: string[];
    warnings: string[];
    /** Los líderes que quedan, para marcar a quienes no tienen contraseña. */
    leaderIds: string[];
  } | null;
  summary: {
    bases: number;
    leaders: number;
    graders: number;
    overseers: number;
    vars: number;
    added: number;
    removed: number;
    kept: number;
  };
}

const EMPTY_SUMMARY: ImportStaffResult["summary"] = {
  bases: 0,
  leaders: 0,
  graders: 0,
  overseers: 0,
  vars: 0,
  added: 0,
  removed: 0,
  kept: 0,
};

const ROLE_ORDER = [
  "LEADER",
  "GRADER",
  "OVERSEER",
  "VAR",
] as const satisfies readonly StaffSheetRole[];

/** El día en minúscula, como lo usan los textos («el jueves»). */
export function dayName(day: Day): string {
  return (tList("T-3048")[day - 1] ?? String(day)).toLowerCase();
}

function roleLabel(role: StaffSheetRole): string {
  return tLabels("T-3155", ROLE_ORDER)[role] ?? role;
}

function list(names: readonly string[]): string {
  return names.join(" · ");
}

function describeProblem(problem: StaffSheetProblem, day: Day): string {
  switch (problem.kind) {
    case "COLUMNS":
      return t("T-3141", { linea: problem.line });
    case "EXTRA_COLUMNS":
      return t("T-3142", { linea: problem.line });
    case "NO_BASE":
      return t("T-3143", { linea: problem.line });
    case "BASE":
      return t("T-3144", { linea: problem.line, dia: dayName(day), base: problem.base });
    case "BASE_OTHER_DAY":
      return t("T-3145", { linea: problem.line, dia: dayName(day), base: problem.base });
    case "ROLE":
      return t("T-3146", { linea: problem.line, funcion: problem.role });
    case "NOT_FOUND":
      return problem.suggestions.length > 0
        ? t("T-3148", {
            linea: problem.line,
            nombre: problem.name,
            opciones: list(problem.suggestions),
          })
        : t("T-3147", { linea: problem.line, nombre: problem.name });
    case "AMBIGUOUS":
      return t("T-3149", {
        linea: problem.line,
        nombre: problem.name,
        opciones: list(problem.options),
      });
    case "INACTIVE":
      return t("T-3151", { linea: problem.line, nombre: problem.name });
    case "LEADER_ON_LEAVE":
      return t("T-3162", { linea: problem.line, nombre: problem.name });
    case "TWICE":
      return t("T-3150", { linea: problem.line, nombre: problem.name, otra: problem.other });
    case "EMPTY":
      return t("T-2916");
  }
}

function blocked(errors: string[]): ImportStaffResult {
  return {
    saved: false,
    unchanged: false,
    stale: false,
    errors,
    fingerprint: null,
    preview: null,
    summary: EMPTY_SUMMARY,
  };
}

/** Los correos que trae lo pegado, para buscarlos antes de la transacción. */
export function staffSheetEmails(text: string): string[] {
  return [
    ...new Set((text.match(/[^\s;,"]+@[^\s;,"]+/g) ?? []).map((email) => email.toLowerCase())),
  ];
}

/**
 * Revisa y, con la huella de esa misma revisión, guarda el personal de una jornada. Sin huella, o si
 * la huella ya no corresponde (alguien cambió el personal o los miembros), devuelve la revisión sin
 * guardar. `directory` son los miembros que pueden quedar, leídos antes de la transacción; dentro de
 * ella se vuelve a mirar la membresía de quien entra.
 */
export async function importStaffSheet(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: ImportStaffInput,
  directory: StaffDirectory,
): Promise<ImportStaffResult> {
  const row = await openCompetition(ctx, actor, competitionId);
  if (
    !actor.isAdmin &&
    !(await isMacroeventDirector(actor.personId, row.editionId, THE_GAMES_ROLE_CODE, ctx.tx))
  ) {
    throw new DomainError(t("T-2765"));
  }
  if (typeof raw.text === "string" && raw.text.length > MAX_STAFF_TEXT) {
    throw new DomainError(t("T-3152"), "text");
  }
  const input = importStaffInputSchema.parse(raw);
  const day = input.day;
  const bases = await ctx.tx
    .select({
      id: competitionBase.id,
      day: competitionBase.day,
      orderIndex: competitionBase.orderIndex,
      name: competitionBase.name,
      location: competitionBase.location,
    })
    .from(competitionBase)
    .where(eq(competitionBase.competitionId, competitionId));
  const dayBases = bases
    .filter((base) => base.day === day)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  if (dayBases.length === 0) return blocked([t("T-3153", { dia: dayName(day) })]);
  const parsed = parseStaffSheet(input.text, day, bases, directory);
  if (!parsed.rows) return blocked(parsed.problems.map((problem) => describeProblem(problem, day)));
  const rows = parsed.rows;

  const dayBaseIds = dayBases.map((base) => base.id);
  const current = await currentDayStaff(ctx, competitionId, dayBaseIds);
  const desired: DesiredStaffRow[] = rows.map(({ baseId, personId, role }) => ({
    baseId,
    personId,
    role,
  }));
  const plan = planStaffChanges(current, desired);
  const fingerprint = staffPlanFingerprint(day, desired, current);
  const count = (role: StaffSheetRole) => rows.filter((item) => item.role === role).length;
  const summary: ImportStaffResult["summary"] = {
    bases: new Set(rows.map((item) => item.baseId)).size,
    leaders: count("LEADER"),
    graders: count("GRADER"),
    overseers: count("OVERSEER"),
    vars: count("VAR"),
    added: plan.add.length,
    removed: plan.remove.length,
    kept: plan.keep.length,
  };

  if (input.fingerprint !== fingerprint) {
    const preview = await buildPreview(ctx, competitionId, day, dayBases, rows, plan.remove);
    return {
      saved: false,
      unchanged: false,
      stale: input.fingerprint !== null,
      errors: [],
      fingerprint,
      preview,
      summary,
    };
  }
  if (plan.add.length === 0 && plan.remove.length === 0) {
    return {
      saved: true,
      unchanged: true,
      stale: false,
      errors: [],
      fingerprint,
      preview: null,
      summary,
    };
  }

  // La membresía se vuelve a mirar dentro de la transacción, con la regla de cada función: el líder
  // activo u honorario, y el apoyo además en licencia (ADR-102).
  for (const item of plan.add) {
    const membership = await getMembershipRef(item.personId, ctx.tx);
    const allowed: readonly string[] =
      item.role === "LEADER" ? ["ACTIVE", "HONORARY"] : SUPPORT_STATUSES;
    if (!membership || !allowed.includes(membership.status)) {
      throw new DomainError(t("T-2796"));
    }
  }
  const removeIds = (table: CurrentStaffRow["table"]) =>
    plan.remove.filter((item) => item.table === table).map((item) => item.id);
  const staffGone = removeIds("STAFF");
  const supportGone = removeIds("SUPPORT");
  if (staffGone.length > 0) {
    await ctx.tx
      .delete(competitionStaff)
      .where(
        and(
          eq(competitionStaff.competitionId, competitionId),
          inArray(competitionStaff.id, staffGone),
        ),
      );
  }
  if (supportGone.length > 0) {
    await ctx.tx
      .delete(competitionSupport)
      .where(
        and(
          eq(competitionSupport.competitionId, competitionId),
          inArray(competitionSupport.id, supportGone),
        ),
      );
  }
  const judges = plan.add.filter((item) => item.role === "LEADER");
  const support = plan.add.flatMap((item) =>
    item.role === "LEADER" ? [] : [{ ...item, role: item.role as SupportRole }],
  );
  try {
    if (judges.length > 0) {
      await ctx.tx.insert(competitionStaff).values(
        judges.map((item) => ({
          competitionId,
          personId: item.personId,
          role: "JUDGE" as const,
          baseId: item.baseId,
          createdById: actor.personId,
        })),
      );
    }
    if (support.length > 0) {
      await ctx.tx.insert(competitionSupport).values(
        support.map((item) => ({
          competitionId,
          baseId: item.baseId,
          personId: item.personId,
          role: item.role,
          createdById: actor.personId,
        })),
      );
    }
  } catch (error) {
    if (
      isUniqueViolation(error, "competition_staff_judge_unique") ||
      isUniqueViolation(error, "competition_support_base_person_unique")
    ) {
      throw new DomainError(t("T-2797"));
    }
    throw error;
  }
  const judgesRemoved = plan.remove.filter((item) => item.table === "STAFF");
  await ctx.audit({
    action: "competition.staff.import",
    entityType: "competition",
    entityId: competitionId,
    after: {
      day,
      judgesAdded: judges.map(({ personId, baseId }) => ({ personId, baseId })),
      judgesRemoved: judgesRemoved.map(({ personId, baseId }) => ({ personId, baseId })),
      support: {
        added: support.length,
        removed: supportGone.length,
      },
      kept: plan.keep.length,
      bases: summary.bases,
    },
  });
  return {
    saved: true,
    unchanged: false,
    stale: false,
    errors: [],
    fingerprint,
    preview: null,
    summary,
  };
}

/** Los jueces y el apoyo vigentes de las bases de una jornada. */
async function currentDayStaff(
  ctx: CommandContext,
  competitionId: string,
  dayBaseIds: string[],
): Promise<CurrentStaffRow[]> {
  const judges = await ctx.tx
    .select({
      id: competitionStaff.id,
      baseId: competitionStaff.baseId,
      personId: competitionStaff.personId,
    })
    .from(competitionStaff)
    .where(
      and(
        eq(competitionStaff.competitionId, competitionId),
        eq(competitionStaff.role, "JUDGE"),
        inArray(competitionStaff.baseId, dayBaseIds),
      ),
    );
  const support = await ctx.tx
    .select({
      id: competitionSupport.id,
      baseId: competitionSupport.baseId,
      personId: competitionSupport.personId,
      role: competitionSupport.role,
    })
    .from(competitionSupport)
    .where(
      and(
        eq(competitionSupport.competitionId, competitionId),
        inArray(competitionSupport.baseId, dayBaseIds),
      ),
    );
  return [
    ...judges.flatMap((item) =>
      item.baseId
        ? [
            {
              table: "STAFF" as const,
              id: item.id,
              baseId: item.baseId,
              personId: item.personId,
              role: "LEADER" as const,
            },
          ]
        : [],
    ),
    ...support.map((item) => ({ table: "SUPPORT" as const, ...item })),
  ];
}

/** Lo que muestra «Revisar»: cada base con su gente, los nombres parciales, quiénes salen y los
 *  avisos. Un líder que sale de una base en juego se avisa, porque deja de poder registrar ahí. */
async function buildPreview(
  ctx: CommandContext,
  competitionId: string,
  day: Day,
  dayBases: ReadonlyArray<{
    id: string;
    name: string;
    location: string | null;
    orderIndex: number;
  }>,
  rows: readonly ParsedStaffRow[],
  removed: readonly CurrentStaffRow[],
): Promise<NonNullable<ImportStaffResult["preview"]>> {
  const baseName = new Map(dayBases.map((base) => [base.id, base.name]));
  const names = (baseId: string, role: StaffSheetRole) =>
    rows
      .filter((item) => item.baseId === baseId && item.role === role)
      .map((item) => item.memberName);
  const people = await getPeopleByIds(removed.map((item) => item.personId));
  const inPlay = await activeBaseIds(ctx, competitionId, day);
  const removedName = (item: CurrentStaffRow) => people.get(item.personId)?.fullName ?? "";
  const warnings = [
    ...removed
      .filter((item) => item.table === "STAFF" && inPlay.has(item.baseId))
      .map((item) =>
        t("T-3135", { base: baseName.get(item.baseId) ?? "", nombre: removedName(item) }),
      ),
    ...leaderWarnings(
      dayBases.map((base) => ({ ...base, day })),
      rows,
    ).map((warning) =>
      warning.kind === "NO_LEADER"
        ? t("T-3136", { base: baseName.get(warning.baseId) ?? "" })
        : t("T-3137", { base: baseName.get(warning.baseId) ?? "", n: warning.n }),
    ),
  ];
  return {
    bases: dayBases.map((base) => ({
      name: base.name,
      location: base.location,
      leaders: names(base.id, "LEADER"),
      graders: names(base.id, "GRADER"),
      overseers: names(base.id, "OVERSEER"),
      vars: names(base.id, "VAR"),
    })),
    partial: rows
      .filter((item) => item.match === "PARTIAL")
      .map((item) =>
        t("T-3133", { linea: item.line, hoja: item.sheetName, nombre: item.memberName }),
      ),
    removals: removed.map((item) =>
      list([removedName(item), roleLabel(item.role), baseName.get(item.baseId) ?? ""]),
    ),
    warnings,
    leaderIds: rows.filter((item) => item.role === "LEADER").map((item) => item.personId),
  };
}

/** Las bases de la jornada que tienen un enfrentamiento en la rotación en curso. */
async function activeBaseIds(
  ctx: CommandContext,
  competitionId: string,
  day: Day,
): Promise<Set<string>> {
  const rows = await ctx.tx
    .select({ baseId: competitionMatchup.baseId })
    .from(competitionMatchup)
    .innerJoin(competitionRotation, eq(competitionRotation.id, competitionMatchup.rotationId))
    .where(
      and(
        eq(competitionRotation.competitionId, competitionId),
        eq(competitionRotation.day, day),
        eq(competitionRotation.status, "ACTIVE"),
      ),
    );
  return new Set(rows.map((item) => item.baseId));
}
