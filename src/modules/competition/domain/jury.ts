import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { competitionExtra, competitionExtraJuryScore, competitionTeam } from "../schema";
import type { CompetitionActor } from "./access";
import { type JuryProblem, MAX_JUDGE_NAME, MAX_JURY_TEXT, parseJurySheet } from "./jury-pure";
import { THE_CHALLENGE_RUBRIC } from "./rubric-pure";
import { openCompetition } from "./setup";

// Las notas de los jurados de The Challenge (ADR-103). Cualquier operador carga la tabla de un
// jurado junto a una extra de puntos directos; volver a cargarlo reemplaza solo sus notas. Nada de
// esto toca el libro: el podio lo pone la Dirección en los puntos de la misma extra (ADR-100).

export const importJuryInputSchema = z.object({
  extraId: z.string().trim().min(1),
  judge: z.string().trim().min(1).max(MAX_JUDGE_NAME),
  text: z.string().max(MAX_JURY_TEXT),
});
export type ImportJuryInput = z.input<typeof importJuryInputSchema>;

export interface ImportJuryResult {
  saved: boolean;
  /** Bloquean: no se guardó nada. */
  errors: string[];
  judge: string;
  teams: number;
}

function describeProblem(problem: JuryProblem): string {
  switch (problem.kind) {
    case "TEAM":
      return t("T-3024", { linea: problem.line, equipo: problem.team });
    case "MISSING":
      return t("T-3169", { linea: problem.line });
    case "SCORE":
      return t("T-3170", { linea: problem.line, nota: problem.score });
    case "TWICE":
      return t("T-3171", { linea: problem.line, equipo: problem.team, otra: problem.other });
    case "EMPTY":
      return t("T-2916");
  }
}

/** La extra de puntos directos de esta competencia; una con rúbrica o ajena no tiene jurados. */
async function directExtra(ctx: CommandContext, competitionId: string, extraId: string) {
  const [extra] = await ctx.tx
    .select({ id: competitionExtra.id, rubricScale: competitionExtra.rubricScale })
    .from(competitionExtra)
    .where(and(eq(competitionExtra.id, extraId), eq(competitionExtra.competitionId, competitionId)))
    .for("update");
  if (!extra || extra.rubricScale !== null) throw new DomainError(t("T-2764"));
  return extra;
}

/** Reemplaza las notas de un jurado en una extra con las de la tabla pegada, o no guarda nada. */
export async function importJuryScores(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: ImportJuryInput,
): Promise<ImportJuryResult> {
  await openCompetition(ctx, actor, competitionId);
  if (typeof raw.text === "string" && raw.text.length > MAX_JURY_TEXT) {
    throw new DomainError(t("T-3172"), "text");
  }
  const parsed = importJuryInputSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError(t("T-3173"), "judge");
  const input = parsed.data;
  const extra = await directExtra(ctx, competitionId, input.extraId);
  const teams = await ctx.tx
    .select({ id: competitionTeam.id, number: competitionTeam.number, name: competitionTeam.name })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId));
  const { rows, problems } = parseJurySheet(
    input.text,
    teams,
    THE_CHALLENGE_RUBRIC.criteria.length,
  );
  if (!rows) {
    return { saved: false, errors: problems.map(describeProblem), judge: input.judge, teams: 0 };
  }
  const replaced = await ctx.tx
    .delete(competitionExtraJuryScore)
    .where(
      and(
        eq(competitionExtraJuryScore.extraId, extra.id),
        sql`lower(${competitionExtraJuryScore.judge}) = lower(${input.judge})`,
      ),
    )
    .returning({ id: competitionExtraJuryScore.id });
  await ctx.tx.insert(competitionExtraJuryScore).values(
    rows.map((row) => ({
      extraId: extra.id,
      teamId: row.teamId,
      judge: input.judge,
      scores: row.scores,
      recordedById: actor.personId,
    })),
  );
  await ctx.audit({
    action: "competition.extra.jury",
    entityType: "competition_extra",
    entityId: extra.id,
    before: { judge: input.judge, teams: replaced.length },
    after: { judge: input.judge, teams: rows.length },
  });
  return { saved: true, errors: [], judge: input.judge, teams: rows.length };
}

export const removeJuryInputSchema = z.object({
  extraId: z.string().trim().min(1),
  judge: z.string().trim().min(1).max(MAX_JUDGE_NAME),
});
export type RemoveJuryInput = z.input<typeof removeJuryInputSchema>;

/** Quita todas las notas de un jurado en una extra, por si se cargó mal. */
export async function removeJuryScores(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: RemoveJuryInput,
): Promise<{ teams: number }> {
  await openCompetition(ctx, actor, competitionId);
  const input = removeJuryInputSchema.parse(raw);
  const extra = await directExtra(ctx, competitionId, input.extraId);
  const removed = await ctx.tx
    .delete(competitionExtraJuryScore)
    .where(
      and(
        eq(competitionExtraJuryScore.extraId, extra.id),
        sql`lower(${competitionExtraJuryScore.judge}) = lower(${input.judge})`,
      ),
    )
    .returning({ id: competitionExtraJuryScore.id });
  if (removed.length === 0) throw new DomainError(t("T-2764"));
  await ctx.audit({
    action: "competition.extra.jury-remove",
    entityType: "competition_extra",
    entityId: extra.id,
    before: { judge: input.judge, teams: removed.length },
  });
  return { teams: removed.length };
}
