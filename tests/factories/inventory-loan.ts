import { createId } from "@paralleldrive/cuid2";
import { getDb } from "@/db/client";
import { reserveAs } from "@/modules/inventory";
import { inventoryLoanApproval } from "@/modules/inventory/schema";

type ReserveInput = Parameters<typeof reserveAs>[1];
/** Los recorridos de disponibilidad y entrega parten de una lista ya avalada. */
export async function reserveFromApprovedList(
  actor: Parameters<typeof reserveAs>[0],
  input: Omit<ReserveInput, "approvalId" | "requestKey">,
) {
  if (!actor.personId) throw new Error("Falta el director de la prueba");
  const id = createId();
  await getDb()
    .insert(inventoryLoanApproval)
    .values({
      id,
      requesterId: actor.personId,
      sourceKind: input.sourceKind,
      sourceId: input.sourceId,
      scopeLabel: "Logística de prueba",
      purpose: "OTHER",
      eventStartsOn: input.startsAt.slice(0, 10),
      eventEndsOn: input.endsAt.slice(0, 10),
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      title: "Préstamo de prueba",
      minutes: "Acta sintética",
      supportingRecord: "Soporte de prueba",
      lateReason: "",
      lines: input.lines.map((line) => ({ ...line, name: "Material de prueba" })),
      fingerprint: id,
      status: "APPROVED",
      decidedAt: new Date(),
      decidedAs: "HOLDER",
    });
  return reserveAs(actor, { ...input, approvalId: id, requestKey: createId() });
}
