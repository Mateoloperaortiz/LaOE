import { OG_CONTENT_TYPE, OG_SIZE, ogResponse } from "@/shared/brand/og";
import { t } from "@/shared/copy";

// Imagen para compartir del inicio: solo textos del inventario, así se prerrenderiza en el build.

export const alt = t("T-314", { título: t("T-002") });
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogResponse({
    variante: "azul",
    eyebrow: t("T-036"),
    titulo: t("T-002"),
    subtitulo: t("T-003"),
    pie: t("T-031"),
  });
}
