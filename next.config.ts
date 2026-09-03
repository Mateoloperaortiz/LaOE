import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  // Paquetes con módulos nativos o hilos de trabajo: se cargan desde node_modules, no se empaquetan.
  serverExternalPackages: ["pg", "pino", "pino-pretty", "sharp"],
};

export default nextConfig;
