import { and, eq } from "drizzle-orm";
import type { CommandContext } from "@/db/tx";
import { committeeMembership, committeeRepresentative } from "../schema";
import { endRoles } from "./committee-role-assignments";

// Cierre de una pertenencia a un comité (ADR-118 regla 6): un solo sitio sella `leftAt`, cierra los
// cargos vivos y retira la representación ante la Asamblea Directiva. Lo usan todos los caminos que
// cierran una pertenencia: el cambio de comités, la salida por el cierre de permanencia, la baja y
// la anonimización. No recalcula las asambleas ya cerradas (decisión abierta 39).

export interface ClosingMembership {
  id: string;
  personId: string;
  committeeId: string;
  termId: string;
}

export async function closeCommitteeMembership(
  ctx: CommandContext,
  row: ClosingMembership,
  now: Date,
): Promise<void> {
  await ctx.tx
    .update(committeeMembership)
    .set({ leftAt: now })
    .where(eq(committeeMembership.id, row.id));
  await endRoles(ctx.tx, row.id, now);
  const retired = await ctx.tx
    .delete(committeeRepresentative)
    .where(
      and(
        eq(committeeRepresentative.committeeId, row.committeeId),
        eq(committeeRepresentative.termId, row.termId),
        eq(committeeRepresentative.personId, row.personId),
      ),
    )
    .returning({ role: committeeRepresentative.role });
  for (const { role } of retired) {
    // Misma acción que un nombramiento: el historial del rol se lee de corrido.
    await ctx.audit({
      action: "committee-representative.set",
      entityType: "committee",
      entityId: row.committeeId,
      before: { termId: row.termId, role, personId: row.personId },
      after: { termId: row.termId, role, personId: null, cause: "membership-closed" },
    });
  }
}
