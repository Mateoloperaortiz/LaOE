import { z } from "zod";
import { getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { registerHandler } from "@/jobs/registry";
import { SIGN_IN_STATUSES } from "@/modules/people";
import { deleteAccessGrantsFor } from "./domain/access-grant";
import { deleteCarnetTokenFor } from "./domain/carnet-token";
import { pruneIdentity } from "./domain/maintenance";
import { deleteCredentialFor } from "./domain/password";
import { revokeAllPermissionsFor } from "./domain/permissions";
import { destroySessionsFor } from "./domain/session";

// Efectos de identidad sobre eventos de `people` (ADR-034): el acceso ya se cortó en la misma
// transacción con `sessionsRevokedAt`; aquí se borran las sesiones y se revocan los permisos.

registerHandler("identity.prune", async (_payload, ctx) => {
  const result = await pruneIdentity();
  ctx.log.info(result, "identity depurado");
});

const membershipChanged = z.object({
  personId: z.string().min(1),
  to: z.enum(["ACTIVE", "ON_LEAVE", "HONORARY", "INACTIVE"]),
});

registerHandler("membership.changed", async (payload, ctx) => {
  const { personId, to } = membershipChanged.parse(payload);
  if (!SIGN_IN_STATUSES.includes(to)) {
    const sessions = await destroySessionsFor(getDb(), personId);
    ctx.log.info({ personId, sessions }, "sesiones cerradas por cambio de estado");
  }
  if (to === "INACTIVE") {
    await deleteCarnetTokenFor(personId);
    // Quien sale no vuelve a entrar: su contraseña y sus enlaces dejan de tener para qué existir
    // y no son historia institucional (ADR-030, ADR-051).
    const credentials = await deleteCredentialFor(personId);
    const grants = await deleteAccessGrantsFor(personId);
    ctx.log.info({ personId, credentials, grants }, "credencial retirada por baja");
    const result = await runCommand(SYSTEM_ACTOR, (command) =>
      revokeAllPermissionsFor(command, personId),
    );
    if (result.keptLastAdmin) {
      ctx.log.warn({ personId }, "la persona dada de baja es el último ADMIN: conserva el permiso");
    }
  }
});

const personEvent = z.object({ personId: z.string().min(1) });

registerHandler("person.email-changed", async (payload, ctx) => {
  const { personId } = personEvent.parse(payload);
  const sessions = await destroySessionsFor(getDb(), personId);
  ctx.log.info({ personId, sessions }, "sesiones cerradas por cambio de correo");
});

registerHandler("person.anonymized", async (payload, ctx) => {
  const { personId } = personEvent.parse(payload);
  await deleteCarnetTokenFor(personId);
  await deleteCredentialFor(personId);
  await deleteAccessGrantsFor(personId);
  await destroySessionsFor(getDb(), personId);
  const result = await runCommand(SYSTEM_ACTOR, (command) =>
    revokeAllPermissionsFor(command, personId),
  );
  ctx.log.info({ personId, ...result }, "acceso retirado por anonimización");
});
