import type { DomainEventDefinition, EventPayload } from "@/domain-events/define";
import type { InteractionKind } from "../../schema";

// Piezas de la línea de tiempo (02-crm.md, ADR-084). Una regla dice cómo se cuenta UN tipo de evento: su
// contrato y una función que recibe el payload ya tipado. Sin I/O: los nombres de términos, comités y
// cargos llegan por `lookup` y los textos por `labels` (T-458 y catálogos).

export interface TimelineLabels {
  /** Los dieciséis textos de T-458, en orden. */
  texts: string[];
  /** Los textos de participación de T-667, en orden (fase 3). */
  participationTexts: string[];
  /** El nombre de cada tipo de booster de T-2451, por valor (ADR-067); los usa booster.granted. */
  boosterNames?: Readonly<Record<string, string>>;
  /** Los textos de permanencia de T-832, en orden (fase 4; los dos últimos, ADR-056). */
  permanenceTexts: string[];
  /** Los textos de admisión, aliados y contactos de T-1046, en orden (fase 5). */
  crmTexts: string[];
  /** El pedido de retiro de un comité por su dirección, T-2171 (ADR-058). */
  directionTexts: string[];
  /** Sanción registrada y revocada, T-2234, y los tipos de T-2229 (ADR-060 regla 6). */
  sanctionTexts?: string[];
  sanctionKinds?: Record<string, string>;
  /** Las etapas de la persona de T-1047, en el orden del modelo. */
  stages: Record<string, string>;
  /** Los estados de una solicitud de T-876, en el orden del modelo. */
  requestStatuses: Record<string, string>;
  /** Los estados de una inscripción a convocatoria de T-899, en el orden del modelo. */
  callEntryStatuses: Record<string, string>;
  /** Las decisiones del cierre de T-802, en el orden del modelo. */
  decisions: Record<string, string>;
  statuses: Record<string, string>;
  appointmentKinds: Record<string, string>;
  permissions: Record<string, string>;
  purposes: Record<string, string>;
  fields: Record<string, string>;
}

export interface TimelineLookup {
  termCode(id: string): string;
  committeeName(id: string): string;
  roleLabel(code: string): string;
}

export interface TimelineEntry {
  personId: string | null;
  /** Sujeto alternativo desde la fase 5: una organización (notas y tarjetas de patrocinio). */
  organizationId: string | null;
  actorId: string | null;
  kind: InteractionKind;
  summary: string;
  metadata: Record<string, unknown>;
}

/** Lo que decide una regla; el sujeto, el actor y el tipo del evento los pone `summarize`. */
export interface TimelineDraft {
  kind: InteractionKind;
  summary: string;
  metadata?: Record<string, unknown>;
}

export interface TimelineTools {
  labels: TimelineLabels;
  lookup: TimelineLookup;
}

export interface TimelineRule {
  readonly definition: DomainEventDefinition;
  /** `payload` ya pasó por el contrato: lo valida `onEvent` en el job y `summarizeEvent` en las pruebas. */
  draft(payload: unknown, tools: TimelineTools): TimelineDraft | null;
}

/** Ata una regla a su contrato: dentro de `draft` el payload tiene el tipo del evento. */
export function rule<Definition extends DomainEventDefinition>(
  definition: Definition,
  draft: (payload: EventPayload<Definition>, tools: TimelineTools) => TimelineDraft | null,
): TimelineRule {
  return {
    definition,
    draft: (payload, tools) => draft(payload as EventPayload<Definition>, tools),
  };
}

export function fill(text: string, values: Record<string, string>): string {
  return text.replace(
    /\{([a-zA-Zñáéíóú ]+)\}/g,
    (match, key: string) => values[key.trim()] ?? match,
  );
}

export function label(map: Record<string, string>, key: string): string {
  return map[key] ?? key;
}

/** El sujeto y el actor se leen igual en todos los eventos; no todos traen los tres campos. */
export function subjectOf(payload: unknown): {
  personId: string | null;
  organizationId: string | null;
  actorId: string | null;
} {
  const fields = (payload ?? {}) as Record<string, unknown>;
  const text = (key: string) => {
    const value = fields[key];
    return typeof value === "string" && value ? value : null;
  };
  return {
    personId: text("personId"),
    organizationId: text("organizationId"),
    actorId: text("actorId"),
  };
}
