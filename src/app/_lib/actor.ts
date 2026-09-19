import { requireAdminActor } from "@/modules/identity";
import { clientIp } from "@/shared/lib/request";

// Quién ejecuta un comando, con la IP del request (ADR-082). `runCommand` escribe la IP del actor en la
// auditoría: armar el actor a mano como `{ personId }` dejaba sin IP justo las acciones más sensibles
// del admin (anonimizar, cambiar el estado de la membresía, sancionar, aplicar el roster).

export interface CommandActor {
  personId: string;
  ip: string | null;
}

export async function actorContext(actor: { personId: string }): Promise<CommandActor> {
  return { personId: actor.personId, ip: await clientIp() };
}

/**
 * Lo mismo, conservando el actor de sesión: para los comandos que además autorizan con él
 * (`assertAdmin`, permisos por comité) y por eso no aceptan el actor mínimo.
 */
export async function sessionActorContext<Session extends { personId: string }>(
  actor: Session,
): Promise<Session & { ip: string | null }> {
  return { ...actor, ip: await clientIp() };
}

/** Guard de ADMIN y actor del comando en un paso, para las actions que no necesitan nada más del actor. */
export async function requireAdminContext(returnTo: string): Promise<CommandActor> {
  return actorContext(await requireAdminActor(returnTo));
}
