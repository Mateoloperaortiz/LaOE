import { writeFileSync } from "node:fs";
import { schemaRequiredIndexes } from "./lib/release";

// Precálculo para la imagen (ADR-141): escribe la lista que db:release exige, generada desde los
// esquemas en el builder, donde sí están. El destino sale del primer argumento.
const target = process.argv[2];
if (!target) {
  throw new Error("Uso: node --import tsx scripts/required-indexes.ts <destino.json>");
}
const indexes = await schemaRequiredIndexes({});
writeFileSync(target, `${JSON.stringify(indexes, null, 2)}\n`);
process.stdout.write(`${indexes.length} índices exigidos en ${target}\n`);
