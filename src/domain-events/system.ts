import { z } from "zod";
import { defineEvent } from "./define";

// Eventos que emite `system`.

/** La persona descargó sus datos (ADR-030). */
export const personDataExported = defineEvent(
  "person.data-exported",
  z.object({ actorId: z.string().min(1), personId: z.string().min(1) }),
);
