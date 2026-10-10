import type { ReactNode } from "react";
import { exportLimitWarning } from "@/shared/admin-kit/export-limit";

/**
 * El aviso, ya pintado, de que el CSV de una pantalla va a salir recortado; nada si cabe entero.
 * `total` son las filas que ese exporte tendría que llevar. Es una función y no un componente: el
 * aviso queda en el árbol de la pantalla que lo pide, que es donde lo buscan sus pruebas.
 */
export function exportLimitNotice(total: number): ReactNode {
  const warning = exportLimitWarning(total);
  return warning ? (
    <output className="admin-feedback block rounded-xl border border-borde bg-oe-yellow-soft px-4 py-3 text-sm font-semibold text-oe-navy">
      {warning}
    </output>
  ) : null;
}
