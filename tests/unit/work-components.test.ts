import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchBar } from "@/shared/ui/BatchBar";
import { buttonClass } from "@/shared/ui/Button";
import { Checkbox, RadioGroup, Switch } from "@/shared/ui/Choice";
import { ErrorSummary } from "@/shared/ui/ErrorSummary";
import { Field, Select, TextArea, TextInput } from "@/shared/ui/Field";
import {
  formatCount,
  isTextEntry,
  listCommand,
  moveIndex,
  selectionState,
} from "@/shared/ui/list-navigation";
import { SplitView } from "@/shared/ui/SplitView";
import { WorkTable } from "@/shared/ui/WorkTable";

// Componentes de trabajo del tramo R6-B (ADR-159 regla 5, con el aspecto de ADR-163).

describe("selección y atajos de una lista", () => {
  it("la selección está vacía, a medias o completa", () => {
    expect(selectionState(0, 5)).toBe("none");
    expect(selectionState(2, 5)).toBe("some");
    expect(selectionState(5, 5)).toBe("all");
    expect(selectionState(0, 0)).toBe("none");
  });

  it("la cuenta usa la forma singular o plural", () => {
    const label = { one: "{n} seleccionada", other: "{n} seleccionadas" };
    expect(formatCount(1, label)).toBe("1 seleccionada");
    expect(formatCount(3, label)).toBe("3 seleccionadas");
  });

  it("J baja, K sube y X marca, sin teclas modificadoras", () => {
    const row = { tagName: "A" };
    expect(listCommand({ key: "j" }, row)).toBe("next");
    expect(listCommand({ key: "K" }, row)).toBe("previous");
    expect(listCommand({ key: "x" }, row)).toBe("toggle");
    expect(listCommand({ key: "j", metaKey: true }, row)).toBeNull();
    expect(listCommand({ key: "k", ctrlKey: true }, row)).toBeNull();
    expect(listCommand({ key: "Enter" }, row)).toBeNull();
  });

  it("ningún atajo actúa mientras se escribe, pero sí desde una casilla", () => {
    expect(isTextEntry({ tagName: "INPUT", type: "text" })).toBe(true);
    expect(isTextEntry({ tagName: "INPUT", type: "" })).toBe(true);
    expect(isTextEntry({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTextEntry({ tagName: "SELECT" })).toBe(true);
    expect(isTextEntry({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTextEntry({ tagName: "INPUT", type: "checkbox" })).toBe(false);
    expect(listCommand({ key: "j" }, { tagName: "INPUT", type: "search" })).toBeNull();
    expect(listCommand({ key: "x" }, { tagName: "INPUT", type: "checkbox" })).toBe("toggle");
  });

  it("sin fila actual, J entra por la primera y K por la última, y no da la vuelta", () => {
    expect(moveIndex(-1, 4, "next")).toBe(0);
    expect(moveIndex(-1, 4, "previous")).toBe(3);
    expect(moveIndex(1, 4, "next")).toBe(2);
    expect(moveIndex(3, 4, "next")).toBe(3);
    expect(moveIndex(0, 4, "previous")).toBe(0);
    expect(moveIndex(0, 0, "next")).toBe(-1);
  });
});

describe("WorkTable", () => {
  const html = (density?: "comoda" | "compacta") =>
    renderToStaticMarkup(
      createElement(WorkTable, {
        caption: "Personas de la vista",
        ...(density ? { density } : {}),
        selection: { form: "lote", name: "ids", allLabel: "Seleccionar todas" },
        columns: [
          { key: "nombre", label: "Persona", sort: { href: "/x?orden=nombre", direction: "asc" } },
          { key: "comite", label: "Comité", sort: { href: "/x?orden=comite", direction: null } },
          { key: "puntos", label: "Puntos", numeric: true },
        ],
        rows: [
          {
            id: "a",
            cells: { nombre: "Ana", comite: "GEMIS", puntos: 12 },
            selectLabel: "Seleccionar a Ana",
          },
          { id: "b", cells: { nombre: "Bea", comite: "Pixel", puntos: 30 }, current: true },
        ],
      }),
    );

  it("es una tabla con nombre, cabecera fija y orden anunciado", () => {
    const markup = html();
    expect(markup).toContain('<caption class="sr-only">Personas de la vista</caption>');
    expect(markup).toContain('aria-label="Personas de la vista"');
    expect(markup).toContain("sticky top-0");
    expect(markup).toContain('aria-sort="ascending"');
    expect(markup).toContain('aria-sort="none"');
    expect(markup).toContain('href="/x?orden=nombre"');
  });

  it("las filas miden 40 px en la densidad cómoda y 32 px en la compacta", () => {
    expect(html()).toContain("[&amp;&gt;td]:h-10");
    expect(html("compacta")).toContain("[&amp;&gt;td]:h-8");
  });

  it("cada fila lleva su casilla del formulario del lote, y la abierta se marca", () => {
    const markup = html();
    expect(markup).toContain('form="lote"');
    expect(markup).toContain('name="ids"');
    expect(markup).toContain('value="a"');
    expect(markup).toContain('aria-label="Seleccionar a Ana"');
    expect(markup).toContain('aria-label="Seleccionar todas"');
    expect(markup.match(/aria-current="true"/g)).toHaveLength(1);
    expect(markup).toContain("tabular-nums");
  });

  it("sin filas muestra lo que se le pase para el vacío", () => {
    const markup = renderToStaticMarkup(
      createElement(WorkTable, {
        caption: "Vacía",
        columns: [{ key: "a", label: "A" }],
        rows: [],
        empty: createElement("p", null, "Nadie todavía"),
      }),
    );
    expect(markup).toContain("Nadie todavía");
    expect(markup).not.toContain("<table");
  });
});

describe("BatchBar", () => {
  it("es el formulario del lote y no se ve hasta que hay algo marcado", () => {
    const markup = renderToStaticMarkup(
      createElement(() =>
        BatchBar({
          form: "lote",
          name: "ids",
          countLabel: { one: "{n} seleccionada", other: "{n} seleccionadas" },
          children: createElement("button", { type: "submit" }, "Emitir"),
        }),
      ),
    );
    expect(markup).toContain('<form id="lote"');
    expect(markup).toContain("hidden");
    expect(markup).toContain("<output");
    expect(markup).toContain("superficie-flotante");
  });

  it("los botones sobre la barra que flota tienen su propio aspecto", () => {
    expect(buttonClass({ onFloating: true })).toContain("bg-oe-paper");
    expect(buttonClass({ onFloating: true, variant: "secundaria" })).toContain(
      "rgb(246_246_246/0.14)",
    );
    expect(buttonClass({ onFloating: true })).not.toContain("bg-accion ");
  });
});

describe("SplitView", () => {
  it("pone la lista y el detalle lado a lado desde 1280 px, y sin detalle la lista ocupa todo", () => {
    const withDetail = renderToStaticMarkup(
      createElement(SplitView, { list: "lista", detail: createElement("aside", null, "detalle") }),
    );
    expect(withDetail).toContain("xl:grid");
    expect(withDetail).toContain("detalle");
    const alone = renderToStaticMarkup(createElement(SplitView, { list: "lista" }));
    expect(alone).not.toContain("xl:grid");
  });
});

describe("campos de formulario", () => {
  it("Field conecta la etiqueta, la ayuda y el error con el control", () => {
    const markup = renderToStaticMarkup(
      Field({
        id: "codigo",
        label: "Código",
        help: "Está en la pantalla.",
        error: "Tiene 6 dígitos.",
        children: createElement(TextInput, { id: "codigo", name: "codigo" }),
      }),
    );
    expect(markup).toContain('<label for="codigo"');
    expect(markup).toContain('aria-describedby="codigo-ayuda codigo-error"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('id="codigo-error"');
    expect(markup).toContain("<svg");
    expect(markup).toContain("campo");
  });

  it("sin error, el control no queda inválido", () => {
    const markup = renderToStaticMarkup(
      Field({ id: "n", label: "Nombre", children: createElement(TextInput, { id: "n" }) }),
    );
    expect(markup).not.toContain("aria-invalid");
    expect(markup).not.toContain("aria-describedby");
  });

  it("el área de texto y la selección usan la misma utilidad de campo", () => {
    expect(renderToStaticMarkup(createElement(TextArea, { id: "t" }))).toContain("campo");
    const select = renderToStaticMarkup(
      createElement(Select, { id: "s" }, createElement("option", { value: "" }, "Elige")),
    );
    expect(select).toContain("appearance-none");
    expect(select).toContain("<svg");
  });

  it("el interruptor es una casilla nativa con role switch", () => {
    const markup = renderToStaticMarkup(
      createElement(Switch, { id: "push", name: "push", label: "Avisos", help: "Recordatorios" }),
    );
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain('role="switch"');
    expect(markup).toContain('aria-describedby="push-ayuda"');
  });

  it("la casilla y las opciones se tocan en toda la fila", () => {
    expect(renderToStaticMarkup(createElement(Checkbox, { id: "c", label: "Correo" }))).toContain(
      "min-h-(--alto-control)",
    );
    const radios = renderToStaticMarkup(
      createElement(RadioGroup, {
        legend: "Cuándo",
        name: "cuando",
        defaultValue: "dia",
        options: [
          { value: "vispera", label: "La víspera" },
          { value: "dia", label: "El mismo día" },
        ],
      }),
    );
    expect(radios).toContain("<fieldset");
    expect(radios).toContain("<legend");
    expect(radios.match(/checked=""/g)).toHaveLength(1);
  });

  it("el resumen de errores es una alerta que lleva a cada campo, y sin errores no se ve", () => {
    const markup = renderToStaticMarkup(
      createElement(ErrorSummary, {
        title: "Revisa dos datos",
        errors: [{ field: "codigo", message: "El código tiene 6 dígitos" }],
      }),
    );
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('href="#codigo"');
    expect(renderToStaticMarkup(createElement(ErrorSummary, { title: "x", errors: [] }))).toBe("");
  });
});
