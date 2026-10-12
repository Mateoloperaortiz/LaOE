import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentUploader } from "@/modules/content/components/DocumentUploader";
import { DOCUMENT_KINDS } from "@/modules/content/domain/documents-pure";
import { tList } from "@/shared/copy";

// El selector de tipo de la subida de normativa (DT-368, ADR-126 regla 5). El componente es de
// cliente y recibe las etiquetas por props: acá queda qué pieza de T-394 muestra cada tipo y que un
// código sin etiqueta se muestra tal cual, que es el respaldo de hoy (decisión abierta 75).

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const STRANGERS = ["NO_EXISTE", "constructor", "toString", "__proto__"];
const CODES = [...DOCUMENT_KINDS, ...STRANGERS];

/** Lo que `src/app/admin/documentos/page.tsx` le pasa al componente como etiquetas de los tipos. */
function kindsProp() {
  return [...tList("T-394")];
}

/** Cada opción del selector de tipo: su código y lo que muestra. */
function kindOptions(): [string, string][] {
  const html = renderToStaticMarkup(
    createElement(DocumentUploader, {
      kindCodes: CODES,
      minBytes: 1,
      maxBytes: 2,
      labels: {
        fields: [...tList("T-494")],
        kinds: kindsProp(),
        audiences: ["", ""],
        help: "",
        uploading: "",
        done: "",
        errorType: "",
        errorSize: "",
        errorUpload: "",
        errorTitle: "",
        submit: "",
        errorFile: "",
        chooseFile: "",
        noFile: "",
        replaceFile: "",
        removeFile: "",
      },
    }),
  );
  return [...html.matchAll(/<option value="([^"]+)"[^>]*>([^<]*)<\/option>/g)]
    .map(([, value = "", text = ""]): [string, string] => [value, text])
    .filter(([value]) => CODES.includes(value));
}

describe("el selector de tipo de la subida de normativa", () => {
  it("cada tipo muestra la pieza de T-394 de su posición", () => {
    const labels = tList("T-394");
    expect(kindOptions().slice(0, DOCUMENT_KINDS.length)).toEqual([
      ["ESTATUTOS", labels[0]],
      ["REGLAMENTO", labels[1]],
      ["ACTA", labels[2]],
      ["OTRO", labels[3]],
    ]);
  });

  it("un código sin etiqueta se muestra tal cual, también si se llama como una propiedad de Object (decisión abierta 75)", () => {
    expect(kindOptions().slice(DOCUMENT_KINDS.length)).toEqual(
      STRANGERS.map((code) => [code, code]),
    );
  });
});
