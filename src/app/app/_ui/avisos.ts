import type { Notice } from "@/modules/permanence";
import { t } from "@/shared/copy";
import { formatDate, formatDateTime } from "@/shared/lib/dates";

// Avisos de permanencia en Mi OE (ADR-036 regla 11): los textos de push T-183 a T-188 se muestran
// en la app con título y cuerpo unidos; la fase 6 los manda tal cual por push y correo.

/** Texto de un aviso (ADR-036 regla 11): título y cuerpo de T-183 a T-188 unidos con un punto. */
export function noticeText(notice: Notice, committeeNames: ReadonlyMap<string, string>): string {
  if (notice.kind === "MANDATORY_ASSEMBLY") {
    const startsAt = new Date(String(notice.values.fecha));
    const [día, hora] = formatDateTime(startsAt).split(", ");
    return t("T-183", {
      día: día ?? formatDate(startsAt),
      hora: hora ?? "",
      lugar: String(notice.values.lugar ?? notice.values.asamblea ?? ""),
    }).replace(" · ", ". ");
  }
  const values = {
    ...notice.values,
    comité: notice.committeeId ? (committeeNames.get(notice.committeeId) ?? "") : "",
    fecha:
      typeof notice.values.fecha === "string" && notice.values.fecha.includes("T")
        ? formatDateTime(new Date(notice.values.fecha))
        : typeof notice.values.fecha === "string"
          ? formatDate(new Date(`${notice.values.fecha}T12:00:00Z`))
          : "",
  };
  const code =
    notice.kind === "MID_TERM"
      ? "T-184"
      : notice.kind === "CLOSING_WARNING"
        ? "T-185"
        : notice.kind === "NO_ALCANZA"
          ? "T-186"
          : notice.kind === "EVALUATIONS_PENDING"
            ? "T-188"
            : "T-707";
  return t(code, values).replace(" · ", ". ");
}
