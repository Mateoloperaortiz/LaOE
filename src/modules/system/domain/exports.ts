import { runCommand } from "@/db/tx";

// Auditoría de exportes con datos personales (05-acceso.md: step-up y registro).
export async function recordExport(
  actorPersonId: string,
  resourceKey: string,
  rows: number,
): Promise<void> {
  await runCommand({ personId: actorPersonId }, (ctx) =>
    ctx.audit({
      action: "export.csv",
      entityType: "export",
      entityId: resourceKey,
      after: { rows },
    }),
  );
}

/** "Mis datos" (ADR-034 regla 12): la propia persona se lleva su paquete; queda auditado y en la línea de tiempo. */
export async function recordSelfExport(personId: string): Promise<void> {
  await runCommand({ personId }, async (ctx) => {
    await ctx.audit({
      action: "export.self",
      entityType: "person",
      entityId: personId,
      after: { format: "json" },
    });
    await ctx.emit({
      type: "person.data-exported",
      payload: { actorId: personId, personId },
    });
  });
}
