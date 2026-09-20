import { eq } from "drizzle-orm";
import type { CommandContext } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { stageChanged } from "@/domain-events/people";
import { person } from "../schema";

// Etapas por comando (ADR-003, ADR-037 regla 7): un prospecto pasa a postulante cuando entra a un
// pipeline de admisión; a miembro solo con "dar de alta" (admission.ts).

/** Marca a un prospecto como postulante; idempotente para quien ya avanzó. */
export async function markApplicant(ctx: CommandContext, personId: string): Promise<boolean> {
  const [who] = await ctx.tx
    .select({ stage: person.stage })
    .from(person)
    .where(eq(person.id, personId))
    .for("update");
  if (!who || who.stage !== "PROSPECT") {
    return false;
  }
  await ctx.tx.update(person).set({ stage: "APPLICANT" }).where(eq(person.id, personId));
  await ctx.audit({
    action: "person.stage-changed",
    entityType: "person",
    entityId: personId,
    before: { stage: "PROSPECT" },
    after: { stage: "APPLICANT" },
  });
  await ctx.emit(
    eventOf(stageChanged, {
      actorId: ctx.actor.personId,
      personId,
      from: "PROSPECT",
      to: "APPLICANT",
    }),
  );
  return true;
}
