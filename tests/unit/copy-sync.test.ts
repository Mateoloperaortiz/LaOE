import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { splitCopyList } from "@/shared/copy/format";
import { textosCliente } from "@/shared/copy/textos.client.generated";
import { textos } from "@/shared/copy/textos.generated";
import {
  CLIENT_COPY_TARGET,
  COPY_SOURCE,
  COPY_TARGET,
  clientCopyOf,
  collectClientCodes,
  copySyncReport,
  generatedTexts,
  parseCopy,
  REORDER_CONFIRMATION,
  renderCopy,
  reorderedLists,
  syncCopy,
} from "../../scripts/lib/copy";

describe("catálogo de textos", () => {
  it("el generado coincide con docs/14: si falla, corré npm run copy:sync", () => {
    expect(textos).toEqual(parseCopy(readFileSync(COPY_SOURCE, "utf8")));
  });

  it("el subconjunto de cliente trae los códigos que usa el navegador: si falla, corré npm run copy:sync", () => {
    const entries = parseCopy(readFileSync(COPY_SOURCE, "utf8"));
    expect(textosCliente).toEqual(clientCopyOf(entries, collectClientCodes()));
  });

  it("el subconjunto de cliente es una fracción del catálogo y no lleva metadatos editoriales", () => {
    const codes = Object.keys(textosCliente);
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.length).toBeLessThan(Object.keys(textos).length / 4);
    expect(Object.values(textosCliente).every((text) => typeof text === "string")).toBe(true);
  });

  it("un código de cliente que no está en el inventario detiene la generación", () => {
    expect(() => clientCopyOf({}, ["T-001"])).toThrow("T-001");
  });

  it("rechaza filas incompletas y códigos repetidos", () => {
    expect(() => parseCopy("| T-001 | Donde | Texto |")).toThrow("Fila de copy incompleta");
    const row = "| T-001 | Donde | Texto | COM | Propuesta |";
    expect(() => parseCopy(`${row}\n${row}`)).toThrow("Código repetido");
  });

  it("conserva una barra escapada dentro de una celda", () => {
    const entries = parseCopy("| T-001 | Donde | Uno \\| dos | COM | Propuesta |");
    expect(entries["T-001"]?.text).toBe("Uno | dos");
  });
});

// DT-365: `tLabels` y la tabla de pares comparan posiciones y leen la misma lista que el código, así
// que ninguna prueba ve una lista del inventario con las mismas piezas en otro orden: cada valor
// pasaría a mostrar la etiqueta de otro. Un reorden solo llega al código por `copy:sync`, y ahí se
// detiene hasta que alguien lo confirme (ADR-128 regla 9).
describe("copy:sync compara el orden de cada lista con el del generado anterior", () => {
  const sanctions = textos["T-2229"].text;
  const inverted = splitCopyList(sanctions).reverse().join(" · ");

  it("devuelve el código de la lista que trae las mismas piezas en otro orden", () => {
    expect(inverted).not.toBe(sanctions);
    expect(
      reorderedLists(
        { "T-2229": sanctions, "T-001": "Uno" },
        { "T-2229": inverted, "T-001": "Uno" },
      ),
    ).toEqual(["T-2229"]);
  });

  it("no devuelve nada si cambió una redacción, si hay una pieza de más o de menos o si el texto es nuevo", () => {
    const before = { "T-001": "Uno · Dos · Tres" };
    expect(reorderedLists(before, { "T-001": "Uno · Dos · Tercero" })).toEqual([]);
    expect(reorderedLists(before, { "T-001": "Uno · Dos · Tres · Cuatro" })).toEqual([]);
    expect(reorderedLists(before, { "T-001": "Uno · Dos" })).toEqual([]);
    expect(reorderedLists(before, { "T-002": "Tres · Dos · Uno" })).toEqual([]);
    expect(reorderedLists(before, before)).toEqual([]);
  });

  it("no ve el reorden que además cambia una redacción: es lo que sigue sin red", () => {
    expect(
      reorderedLists({ "T-001": "Uno · Dos · Tres" }, { "T-001": "Tercero · Dos · Uno" }),
    ).toEqual([]);
  });

  it("no cuenta el texto que solo cambia sus espacios, y sí la pieza repetida que cambia de lugar", () => {
    expect(reorderedLists({ "T-001": "Uno · Dos" }, { "T-001": "Uno  ·  Dos" })).toEqual([]);
    expect(reorderedLists({ "T-001": "Uno · Uno · Dos" }, { "T-001": "Uno · Uno · Dos " })).toEqual(
      [],
    );
    expect(reorderedLists({ "T-001": "Uno · Uno · Dos" }, { "T-001": "Uno · Dos · Uno" })).toEqual([
      "T-001",
    ]);
  });

  it("lee del generado de verdad los textos que trae el catálogo, sin importarlo", () => {
    const read = generatedTexts(readFileSync(COPY_TARGET, "utf8"));
    expect(read).toEqual(
      Object.fromEntries(Object.entries(textos).map(([code, entry]) => [code, entry.text])),
    );
  });

  it("lanza si el archivo que le pasan no trae el catálogo", () => {
    expect(() => generatedTexts("export const otra = {};\n")).toThrow(COPY_TARGET);
  });
});

describe("copy:sync no escribe una lista reordenada sin que se la confirmen", () => {
  let root = "";
  const row = (code: string, text: string) => `| ${code} | Donde | ${text} | COM | Propuesta |`;
  const generated = () => readFileSync(join(root, COPY_TARGET), "utf8");
  const clientGenerated = () => readFileSync(join(root, CLIENT_COPY_TARGET), "utf8");

  /** Una casa mínima: el inventario, un archivo de cliente que usa T-002 y, si se pide, el generado anterior. */
  function house(inventory: string[], previous: string[] | null) {
    root = mkdtempSync(join(tmpdir(), "copy-sync-"));
    mkdirSync(join(root, "docs"));
    mkdirSync(join(root, "src/shared/copy"), { recursive: true });
    writeFileSync(join(root, COPY_SOURCE), `${inventory.join("\n")}\n`);
    writeFileSync(
      join(root, "src/Boton.tsx"),
      'import { tList } from "@/shared/copy/client";\nexport const estados = tList("T-002");\n',
    );
    if (previous) {
      writeFileSync(join(root, COPY_TARGET), renderCopy(parseCopy(previous.join("\n"))));
    }
  }

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const BEFORE = [row("T-001", "Título"), row("T-002", "Borrador · Abierto · Cerrado")];

  it("con una lista invertida en el inventario no escribe ninguno de los dos generados y nombra el código", () => {
    house([row("T-001", "Título"), row("T-002", "Cerrado · Abierto · Borrador")], BEFORE);
    const untouched = generated();

    const result = syncCopy({ root });

    expect(result.reordered).toEqual(["T-002"]);
    expect(generated()).toBe(untouched);
    expect(existsSync(join(root, CLIENT_COPY_TARGET))).toBe(false);
  });

  it("con una redacción cambiada escribe los dos generados", () => {
    house([row("T-001", "Título nuevo"), row("T-002", "Borrador · Abierta · Cerrado")], BEFORE);

    const result = syncCopy({ root });

    expect(result).toEqual({ reordered: [], unreadReason: null, totalCount: 2, clientCount: 1 });
    expect(generated()).toContain("Borrador · Abierta · Cerrado");
    expect(generated()).toContain("Título nuevo");
    expect(clientGenerated()).toContain("Borrador · Abierta · Cerrado");
  });

  it("con una pieza de más o un texto nuevo escribe los dos generados", () => {
    house(
      [
        ...BEFORE.slice(0, 1),
        row("T-002", "Borrador · Abierto · Cerrado · Anulado"),
        row("T-003", "Cerrado · Abierto"),
      ],
      BEFORE,
    );

    expect(syncCopy({ root }).reordered).toEqual([]);
    expect(generated()).toContain("Cerrado · Anulado");
    expect(clientGenerated()).toContain("Cerrado · Anulado");
  });

  it("confirmado el código, escribe los dos generados con el orden nuevo", () => {
    house([row("T-001", "Título"), row("T-002", "Cerrado · Abierto · Borrador")], BEFORE);

    const result = syncCopy({ root, confirmed: " T-002 " });

    expect(result.reordered).toEqual([]);
    expect(generated()).toContain("Cerrado · Abierto · Borrador");
    expect(clientGenerated()).toContain("Cerrado · Abierto · Borrador");
  });

  it("confirmar una lista no deja pasar otra: la nombra y no escribe nada", () => {
    const before = [...BEFORE, row("T-003", "Sí · No")];
    house(
      [
        row("T-001", "Título"),
        row("T-002", "Cerrado · Abierto · Borrador"),
        row("T-003", "No · Sí"),
      ],
      before,
    );
    const untouched = generated();

    expect(syncCopy({ root, confirmed: "T-002" }).reordered).toEqual(["T-003"]);
    expect(generated()).toBe(untouched);
    expect(syncCopy({ root, confirmed: "T-002,T-003" }).reordered).toEqual([]);
    expect(generated()).toContain("No · Sí");
  });

  it("si no hay generado anterior, escribe los dos y avisa que no comparó", () => {
    house([row("T-001", "Título"), row("T-002", "Cerrado · Abierto · Borrador")], null);

    const result = syncCopy({ root });

    expect(result.reordered).toEqual([]);
    expect(result.unreadReason).toEqual(expect.any(String));
    expect(generated()).toContain("Cerrado · Abierto · Borrador");
    expect(clientGenerated()).toContain("Cerrado · Abierto · Borrador");
  });

  it("si el generado anterior no se puede leer, escribe los dos y lo avisa", () => {
    house([row("T-001", "Título"), row("T-002", "Cerrado · Abierto · Borrador")], null);
    writeFileSync(join(root, COPY_TARGET), "export const textos = ;\n");

    const result = syncCopy({ root });

    expect(result.unreadReason).toContain(COPY_TARGET);
    expect(generated()).toContain("Cerrado · Abierto · Borrador");
  });

  it("el aviso de una lista reordenada termina con error, nombra el código y dice cómo confirmarlo", () => {
    const report = copySyncReport({
      reordered: ["T-002", "T-003"],
      unreadReason: null,
      totalCount: 3,
      clientCount: 1,
    });

    expect(report.code).toBe(1);
    expect(report.out).toBe("");
    expect(report.err).toContain("T-002, T-003");
    expect(report.err).toContain(`${REORDER_CONFIRMATION}=T-002,T-003 npm run copy:sync`);
  });

  it("sin listas reordenadas termina bien y cuenta lo que escribió", () => {
    const report = copySyncReport({
      reordered: [],
      unreadReason: null,
      totalCount: 3,
      clientCount: 1,
    });

    expect(report).toEqual({
      code: 0,
      out: `3 textos en ${COPY_TARGET}; 1 en ${CLIENT_COPY_TARGET}\n`,
      err: "",
    });
  });

  it("si no pudo leer el generado anterior termina bien y avisa que no comparó el orden", () => {
    const report = copySyncReport({
      reordered: [],
      unreadReason: "no existe",
      totalCount: 3,
      clientCount: 1,
    });

    expect(report.code).toBe(0);
    expect(report.err).toContain("no existe");
    expect(report.out).toContain("3 textos");
  });
});
