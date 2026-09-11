import type { KnipConfig } from "knip";

// knip no lee CSS: este compilador extrae los @import (Tailwind) para que cuenten como uso.
const config: KnipConfig = {
  entry: [
    "scripts/*.ts",
    "scripts/ci/run.mjs",
    "src/modules/*/index.ts",
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
