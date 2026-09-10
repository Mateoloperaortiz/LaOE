import { z } from "zod";
import { SYSTEM_ACTOR } from "@/db/tx";
import { getEnv } from "@/env";
import { issueAccessGrantAs } from "@/modules/identity";
import { findEligibleMemberByEmail } from "@/modules/people";

// Arranque del acceso (ADR-051, regla 16), hermano del bootstrap de ADR-039: emite un enlace de
// activación sin sesión, para la primera contraseña de la junta y como único camino de vuelta si
// todos los ADMIN pierden el acceso con el correo caído. El enlace se imprime una sola vez.

const inputSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email()),
    kind: z.enum(["ACTIVATION", "RECOVERY"]).default("ACTIVATION"),
  })
  .strict();

export interface BootstrapAccessResult {
  url: string;
  expiresAt: Date;
  personId: string;
}

/** Mensajes operativos que se pueden imprimir sin revelar el correo ni el enlace. */
export class BootstrapAccessError extends Error {}

export async function bootstrapAccess(raw: unknown): Promise<BootstrapAccessResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    throw new BootstrapAccessError("Uso: --email <correo institucional> [--kind RECOVERY]");
  }
  // El esquema ya bajó el correo a minúsculas, que es como se guarda la identidad.
  const member = await findEligibleMemberByEmail(parsed.data.email);
  if (!member) {
    throw new BootstrapAccessError(
      "Ese correo no corresponde a una persona del roster que pueda entrar",
    );
  }
  // Sin actor: la emisión queda auditada como del sistema, no a nombre de nadie.
  const { token, expiresAt } = await issueAccessGrantAs(SYSTEM_ACTOR, {
    personId: member.personId,
    kind: parsed.data.kind,
  });
  return {
    url: `${getEnv().APP_URL.replace(/\/$/, "")}/activar/${token}`,
    expiresAt,
    personId: member.personId,
  };
}
