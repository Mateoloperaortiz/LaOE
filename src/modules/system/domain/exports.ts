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
