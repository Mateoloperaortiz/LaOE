import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { t, tLabels } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import {
  competitionBase,
  competitionMatchup,
  competitionRotation,
  competitionTeam,
} from "../schema";
import type { CompetitionActor } from "./access";
import { dayRotations, issueKey, scheduleOf } from "./play";
import {
  MAX_SHEET_LENGTH,
  parseScheduleSheet,
  type SheetProblem,
  teamKey,
} from "./schedule-import-pure";
import {
  type Day,
  SCHEDULE_ISSUE_KINDS,
  type ScheduleIssue,
  type ScheduleRotation,
  validateSchedule,
} from "./schedule-pure";
import { openCompetition } from "./setup";

// Importar el calendario de una jornada desde la hoja de la OE (ADR-094). La hoja la lee
// schedule-import-pure; aquí se resuelven los equipos y las bases de la competencia, se pasa por el
// validador (ADR-089 regla 8, ADR-093) y se guarda todo en la misma transacción, o nada.

const MAX_TEAM_NUMBER = 99;

export const importDayInputSchema = z.object({
  day: z.coerce
    .number()
    .int()
    .pipe(z.union([z.literal(1), z.literal(2)])),
  plannedMinutes: z.coerce.number().int().min(1).max(240),
  text: z.string().max(MAX_SHEET_LENGTH),
  confirmWarnings: z.boolean().default(false),
});
export type ImportDayInput = z.input<typeof importDayInputSchema>;

export interface ImportDayResult {
  saved: boolean;
  /** Bloquean: no se guardó nada. */
  errors: string[];
  /** Advertencias nuevas del validador, que hay que confirmar. */
  warnings: string[];
  rotations: number;
  matchups: number;
  teamsCreated: number;
  basesCreated: number;
}

function describeProblem(problem: SheetProblem): string {
  switch (problem.kind) {
    case "COLUMNS":
      return t("T-2909", { linea: problem.line });
    case "ROTATION":
      return t("T-2910", { linea: problem.line });
    case "BASE":
      return t("T-2911", { linea: problem.line });
    case "SELF_MATCH":
      return t("T-2912", { linea: problem.line, equipo: problem.team });
    case "TEAM_TWICE":
      return t("T-2913", { linea: problem.line, equipo: problem.team, n: problem.rotation });
    case "BASE_TWICE":
      return t("T-2914", { linea: problem.line, base: problem.base, n: problem.rotation });
    case "MISSING_ROTATION":
      return t("T-2915", { n: problem.rotation });
    case "EMPTY":
      return t("T-2916");
  }
}

function blocked(errors: string[], warnings: string[] = []): ImportDayResult {
  return {
    saved: false,
    errors,
    warnings,
    rotations: 0,
    matchups: 0,
    teamsCreated: 0,
    basesCreated: 0,
  };
}

/** Importa una jornada sin rotaciones. Crea los equipos si la competencia no tiene, y las bases si la
 *  jornada no tiene; si ya los hay, la hoja tiene que usar los existentes. */
export async function importDaySchedule(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: ImportDayInput,
): Promise<ImportDayResult> {
  await openCompetition(ctx, actor, competitionId);
  const parsed = importDayInputSchema.safeParse(raw);
  if (!parsed.success) {
    const tooLong = typeof raw.text === "string" && raw.text.length > MAX_SHEET_LENGTH;
    throw new DomainError(t(tooLong ? "T-2923" : "T-2777"), tooLong ? "text" : "plannedMinutes");
  }
  const input = parsed.data;
  const day: Day = input.day;
  if ((await dayRotations(ctx, competitionId, day)).length > 0) {
    throw new DomainError(t("T-2921", { dia: day }));
  }
  const { sheet, problems } = parseScheduleSheet(input.text);
  if (!sheet) return blocked(problems.map(describeProblem));

  const current = await scheduleOf(ctx, competitionId);
  const teams = await ctx.tx
    .select({ id: competitionTeam.id, number: competitionTeam.number, name: competitionTeam.name })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId));
  const dayBases = await ctx.tx
    .select({
      id: competitionBase.id,
      orderIndex: competitionBase.orderIndex,
      name: competitionBase.name,
    })
    .from(competitionBase)
    .where(and(eq(competitionBase.competitionId, competitionId), eq(competitionBase.day, day)));

  // Cada equipo y cada base de la hoja, con su id; los que faltan llevan un id provisional.
  const errors: string[] = [];
  const teamIds = new Map<string, string>();
  const newTeams: { tempId: string; number: number; name: string }[] = [];
  if (teams.length === 0) {
    if (sheet.teams.length > MAX_TEAM_NUMBER) {
      return blocked([t("T-2919", { equipos: sheet.teams.length })]);
    }
    for (const [index, team] of sheet.teams.entries()) {
      const tempId = `nuevo-equipo-${index + 1}`;
      newTeams.push({ tempId, number: index + 1, name: team.name });
      teamIds.set(team.key, tempId);
    }
  } else {
    const byKey = new Map(teams.map((team) => [teamKey(team.name), team.id]));
    for (const team of sheet.teams) {
      const id = byKey.get(team.key);
      if (id) teamIds.set(team.key, id);
      else errors.push(t("T-2917", { nombre: team.name }));
    }
  }
  const baseIds = new Map<number, string>();
  const newBases: { tempId: string; orderIndex: number; name: string }[] = [];
  if (dayBases.length === 0) {
    for (const number of sheet.bases) {
      const tempId = `nueva-base-${number}`;
      newBases.push({ tempId, orderIndex: number - 1, name: t("T-2920", { n: number }) });
      baseIds.set(number, tempId);
    }
  } else {
    // Primero la que se llama «Base N» (sin ambigüedad) y si no, la del puesto N.
    const byPosition = new Map(dayBases.map((base) => [base.orderIndex + 1, base.id]));
    const named = dayBases.flatMap((base) => {
      const match = /^base\s+(\d+)(?:$|\s)/i.exec(base.name.trim());
      return match?.[1] ? [{ number: Number(match[1]), id: base.id }] : [];
    });
    const byName = new Map(
      named
        .filter((item) => named.filter((other) => other.number === item.number).length === 1)
        .map((item) => [item.number, item.id]),
    );
    for (const number of sheet.bases) {
      const id = byName.get(number) ?? byPosition.get(number);
      if (id) baseIds.set(number, id);
      else errors.push(t("T-2918", { dia: day, base: number }));
    }
  }
  if (errors.length > 0) return blocked(errors);

  const proposed: ScheduleRotation[] = sheet.rotations.map((matchups, index) => ({
    day,
    number: sheet.firstRotation + index,
    matchups: matchups.map((matchup) => ({
      baseId: baseIds.get(matchup.base) ?? "",
      teamAId: teamIds.get(matchup.a) ?? "",
      teamBId: teamIds.get(matchup.b) ?? "",
    })),
  }));
  const allTeams = [
    ...current.teams,
    ...newTeams.map((team) => ({ id: team.tempId, number: team.number, active: true })),
  ];
  const allBases = [...current.bases, ...newBases.map((base) => ({ id: base.tempId, day }))];
  const before = validateSchedule(current.schedule, current.teams, current.bases);
  const report = validateSchedule([...current.schedule, ...proposed], allTeams, allBases);
  const knownErrors = new Set(before.errors.map(issueKey));
  const knownWarnings = new Set(before.warnings.map(issueKey));
  const newErrors = report.errors.filter((issue) => !knownErrors.has(issueKey(issue)));
  const newWarnings = report.warnings.filter((issue) => !knownWarnings.has(issueKey(issue)));

  const teamLabel = new Map<string, string>([
    ...teams.map((team) => [team.id, `${team.number} ${team.name}`] as const),
    ...newTeams.map((team) => [team.tempId, `${team.number} ${team.name}`] as const),
  ]);
  const baseLabel = new Map<string, string>([
    ...dayBases.map((base) => [base.id, base.name] as const),
    ...newBases.map((base) => [base.tempId, base.name] as const),
  ]);
  const labels = tLabels("T-2841", SCHEDULE_ISSUE_KINDS);
  const describe = (issue: ScheduleIssue): string => {
    const label = labels[issue.kind] ?? issue.kind;
    if ("teamAId" in issue) {
      return `${label}: ${teamLabel.get(issue.teamAId) ?? issue.teamAId} · ${
        teamLabel.get(issue.teamBId) ?? issue.teamBId
      }`;
    }
    const parts = [
      "rotation" in issue ? t("T-2837", { n: issue.rotation, dia: issue.day }) : null,
      "teamId" in issue ? (teamLabel.get(issue.teamId) ?? issue.teamId) : null,
      "baseId" in issue ? (baseLabel.get(issue.baseId) ?? issue.baseId) : null,
    ].filter(Boolean);
    return `${label}: ${parts.join(" · ")}`;
  };
  if (newErrors.length > 0) return blocked(newErrors.map(describe));
  if (newWarnings.length > 0 && !input.confirmWarnings) {
    return blocked([], newWarnings.map(describe));
  }

  // Todo cuadra: se guarda en la misma transacción.
  const realIds = new Map<string, string>();
  if (newTeams.length > 0) {
    const inserted = await ctx.tx
      .insert(competitionTeam)
      .values(newTeams.map((team) => ({ competitionId, number: team.number, name: team.name })))
      .returning({ id: competitionTeam.id, number: competitionTeam.number });
    for (const team of newTeams) {
      const row = inserted.find((item) => item.number === team.number);
      if (!row) throw new Error("team insert");
      realIds.set(team.tempId, row.id);
      await ctx.audit({
        action: "competition.team.create",
        entityType: "competition_team",
        entityId: row.id,
        after: { number: team.number, name: team.name, color: null, submissionId: null },
      });
    }
  }
  if (newBases.length > 0) {
    const inserted = await ctx.tx
      .insert(competitionBase)
      .values(
        newBases.map((base) => ({
          competitionId,
          day,
          orderIndex: base.orderIndex,
          name: base.name,
        })),
      )
      .returning({ id: competitionBase.id, orderIndex: competitionBase.orderIndex });
    for (const base of newBases) {
      const row = inserted.find((item) => item.orderIndex === base.orderIndex);
      if (!row) throw new Error("base insert");
      realIds.set(base.tempId, row.id);
      await ctx.audit({
        action: "competition.base.create",
        entityType: "competition_base",
        entityId: row.id,
        after: {
          day,
          orderIndex: base.orderIndex,
          name: base.name,
          kind: "NORMAL",
          location: null,
        },
      });
    }
  }
  const real = (id: string) => realIds.get(id) ?? id;
  const rotations = await ctx.tx
    .insert(competitionRotation)
    .values(
      proposed.map((rotation) => ({
        competitionId,
        day,
        number: rotation.number,
        plannedSeconds: input.plannedMinutes * 60,
      })),
    )
    .returning({ id: competitionRotation.id, number: competitionRotation.number });
  const matchups = proposed.flatMap((rotation) => {
    const row = rotations.find((item) => item.number === rotation.number);
    if (!row) throw new Error("rotation insert");
    return rotation.matchups.map((matchup) => ({
      rotationId: row.id,
      baseId: real(matchup.baseId),
      teamAId: real(matchup.teamAId),
      teamBId: real(matchup.teamBId),
      source: "MANUAL" as const,
    }));
  });
  if (matchups.length > 0) await ctx.tx.insert(competitionMatchup).values(matchups);
  const summary = {
    rotations: proposed.length,
    matchups: matchups.length,
    teamsCreated: newTeams.length,
    basesCreated: newBases.length,
  };
  await ctx.audit({
    action: "competition.schedule.import",
    entityType: "competition",
    entityId: competitionId,
    after: { day, plannedMinutes: input.plannedMinutes, ...summary },
  });
  return { saved: true, errors: [], warnings: [], ...summary };
}
