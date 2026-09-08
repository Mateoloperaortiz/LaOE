import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SettingsSections } from "@/app/app/ajustes/SettingsSections";

describe("secciones disponibles en Ajustes", () => {
  it("renderiza los datos propios cuando se omite la sección de calendario", () => {
    const props = {
      label: "Ajustes",
      initialSection: "mis-datos",
      sections: [
        { id: "mis-datos", label: "Mis datos" },
        { id: "privacidad", label: "Privacidad" },
      ],
      children: [
        createElement("section", { id: "mis-datos", key: "mis-datos" }, "Datos registrados"),
        null,
        createElement("section", { id: "privacidad", key: "privacidad" }, "Privacidad propia"),
      ],
    };
    const html = renderToStaticMarkup(createElement(SettingsSections, props));
    expect(html).toContain("Datos registrados");
    expect(html).toContain('id="privacidad"');
    expect(html).not.toContain("calendario");
  });
});
