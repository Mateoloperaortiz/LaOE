import { parseArgs } from "node:util";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { recomputeSnapshots } from "@/modules/permanence";
import { requireConfig } from "@/modules/system";
import { listAllTerms } from "@/modules/terms";

// Ejecutar con el entorno confirmado después de desplegar ADR-157; no carga .env ni aplica cierres.
try {
  const { values } = parseArgs({
    options: { apply: { type: "boolean" } },
    allowPositionals: false,
  });
  const policy = await requireConfig("permanence.probationMargins2026");
  if (policy.active !== 10) throw new Error("Falta la política nueva");
  const terms = (await listAllTerms()).filter(
    (term) => term.code >= "2026-2" && !term.permanenceClosedAt,
  );
  for (const term of terms) {
    const count = values.apply ? await recomputeSnapshots(term.id) : null;
    if (values.apply)
      await runCommand(SYSTEM_ACTOR, (ctx) =>
        ctx.audit({
          action: "permanence.normative_recomputed",
          entityType: "term",
          entityId: term.id,
          after: { policy: "2026-2", snapshots: count },
        }),
      );
    process.stdout.write(
      `${term.code}: ${count === null ? "pendiente de --apply" : `${count} resultados recalculados`}\n`,
    );
  }
} catch {
  process.stderr.write("No se completó el recálculo. Revisa el entorno y la migración 0063.\n");
  process.exitCode = 1;
} finally {
  await closeDb();
}
