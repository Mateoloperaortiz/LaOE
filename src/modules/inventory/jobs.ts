import { eq, inArray, or } from "drizzle-orm";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { inventoryReturnReminder } from "@/domain-events/inventory";
import { personAnonymized } from "@/domain-events/people";
import { onEvent } from "@/jobs/registry";
import { t } from "@/shared/copy";
import { sendReturnReminders } from "./domain/reminders";
import { inventoryIncident, inventoryReservation } from "./schema";

// Los saldos y movimientos siguen explicando el stock; la historia ya no identifica a la persona.
onEvent(personAnonymized, async ({ personId }) => {
  await runCommand(SYSTEM_ACTOR, async ({ tx }) => {
    const affected = await tx
      .select({ id: inventoryReservation.id })
      .from(inventoryReservation)
      .where(
        or(
          eq(inventoryReservation.requesterId, personId),
          eq(inventoryReservation.collectorId, personId),
        ),
      );
    await tx
      .update(inventoryReservation)
      .set({ requesterName: t("T-4213"), cancelReason: null })
      .where(eq(inventoryReservation.requesterId, personId));
    await tx
      .update(inventoryReservation)
      .set({ collectorName: t("T-4213") })
      .where(eq(inventoryReservation.collectorId, personId));
    await tx
      .update(inventoryIncident)
      .set({ note: t("T-4213"), management: "" })
      .where(
        or(
          eq(inventoryIncident.createdById, personId),
          affected.length
            ? inArray(
                inventoryIncident.reservationId,
                affected.map((row) => row.id),
              )
            : undefined,
        ),
      );
  });
});

// Cada hora: lo que hay que devolver mañana y lo que se venció (ADR-191 regla 8).
onEvent(inventoryReturnReminder, async ({ at }, ctx) => {
  const parsed = at ? new Date(at) : ctx.now;
  const now = Number.isNaN(parsed.getTime()) ? ctx.now : parsed;
  const result = await runCommand(SYSTEM_ACTOR, (command) => sendReturnReminders(command, now));
  if (result.soon + result.overdue > 0) ctx.log.info(result, "avisos de devolución encolados");
});
