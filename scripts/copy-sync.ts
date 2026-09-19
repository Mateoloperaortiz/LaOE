import { readFileSync, writeFileSync } from "node:fs";
import { COPY_SOURCE, COPY_TARGET, parseCopy, renderCopy } from "./lib/copy";

// Lee docs/14-copy-y-textos.md y genera src/shared/copy/textos.generated.ts.
// El código no inventa textos: cada cadena visible sale de ahí por su código T-…

const entries = parseCopy(readFileSync(COPY_SOURCE, "utf8"));
writeFileSync(COPY_TARGET, renderCopy(entries));
process.stdout.write(`${Object.keys(entries).length} textos escritos en ${COPY_TARGET}\n`);
