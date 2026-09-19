import { readFileSync, writeFileSync } from "node:fs";
import {
  CLIENT_COPY_TARGET,
  COPY_SOURCE,
  COPY_TARGET,
  clientCopyOf,
  collectClientCodes,
  parseCopy,
  renderClientCopy,
  renderCopy,
} from "./lib/copy";

// Lee docs/14-copy-y-textos.md y genera el catálogo completo (servidor) y el subconjunto de cliente.
// El código no inventa textos: cada cadena visible sale de ahí por su código T-…

const entries = parseCopy(readFileSync(COPY_SOURCE, "utf8"));
writeFileSync(COPY_TARGET, renderCopy(entries));
const clientCopy = clientCopyOf(entries, collectClientCodes());
writeFileSync(CLIENT_COPY_TARGET, renderClientCopy(clientCopy));
process.stdout.write(
  `${Object.keys(entries).length} textos en ${COPY_TARGET}; ${Object.keys(clientCopy).length} en ${CLIENT_COPY_TARGET}\n`,
);
