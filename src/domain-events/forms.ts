import { z } from "zod";
import { defineEvent } from "./define";

// Eventos que emite `forms`.

const id = z.string().min(1);

/** Una respuesta inscribió a la persona en una edición de un macroevento. */
export const registrationCreated = defineEvent(
  "registration.created",
  z.object({
    actorId: z.string().nullable(),
    personId: id,
    editionId: id,
    editionName: z.string(),
    submissionId: id,
  }),
);

/**
 * Llegó una respuesta. `actions` es lo que el formulario pide hacer con ella; quien escucha lee solo
 * la acción que le toca y deja pasar las demás.
 */
export const submissionReceived = defineEvent(
  "submission.received",
  z.object({
    /** `null` en un formulario público, que responde alguien sin sesión. */
    actorId: z.string().nullable(),
    submissionId: id,
    formId: id,
    formTitle: z.string(),
    formSlug: z.string(),
    /** `null` cuando el formulario no crea ni reconoce a la persona. */
    personId: id.nullable(),
    email: z.string(),
    actions: z.looseObject({ pipelineId: id.optional(), editionId: id.optional() }),
  }),
);
