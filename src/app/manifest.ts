import type { MetadataRoute } from "next";
import { t } from "@/shared/copy";

// Manifest de la PWA (ADR-038 regla 4): Mi OE instalable, con los iconos generados por
// scripts/pwa-icons.ts y los colores de la marca (paper y navy, 07-marca §3).

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/app",
    name: t("T-1174"),
    short_name: t("T-1173"),
    description: t("T-003"),
    start_url: "/app",
    scope: "/",
    display: "standalone",
    background_color: "#F6F6F6",
    theme_color: "#001F3E",
    lang: "es-CO",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
