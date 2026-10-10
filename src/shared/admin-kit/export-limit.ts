import { t } from "@/shared/copy";
import { EXPORT_ROW_LIMIT } from "./types";

/**
 * El aviso de que un CSV de `total` filas va a salir recortado (T-3249, ADR-118 regla 13), o `null` si
 * cabe entero. Lo usan el listado del kit y las pantallas que arman su enlace de exporte por fuera
 * (ADR-121 regla 12).
 */
export function exportLimitWarning(total: number): string | null {
  return total > EXPORT_ROW_LIMIT ? t("T-3249", { n: EXPORT_ROW_LIMIT, total }) : null;
}
