import { runCommand } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { personDataExported } from "@/domain-events/system";

/** Quien se lleva el exporte y desde qué IP: lo arma la ruta con el actor del request (ADR-082 regla 2). */
interface ExportActor {
  personId: string;
  ip: string | null;
}

/**
 * Auditoría de exportes con datos personales (05-acceso.md: step-up y registro). Guarda las filas que
 * viajaron y el total real del listado: si difieren, el archivo salió recortado (ADR-118 regla 13).
 */
export async function recordExport(
  actor: ExportActor,
  resourceKey: string,
  counts: { rows: number; total: number },
): Promise<void> {
  await runCommand({ personId: actor.personId, ip: actor.ip }, (ctx) =>
    ctx.audit({
      action: "export.csv",
      entityType: "export",
      entityId: resourceKey,
      after: { rows: counts.rows, total: counts.total },
    }),
  );
}

/** "Mis datos" (ADR-034 regla 12): la propia persona se lleva su paquete; queda auditado y en la línea de tiempo. */
export async function recordSelfExport(actor: ExportActor): Promise<void> {
  const { personId } = actor;
  await runCommand({ personId, ip: actor.ip }, async (ctx) => {
    await ctx.audit({
      action: "export.self",
      entityType: "person",
      entityId: personId,
      after: { format: "json" },
    });
    await ctx.emit(eventOf(personDataExported, { actorId: personId, personId }));
  });
}
