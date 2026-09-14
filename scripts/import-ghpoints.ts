import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadGhEvidence, sha256 } from "./lib/ghpoints-files";
import {
  GhImportError,
  type GhSnapshot,
  ghManifestSchema,
  planGhImport,
  stableJson,
} from "./lib/ghpoints-plan";

// Vista previa por defecto. --apply es un paso explícito, con ADMIN, hash revisado y reconsulta.
const { values } = parseArgs({
  options: {
    manifest: { type: "string" },
    out: { type: "string" },
    snapshot: { type: "string" },
    environment: { type: "string" },
    apply: { type: "boolean", default: false },
    "actor-id": { type: "string" },
    "plan-hash": { type: "string" },
    "skip-blocked": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  strict: true,
});
if (values.help) {
  print(
    "Vista previa: npm run ghpoints:import -- --manifest /ruta/manifiesto.json --environment production --out /ruta/plan.json\nOpcional: --snapshot /ruta/consulta.json (solo lectura local).\nCarga: agregar --apply --actor-id ADMIN_ID --plan-hash HASH_REVISADO; --skip-blocked omite explícitamente las filas retenidas.",
  );
} else {
  let close: (() => Promise<void>) | undefined;
  try {
    if (!values.manifest || !values.out || !values.environment)
      throw new GhImportError("Faltan --manifest, --out y --environment");
    if (values.apply && values.snapshot)
      throw new GhImportError("Aplicar exige reconsultar la base; no admite --snapshot");
    if (values.apply && (!values["actor-id"] || !values["plan-hash"]))
      throw new GhImportError("Aplicar exige --actor-id y --plan-hash");
    const input = await readFile(values.manifest, "utf8");
    if (Buffer.byteLength(input) > 5 * 1024 * 1024)
      throw new GhImportError("El manifiesto supera 5 MB");
    const manifest = ghManifestSchema.parse(JSON.parse(input));
    const files = await loadGhEvidence(manifest, path.dirname(path.resolve(values.manifest)));
    if (values.snapshot) {
      const snapshot = JSON.parse(await readFile(values.snapshot, "utf8")) as GhSnapshot;
      if (snapshot.environment !== values.environment)
        throw new GhImportError("El entorno de la consulta no coincide");
      const plan = planGhImport(manifest, snapshot);
      await writeFile(values.out, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
      print(JSON.stringify({ mode: "PREVIEW", ...plan.summary, planHash: plan.planHash }));
    } else {
      const { getDb, closeDb } = await import("@/db/client");
      close = closeDb;
      const { previewGhImport, applyGhImport, requireGhImportAdmin } = await import(
        "./lib/ghpoints-db"
      );
      const plan = await previewGhImport(manifest, values.environment);
      if (!values.apply) {
        await writeFile(values.out, `${JSON.stringify(plan, null, 2)}\n`, { mode: 0o600 });
        print(JSON.stringify({ mode: "PREVIEW", ...plan.summary, planHash: plan.planHash }));
      } else {
        const actorId = values["actor-id"];
        const reviewedHash = values["plan-hash"];
        if (!actorId || !reviewedHash) throw new GhImportError("Falta la autorización de carga");
        if (plan.planHash !== reviewedHash)
          throw new GhImportError("Cambió la vista previa; regenerala");
        if (
          plan.activities.some((a) => a.action === "BLOCKED") ||
          plan.ruleChanges.some((r) => r.action === "BLOCKED") ||
          (plan.summary.rowsBlocked && !values["skip-blocked"])
        )
          throw new GhImportError("La vista previa tiene retenciones o conflictos sin resolver");
        await requireGhImportAdmin(getDb(), actorId);
        const { putObject } = await import("@/shared/adapters/storage");
        const evidenceKeys: Record<string, string> = {};
        for (const source of manifest.sources) {
          const file = files.get(source.key);
          if (!file) throw new GhImportError("Falta evidencia");
          const key = `imports/ghpoints/${manifest.batchId}/${source.sha256}${path.extname(file.path).toLowerCase()}`;
          await putObject(key, file.bytes, file.contentType);
          evidenceKeys[source.key] = key;
        }
        const manifestBody = stableJson(manifest);
        const manifestKey = `imports/ghpoints/${manifest.batchId}/${sha256(manifestBody)}.json`;
        await putObject(manifestKey, manifestBody, "application/json");
        const result = await applyGhImport(manifest, {
          actorId,
          environment: values.environment,
          planHash: reviewedHash,
          skipBlocked: Boolean(values["skip-blocked"]),
          evidenceKeys,
          manifestKey,
        });
        await writeFile(values.out, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
        print(JSON.stringify(result));
      }
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Falló la importación"}\n`);
    process.exitCode = 1;
  } finally {
    await close?.();
  }
}

function print(value: string) {
  process.stdout.write(`${value}\n`);
}
