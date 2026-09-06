import type { KnipConfig } from "knip";

// knip no lee CSS: este compilador extrae los @import (Tailwind) para que cuenten como uso.
const config: KnipConfig = {
  entry: ["scripts/*.ts", "src/modules/*/index.ts", "tests/e2e/auth.setup.ts", ".railway/**/*.ts"],
  project: ["src/**/*.{ts,tsx,css}", "scripts/**/*.ts", "tests/**/*.ts", ".railway/**/*.ts"],
  compilers: {
    css: (texto: string) => [...texto.matchAll(/(?<=@)import[^;]+/g)].join("\n"),
  },
  ignoreDependencies: ["pino-pretty"],
  ignoreExportsUsedInFile: true,
};

export default config;
