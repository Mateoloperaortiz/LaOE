import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { segmentsResource } from "@/modules/people/admin";
import { exportLimitWarning } from "@/shared/admin-kit/export-limit";
import { ResourceTable } from "@/shared/admin-kit/ResourceTable";
import { EXPORT_ROW_LIMIT } from "@/shared/admin-kit/types";
import { t } from "@/shared/copy";

// El aviso de que un CSV sale recortado, fuera del listado del kit (DT-250 inciso b, ADR-121 regla 12).

// La tabla monta componentes de marca que cargan sus fuentes con `next/font`, que fuera de Next no existe.
vi.mock("next/font/local", () => ({ default: () => ({ className: "", variable: "" }) }));

const over = EXPORT_ROW_LIMIT + 1;

function segment(count: number) {
  return { id: "segmento-sintetico", name: "Segmento", filter: {}, count, createdAt: new Date(0) };
}

function exportCell(count: number) {
  const column = segmentsResource.columns.find((item) => item.key === "export");
  if (!column) {
    throw new Error("el recurso de segmentos no tiene la columna del exporte");
  }
  return column.render(segment(count) as never);
}

describe("exportLimitWarning", () => {
  it("avisa con el tope y el total cuando el CSV no cabe entero, y calla cuando cabe", () => {
    expect(exportLimitWarning(over)).toBe(t("T-3249", { n: EXPORT_ROW_LIMIT, total: over }));
    expect(exportLimitWarning(EXPORT_ROW_LIMIT)).toBeNull();
    expect(exportLimitWarning(0)).toBeNull();
  });
});

describe("el enlace de exporte de un segmento", () => {
  it("lleva el aviso al lado cuando el segmento tiene más personas que el tope", () => {
    expect(exportCell(over)).toEqual({
      text: t("T-472"),
      href: "/api/export/personas?segmento=segmento-sintetico&pantalla=%2Fadmin%2Fsegmentos",
      note: t("T-3249", { n: EXPORT_ROW_LIMIT, total: over }),
    });
  });

  it("no lleva aviso cuando el segmento cabe entero", () => {
    expect(exportCell(EXPORT_ROW_LIMIT)).toEqual({
      text: t("T-472"),
      href: "/api/export/personas?segmento=segmento-sintetico&pantalla=%2Fadmin%2Fsegmentos",
    });
  });

  it("la tabla del kit pinta la nota de una celda con enlace debajo del enlace", () => {
    const note = t("T-3249", { n: EXPORT_ROW_LIMIT, total: over });
    const html = renderToStaticMarkup(
      ResourceTable({
        columns: [
          {
            key: "export",
            label: "Exporte",
            render: () => ({ text: "Exportar", href: "/api/export/personas", note }),
          },
        ],
        rows: [{ id: "fila-sintetica" }],
        emptyMessage: "",
      } as never),
    );
    expect(html).toContain("Exportar</a>");
    expect(html).toContain(note.replace(/&/g, "&amp;"));
  });
});
