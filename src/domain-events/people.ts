import { z } from "zod";
import { defineEvent } from "./define";

// Eventos que emite `people`. Los estados, clases y propósitos viajan como texto (ADR-084 regla 5): un
// valor nuevo en un enum de la base no debe dejar eventos en dead letter.

const id = z.string().min(1);

/** Quién ejecutó el comando; `null` cuando fue el sistema (un job, un script). */
const actorId = z.string().nullable();

const person = z.object({ actorId, personId: id });

export const personUpdated = defineEvent(
  "person.updated",
  person.extend({ fields: z.array(z.string()) }),
);
export const personEmailChanged = defineEvent("person.email-changed", person);
export const personAnonymized = defineEvent("person.anonymized", person);
export const personDeletionRequested = defineEvent(
  "person.deletion-requested",
  person.extend({ requestedAt: z.string() }),
);

/** Una fila del roster aplicada: `changes` son las columnas que cambiaron. */
export const personImported = defineEvent(
  "person.imported",
  person.extend({
    termCode: z.string().min(1),
    jobId: id,
    outcome: z.string(),
    changes: z.array(z.string()),
    notes: z.string().nullable(),
  }),
);

/** Alta como miembro: lleva lo que necesita el correo de bienvenida, para que comms no consulte a people. */
export const personAdmitted = defineEvent(
  "person.admitted",
  person.extend({
    termId: id,
    termCode: z.string(),
    email: z.string().min(3),
    firstName: z.string(),
    committees: z.array(z.string()),
  }),
);

export const stageChanged = defineEvent(
  "stage.changed",
  person.extend({ from: z.string(), to: z.string() }),
);

/** `from` es `null` en el alta. `leaveUntil` solo viaja al entrar en licencia y `endReason` solo en la baja. */
export const membershipChanged = defineEvent(
  "membership.changed",
  person.extend({
    from: z.string().nullable(),
    to: z.string(),
    reason: z.string().nullable(),
    leaveUntil: z.string().nullable().optional(),
    endReason: z.string().optional(),
  }),
);

export const membershipTermChanged = defineEvent(
  "membership-term.changed",
  person.extend({
    termId: id,
    committeeId: z.string().nullable(),
    probation: z.boolean(),
    reportAsVeteran: z.boolean(),
    reason: z.string().nullable(),
  }),
);

/** Las pertenencias vivas de la persona en el término tras el cambio, con el cargo principal y todos sus cargos. */
export const committeeMembershipChanged = defineEvent(
  "committee-membership.changed",
  person.extend({
    termId: id,
    committees: z.array(
      z.object({
        committeeId: id,
        roleCode: z.string(),
        transferredIn: z.boolean(),
        roles: z.array(z.object({ roleCode: z.string(), coDirector: z.boolean() })),
      }),
    ),
  }),
);

export const committeeRemovalRequested = defineEvent(
  "committee-removal.requested",
  person.extend({ committeeId: id, termId: id, reason: z.string() }),
);

/** `editionId`, `roleCode` y `coDirector` solo viajan en la dirección de un macroevento. */
export const appointmentChanged = defineEvent(
  "appointment.changed",
  person.extend({
    action: z.string(),
    kind: z.string(),
    termId: id,
    editionId: z.string().nullable().optional(),
    roleCode: z.string().optional(),
    coDirector: z.boolean().optional(),
  }),
);

/** `source` solo viaja al otorgar. */
export const consentChanged = defineEvent(
  "consent.changed",
  person.extend({ purpose: z.string(), action: z.string(), source: z.string().optional() }),
);

export const sanctionRecorded = defineEvent(
  "sanction.recorded",
  person.extend({
    sanctionId: id,
    termId: id,
    committeeId: z.string().nullable(),
    kind: z.string(),
    cause: z.string(),
    occurredOn: z.string(),
    suspendedUntil: z.string().nullable(),
    expiresOn: z.string(),
  }),
);

export const sanctionRevoked = defineEvent(
  "sanction.revoked",
  person.extend({ sanctionId: id, termId: id, kind: z.string(), reason: z.string() }),
);
