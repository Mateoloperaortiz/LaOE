// Pipelines sin I/O (02-crm.md, ADR-037): plantillas de etapas por tipo y cierre de la tarjeta al
// llegar a una etapa ganada o perdida.

export const PIPELINE_KINDS = ["ADMISSION", "SPONSORSHIP", "CUSTOM"] as const;
export type PipelineKind = (typeof PIPELINE_KINDS)[number];

export interface StageTemplate {
  name: string;
  sortOrder: number;
  isWon: boolean;
  isLost: boolean;
}

/**
 * Etapas de la plantilla de un tipo: los nombres llegan de T-965 (admisión) y T-966 (patrocinio), donde las
 * dos últimas son la ganada y la perdida; un pipeline personalizado nace con una sola etapa (T-967).
 */
export function templateStages(kind: PipelineKind, names: string[]): StageTemplate[] {
  if (kind === "CUSTOM") {
    return [{ name: names[0] ?? "Nueva", sortOrder: 0, isWon: false, isLost: false }];
  }
  return names.map((name, index) => ({
    name,
    sortOrder: index,
    isWon: index === names.length - 2,
    isLost: index === names.length - 1,
  }));
}

/** `closedAt` tras mover: la fecha al llegar a una etapa ganada o perdida; nulo al volver a una abierta. */
export function closedAtAfterMove(
  stage: { isWon: boolean; isLost: boolean },
  now = new Date(),
): Date | null {
  return stage.isWon || stage.isLost ? now : null;
}

/** Días completos que la tarjeta lleva en su etapa (T-982). */
export function daysInStage(enteredStageAt: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - enteredStageAt.getTime()) / 86_400_000));
}
