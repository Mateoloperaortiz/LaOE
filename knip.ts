import type { KnipConfig } from "knip";

// knip no lee CSS: este compilador extrae los @import (Tailwind) para que cuenten como uso.
const config: KnipConfig = {
  // Los scripts entran por `package.json` y los de CI por el workflow: uno que nadie invoque aparece
  // como archivo sin uso. Las excepciones se nombran una por una.
  entry: [
    // Medición del generador que cita ADR-078; se corre a mano.
    "scripts/sudoku-bench.ts",
    // De los `index.ts` de los módulos solo es entrada el de `competition`, que está quieto hasta la
    // decisión abierta 8: knip no analiza los exports de una entrada, y los otros trece salieron de acá
    // al cerrar la poda (ADR-125 reglas 3 y 5). `tests/unit/module-public-interface.test.ts` importa
    // este archivo y no deja que vuelva ninguno por un patrón de `entry`: lee cada patrón como knip
    // (sin el `!` del final, la ruta absoluta como relativa) y lo expande. Tampoco por otra opción:
    // este archivo trae solo las de la lista `KNIP_OPTIONS` de esa prueba, y una nueva (`ignore`,
    // `exclude`, `rules`, un plugin) la pone en rojo hasta que entre ahí con su razón. Y `project`,
    // más abajo, es el de su lista `KNIP_PROJECT`, entero: cambia acá y allá en el mismo diff.
    "src/modules/competition/index.ts",
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
