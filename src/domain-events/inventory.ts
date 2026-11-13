import { z } from "zod";
import { defineEvent } from "./define";

/** Solo referencias: las notas de gestión se leen con autorización en su incidencia. */
export const inventoryIncidentReferred = defineEvent(
  "inventory.incident-referred",
  z.object({
    incidentId: z.string().min(1),
    reservationId: z.string().min(1),
    personId: z.string().min(1),
    actorId: z.string().min(1),
    termId: z.string().min(1),
    committeeId: z.string().nullable(),
  }),
);

/** La pasada horaria de los avisos de devolución (ADR-191 regla 8). */
export const inventoryReturnReminder = defineEvent(
  "inventory.return-reminder",
  z.object({ at: z.string().optional() }),
);
