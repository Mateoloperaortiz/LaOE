import type { z } from "zod";
import type { DomainEventDefinition } from "@/domain-events/define";
import { CRM_RULES } from "./timeline/crm";
import {
  subjectOf,
  type TimelineEntry,
  type TimelineLabels,
  type TimelineLookup,
  type TimelineRule,
} from "./timeline/kit";
import { PARTICIPATION_RULES } from "./timeline/participation";
import { PEOPLE_RULES } from "./timeline/people";
import { PERMANENCE_RULES } from "./timeline/permanence";

// Traduce un evento de dominio a una entrada de la línea de tiempo (02-crm.md). Es un registro: una regla
// por tipo de evento, atada a su contrato (ADR-084), en `./timeline/<familia>.ts`. Un evento sin regla
// no deja rastro en la línea de tiempo. Sin I/O: nombres por `lookup`, textos por `labels`.

export type { TimelineEntry, TimelineLabels, TimelineLookup, TimelineRule } from "./timeline/kit";

/** Las reglas de los eventos que producen una interacción automática (01-arquitectura.md). */
export const TIMELINE_RULES: readonly TimelineRule[] = [
  ...PEOPLE_RULES,
  ...PARTICIPATION_RULES,
  ...PERMANENCE_RULES,
  ...CRM_RULES,
];

const RULE_BY_TYPE = new Map(TIMELINE_RULES.map((rule) => [rule.definition.type, rule]));

/**
 * La entrada que deja un evento cuyo payload ya pasó por su contrato. `null` cuando el evento no tiene
 * sujeto (ni persona ni organización) o cuando su regla decide que no se cuenta.
 */
export function entryFor(
  rule: TimelineRule,
  payload: unknown,
  labels: TimelineLabels,
  lookup: TimelineLookup,
): TimelineEntry | null {
  const subject = subjectOf(payload);
  if (!subject.personId && !subject.organizationId) {
    return null;
  }
  const draft = rule.draft(payload, { labels, lookup });
  if (!draft) {
    return null;
  }
  return {
    ...subject,
    kind: draft.kind,
    summary: draft.summary,
    metadata: { event: rule.definition.type, ...draft.metadata },
  };
}

/** Lo mismo desde un contrato y un payload sin validar: lo valida, y devuelve `null` si el evento no tiene regla. */
export function summarizeEvent<Definition extends DomainEventDefinition>(
  definition: Definition,
  payload: z.input<Definition["schema"]>,
  labels: TimelineLabels,
  lookup: TimelineLookup,
): TimelineEntry | null {
  const rule = RULE_BY_TYPE.get(definition.type);
  return rule ? entryFor(rule, definition.schema.parse(payload), labels, lookup) : null;
}
