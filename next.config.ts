import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ADR-141: la imagen de despliegue corre el servidor standalone; Railpack sigue usando `next start`.
  output: "standalone",
  reactCompiler: true,
  poweredByHeader: false,
  // Paquetes con módulos nativos o hilos de trabajo: se cargan desde node_modules, no se empaquetan.
  serverExternalPackages: ["exceljs", "passkit-generator", "pg", "pino", "pino-pretty", "sharp"],
};

export default nextConfig;
