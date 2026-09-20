import {
  callEntryChanged,
  cardCreated,
  cardMoved,
  requestCreated,
  requestDecided,
  requestWithdrawn,
} from "@/domain-events/crm";
import { registrationCreated, submissionReceived } from "@/domain-events/forms";
import {
  fill,
  label,
  rule,
  type TimelineDraft,
  type TimelineLabels,
  type TimelineRule,
} from "./kit";

// Lo propio de crm y de los formularios: respuestas, inscripciones, pipelines, solicitudes y convocatorias.

/** Una solicitud respondida o retirada se cuenta igual; sin motivo, el texto no deja los dos puntos colgando. */
function requestOutcome(
  labels: TimelineLabels,
  facts: { requestId: string; kind: string; kindLabel: string },
  status: string,
  reason: string,
): TimelineDraft {
  const base = fill(labels.crmTexts[7] ?? "", {
    tipo: facts.kindLabel,
    estado: label(labels.requestStatuses, status).toLowerCase(),
    motivo: reason,
  });
  return {
    kind: "REQUEST",
    summary: reason ? base : base.replace(/:\s*$/, ""),
    metadata: { requestId: facts.requestId, kind: facts.kind, status },
  };
}

export const CRM_RULES: readonly TimelineRule[] = [
  rule(submissionReceived, ({ submissionId, formId, formTitle }, { labels }) => ({
    kind: "FORM",
    summary: fill(labels.crmTexts[0] ?? "", { formulario: formTitle }),
    metadata: { submissionId, formId },
  })),
  rule(registrationCreated, ({ editionId, editionName, submissionId }, { labels }) => ({
    kind: "FORM",
    summary: fill(labels.crmTexts[1] ?? "", { edición: editionName }),
    metadata: { editionId, submissionId },
  })),

  rule(cardCreated, ({ cardId, pipelineId, pipelineName, stageName }, { labels }) => ({
    kind: "PIPELINE",
    summary: fill(labels.crmTexts[2] ?? "", { pipeline: pipelineName, etapa: stageName }),
    metadata: { cardId, pipelineId },
  })),
  rule(cardMoved, ({ cardId, pipelineId, pipelineName, stageName, won, lost }, { labels }) => ({
    kind: "PIPELINE",
    summary: fill(labels.crmTexts[3] ?? "", { etapa: stageName, pipeline: pipelineName }),
    metadata: { cardId, pipelineId, won, lost },
  })),

  rule(requestCreated, ({ requestId, kind, kindLabel }, { labels }) => ({
    kind: "REQUEST",
    summary: fill(labels.crmTexts[6] ?? "", { tipo: kindLabel }),
    metadata: { requestId, kind },
  })),
  rule(requestDecided, (payload, { labels }) =>
    requestOutcome(labels, payload, payload.status, payload.reason ?? ""),
  ),
  rule(requestWithdrawn, (payload, { labels }) => requestOutcome(labels, payload, "WITHDRAWN", "")),

  rule(callEntryChanged, ({ callId, callTitle, groupId, status }, { labels }) => ({
    kind: "CALL",
    summary: fill(labels.crmTexts[8] ?? "", {
      convocatoria: callTitle,
      estado: label(labels.callEntryStatuses, status).toLowerCase(),
    }),
    metadata: { callId, groupId, status },
  })),
];
