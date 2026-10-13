import { copySyncReport, REORDER_CONFIRMATION, syncCopy } from "./lib/copy";

// Lee docs/14-copy-y-textos.md y genera el catálogo completo (servidor) y el subconjunto de cliente.
// El código no inventa textos: cada cadena visible sale de ahí por su código T-…
//
// Antes de escribir compara cada lista con la del generado anterior. Si una trae las mismas piezas en
// otro orden no escribe nada y termina con error, hasta que se la confirme por su código en
// `COPY_SYNC_REORDERED` (ADR-128 regla 9). Nunca pregunta: lo corren agentes sin terminal.

const report = copySyncReport(syncCopy({ confirmed: process.env[REORDER_CONFIRMATION] }));
process.stderr.write(report.err);
process.stdout.write(report.out);
process.exitCode = report.code;
