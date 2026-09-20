import { z } from "zod";
import { defineEvent } from "./define";

// Eventos que emite `crm`. Los campos de tipo enumerado (estado de una inscripción o de una solicitud,
// clase de solicitud) viajan como texto: un valor nuevo no debe dejar eventos en dead letter.

const id = z.string().min(1);

/** Quien hizo el cambio; `null` cuando lo hace el sistema. */
const actorId = z.string().nullable();

// Convocatorias internas (ADR-037).

export const callOpened = defineEvent(
  "call.opened",
  z.object({
    callId: id,
    termId: id,
    groupId: id,
    title: z.string().min(1),
    closesAt: z.string().min(1),
    /** `null` cuando la convocatoria no tiene cupo. */
    capacity: z.number().int().nullable(),
    actorId,
  }),
);

export const callEntryChanged = defineEvent(
  "call-entry.changed",
  z.object({
    actorId,
    personId: id,
    callId: id,
    callTitle: z.string(),
    groupId: id,
    status: z.string(),
  }),
);

// Pipelines.

const cardFacts = z.object({
  actorId,
  cardId: id,
  pipelineId: id,
  pipelineName: z.string(),
  stageName: z.string(),
  /** Una tarjeta es de una persona o de una organización, nunca de las dos (`card_one_subject`). */
  personId: id.nullable(),
  organizationId: id.nullable(),
});

export const cardCreated = defineEvent("card.created", cardFacts);

export const cardMoved = defineEvent(
  "card.moved",
  cardFacts.extend({ fromStageName: z.string(), won: z.boolean(), lost: z.boolean() }),
);

// Reconocimientos.

export const recognitionGranted = defineEvent(
  "recognition.granted",
  z.object({
    recognitionId: id,
    personId: id,
    personName: z.string(),
    committeeId: id,
    committeeName: z.string(),
    committeeSlug: z.string(),
    termId: id,
    announcementId: id,
    actorId,
  }),
);

// Solicitudes de los miembros.

const requestFacts = z.object({
  actorId,
  personId: id,
  requestId: id,
  kind: z.string(),
  kindLabel: z.string(),
});

export const requestCreated = defineEvent("request.created", requestFacts);
export const requestWithdrawn = defineEvent("request.withdrawn", requestFacts);

/** Lleva correo y nombre porque la respuesta sale por correo aunque la persona ya no esté activa. */
export const requestDecided = defineEvent(
  "request.decided",
  requestFacts.extend({
    status: z.string(),
    reason: z.string().nullable(),
    email: z.string().min(3),
    firstName: z.string(),
  }),
);
