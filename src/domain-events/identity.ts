import { z } from "zod";
import { defineEvent } from "./define";

// Eventos que emite `identity`. El código de un permiso y la clase de un enlace viajan como texto.

const id = z.string().min(1);

/** Se emitió un enlace de activación o de recuperación para la cuenta de esta persona (ADR-051). */
export const accessGrantIssued = defineEvent(
  "access-grant.issued",
  z.object({ personId: id, kind: z.string(), issuedById: z.string().nullable() }),
);

/** El carné cambió de token: las billeteras tienen que refrescar el pase. */
export const carnetTokenRotated = defineEvent(
  "carnet-token.rotated",
  z.object({ personId: id, walletEpoch: z.number().int(), revision: z.number().int() }),
);

const permissionFacts = z.object({
  /** `null` cuando lo otorga el sistema, como el primer ADMIN del arranque. */
  actorId: z.string().nullable(),
  personId: id,
  code: z.string(),
  /** Solo los permisos de comité llevan comité. */
  committeeId: id.nullable(),
});

export const permissionGranted = defineEvent("permission.granted", permissionFacts);
export const permissionRevoked = defineEvent("permission.revoked", permissionFacts);
