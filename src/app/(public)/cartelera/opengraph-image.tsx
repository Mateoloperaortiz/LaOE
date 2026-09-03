import { OG_CONTENT_TYPE, OG_SIZE, ogResponse } from "@/shared/brand/og";
import { t } from "@/shared/copy";

export const alt = t("T-314", { título: t("T-301") });
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogResponse({
    variante: "amarillo",
    eyebrow: t("T-036"),
    titulo: t("T-301"),
    subtitulo: t("T-007"),
    pie: t("T-031"),
  });
}
