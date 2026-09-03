import { OG_CONTENT_TYPE, OG_SIZE, ogResponse } from "@/shared/brand/og";
import { t } from "@/shared/copy";

export const alt = t("T-314", { título: t("T-309") });
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogResponse({
    variante: "navy",
    eyebrow: t("T-036"),
    titulo: t("T-309"),
    subtitulo: t("T-022"),
    pie: t("T-031"),
  });
}
