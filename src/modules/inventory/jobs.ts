import { eq, inArray, or } from "drizzle-orm";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { personAnonymized } from "@/domain-events/people";
import { onEvent } from "@/jobs/registry";
import { t } from "@/shared/copy";
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
