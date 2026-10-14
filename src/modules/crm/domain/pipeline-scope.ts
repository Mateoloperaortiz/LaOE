import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { scopeId } from "@/shared/lib/scope-id";

/** La página desde la que se opera sobre una tarjeta o una etapa: la de su pipeline (ADR-122 regla 1). */
export interface PipelineScope {
  pipelineId: string;
}

/**
 * Falla cerrado: sin el pipeline de la página, o con una fila que es de otro, responde como una que
 * no existe.
 */
export function assertInPipeline(row: { pipelineId: string }, scope: PipelineScope): void {
  const pipelineId = scopeId(scope, "pipelineId");
  if (pipelineId === null || row.pipelineId !== pipelineId) {
    throw new DomainError(t("T-032"));
  }
}
