"use client";

import { t } from "@/shared/copy/client";

export function PrintButton() {
  return (
    <button
      type="button"
      className="boton-calido inventory-print-hide"
      onClick={() => window.print()}
    >
      {t("T-4350")}
    </button>
  );
}
