import { getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { membershipChanged, personAnonymized, personEmailChanged } from "@/domain-events/people";
import { onEvent, registerHandler } from "@/jobs/registry";
import { purgeIfMembershipEnded, SIGN_IN_STATUSES } from "@/modules/people";
import { deleteAccessGrantsFor } from "./domain/access-grant";
import { deleteCalendarTokenFor } from "./domain/calendar-token";
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

onEvent(membershipChanged, async ({ personId, to }, ctx) => {
  // Un estado que este código no conozca tampoco conserva la sesión: ante la duda, se cierra.
  if (!(SIGN_IN_STATUSES as readonly string[]).includes(to)) {
    const sessions = await destroySessionsFor(getDb(), personId);
    ctx.log.info({ personId, sessions }, "sesiones cerradas por cambio de estado");
  }
  if (to === "INACTIVE") {
    // El carnet lleva época: solo se borran los de una anterior a la vigente, así que un evento
    // atrasado no toca el de quien volvió. Toma por su cuenta el candado del ciclo de membresía y por
    // eso va aparte, antes de lo demás.
    await deleteCarnetTokenFor(personId);
    // Lo demás no lleva época. Se borra solo si la baja sigue vigente, y se comprueba con el candado
    // tomado y en la misma transacción que borra (ADR-118 regla 5).
    const purged = await purgeIfMembershipEnded(personId, async (command) => {
      // El enlace del calendario es una capacidad en claro: no queda dormida esperando un reingreso
      // (ADR-116 regla 15).
      const calendarTokens = await deleteCalendarTokenFor(command.tx, personId);
      // Quien sale no vuelve a entrar: su contraseña y sus enlaces dejan de tener para qué existir
      // y no son historia institucional (ADR-030, ADR-051).
      const credentials = await deleteCredentialFor(command.tx, personId);
      const grants = await deleteAccessGrantsFor(command.tx, personId);
      const permissions = await revokeAllPermissionsFor(command, personId);
      return { calendarTokens, credentials, grants, ...permissions };
    });
    if (!purged) {
      ctx.log.info({ personId }, "baja atrasada: la persona ya volvió y conserva su acceso");
      return;
    }
    const { keptLastAdmin, ...retired } = purged;
    ctx.log.info({ personId, ...retired }, "credencial retirada por baja");
    if (keptLastAdmin) {
      ctx.log.warn({ personId }, "la persona dada de baja es el último ADMIN: conserva el permiso");
    }
  }
});

onEvent(personEmailChanged, async ({ personId }, ctx) => {
  const sessions = await destroySessionsFor(getDb(), personId);
  ctx.log.info({ personId, sessions }, "sesiones cerradas por cambio de correo");
});

onEvent(personAnonymized, async ({ personId }, ctx) => {
  await deleteCarnetTokenFor(personId);
  await deleteCalendarTokenFor(getDb(), personId);
  await deleteCredentialFor(getDb(), personId);
  await deleteAccessGrantsFor(getDb(), personId);
  await destroySessionsFor(getDb(), personId);
  const result = await runCommand(SYSTEM_ACTOR, (command) =>
    revokeAllPermissionsFor(command, personId),
  );
  ctx.log.info({ personId, ...result }, "acceso retirado por anonimización");
});
