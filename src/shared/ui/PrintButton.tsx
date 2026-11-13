"use client";

import { t } from "@/shared/copy/client";
import { PrinterIcon } from "@/shared/ui/icons/PrinterIcon";

// Imprimir una pantalla (ADR-167 regla 6): abre lo plegado de lo que se imprime, llama al diálogo del
// navegador, que también guarda como PDF, y deja todo como estaba al terminar. La hoja de impresión de
// la Operación quita el marco, los botones y los formularios.

export function PrintButton() {
  return (
    <button
      type="button"
      data-no-imprimir
      className="boton-secundario inline-flex min-h-11 items-center gap-2 px-4 py-2 text-sm"
      onClick={() => {
        const closed = Array.from(
          document.querySelectorAll<HTMLDetailsElement>("[data-imprimir] details:not([open])"),
        );
        for (const details of closed) details.open = true;
        const restore = () => {
          for (const details of closed) details.open = false;
          window.removeEventListener("afterprint", restore);
        };
        window.addEventListener("afterprint", restore);
        window.print();
      }}
    >
      <PrinterIcon size={16} />
      {t("T-4908")}
    </button>
  );
}
