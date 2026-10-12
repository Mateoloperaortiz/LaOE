import type { KnipConfig } from "knip";

// knip no lee CSS: este compilador extrae los @import (Tailwind) para que cuenten como uso.
const config: KnipConfig = {
  // Los scripts entran por `package.json` y los de CI por el workflow: uno que nadie invoque aparece
  // como archivo sin uso. Las excepciones se nombran una por una.
  entry: [
    // Medición del generador que cita ADR-078; se corre a mano.
    "scripts/sudoku-bench.ts",
    // El `index.ts` de un módulo es entrada solo mientras le quede algo por podar o sea el de
    // `competition`, que está quieto (ADR-125 regla 3): knip no analiza los exports de una entrada.
    // Van uno por uno, sin patrón: el módulo que vacía su clase `nadie` en
    // `tests/unit/module-public-interface.test.ts` sale de acá en el mismo commit, y esa prueba lo exige.
    "src/modules/competition/index.ts",
    "src/modules/participation/index.ts",
    "tests/e2e/auth.setup.ts",
    ".railway/**/*.ts",
  ],
  project: ["src/**/*.{ts,tsx,css}", "scripts/**/*.{ts,mjs}", "tests/**/*.ts", ".railway/**/*.ts"],
  compilers: {
    css: (texto: string) => [...texto.matchAll(/(?<=@)import[^;]+/g)].join("\n"),
  },
  ignoreDependencies: ["pino-pretty"],
  // OpenSSL verifica pases sintéticos; uv ejecuta el extractor Python con dependencias fijadas.
  ignoreBinaries: ["openssl", "uv"],
  ignoreExportsUsedInFile: true,
};

export default config;
