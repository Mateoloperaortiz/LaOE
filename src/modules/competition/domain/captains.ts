import { eq } from "drizzle-orm";
import { z } from "zod";
import type { CommandContext } from "@/db/tx";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { competition, competitionTeam, competitionTeamCaptain } from "../schema";
import type { CompetitionActor } from "./access";
import { type CaptainsProblem, MAX_CAPTAINS_TEXT, parseCaptainsSheet } from "./captains-pure";
import { lockedCompetition, openCompetition, purgeCaptains } from "./setup";

// Los capitanes de The Games (ADR-095): el ADMIN los carga pegando tres columnas de la hoja de la OE,
// decide si la vitrina muestra sus nombres y los puede borrar. La auditoría solo lleva conteos:
// nunca nombres ni celulares.

export const importCaptainsInputSchema = z.object({ text: z.string().max(MAX_CAPTAINS_TEXT) });
export type ImportCaptainsInput = z.input<typeof importCaptainsInputSchema>;

export interface ImportCaptainsResult {
  saved: boolean;
  /** Bloquean: no se guardó nada. */
  errors: string[];
  captains: number;
  teams: number;
}

function assertAdmin(actor: CompetitionActor): void {
  if (!actor.isAdmin) throw new DomainError(t("T-3033"));
}

function describeProblem(problem: CaptainsProblem): string {
  switch (problem.kind) {
    case "COLUMNS":
      return t("T-3022", { linea: problem.line });
    case "EXTRA_COLUMNS":
      return t("T-3023", { linea: problem.line });
    case "TEAM":
      return t("T-3024", { linea: problem.line, equipo: problem.team });
    case "NAME":
      return t("T-3025", { linea: problem.line });
    case "PHONE":
      return t("T-3026", { linea: problem.line });
    case "TOO_MANY":
      return t("T-3027", { linea: problem.line, equipo: problem.team });
    case "EMPTY":
      return t("T-2916");
  }
}

/** Reemplaza a todos los capitanes de la competencia por los de la hoja, o no guarda nada. */
export async function importCaptains(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  raw: ImportCaptainsInput,
): Promise<ImportCaptainsResult> {
  assertAdmin(actor);
  await openCompetition(ctx, actor, competitionId);
  const parsed = importCaptainsInputSchema.safeParse(raw);
  if (!parsed.success) throw new DomainError(t("T-3029"), "text");
  const teams = await ctx.tx
    .select({ id: competitionTeam.id, number: competitionTeam.number, name: competitionTeam.name })
    .from(competitionTeam)
    .where(eq(competitionTeam.competitionId, competitionId));
  const { captains, problems } = parseCaptainsSheet(parsed.data.text, teams);
  if (!captains) {
    return { saved: false, errors: problems.map(describeProblem), captains: 0, teams: 0 };
  }
  const replaced = await purgeCaptains(ctx, competitionId);
  await ctx.tx.insert(competitionTeamCaptain).values(captains);
  const summary = { captains: captains.length, teams: new Set(captains.map((c) => c.teamId)).size };
  await ctx.audit({
    action: "competition.captains.import",
    entityType: "competition",
    entityId: competitionId,
    before: { captains: replaced },
    after: summary,
  });
  return { saved: true, errors: [], ...summary };
}

/** Prende o apaga los nombres de los capitanes en la vitrina. Se puede también con la competencia
 *  terminada, para atender una objeción. */
export async function setCaptainsVisibility(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
  visible: boolean,
): Promise<void> {
  assertAdmin(actor);
  const row = await lockedCompetition(ctx, competitionId);
  if (row.showCaptains === visible) return;
  await ctx.tx
    .update(competition)
    .set({ showCaptains: visible })
    .where(eq(competition.id, competitionId));
  await ctx.audit({
    action: "competition.captains.visibility",
    entityType: "competition",
    entityId: competitionId,
    before: { showCaptains: row.showCaptains },
    after: { showCaptains: visible },
  });
}

/** Borra a todos los capitanes de la competencia, en cualquier estado. */
export async function clearCaptains(
  ctx: CommandContext,
  actor: CompetitionActor,
  competitionId: string,
): Promise<void> {
  assertAdmin(actor);
  await lockedCompetition(ctx, competitionId);
  const removed = await purgeCaptains(ctx, competitionId);
  if (removed === 0) return;
  await ctx.audit({
    action: "competition.captains.clear",
    entityType: "competition",
    entityId: competitionId,
    after: { captains: removed },
  });
}
