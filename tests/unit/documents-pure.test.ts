import { describe, expect, it } from "vitest";
import {
  blocksText,
  chaptersOf,
  documentKey,
  isPdfHeader,
  parseArticlesJson,
} from "@/modules/content/domain/documents-pure";

const article = (key: string, chapterKey: string, extra: Record<string, unknown> = {}) => ({
  key,
  chapterKey,
  chapterTitle: `Capítulo ${chapterKey}`,
  number: key.replace("art-", ""),
  body: `Cuerpo de ${key}`,
  ...extra,
});

const complete = () => ({
  format: "oe-normativa/2",
  kind: "REGLAMENTO",
  source: "reglamento-sintetico.pdf",
  sha256: "a".repeat(64),
  pages: 4,
  units: [
    {
      key: "art-1",
      chapterKey: "cap-1",
      chapterTitle: "CAPÍTULO PRIMERO",
      unitType: "ARTICLE",
      number: "1",
      title: "De las actividades",
      pages: [2, 3],
      blocks: [
        { type: "text", text: "Primera regla.\n\n1. Conservá el numeral." },
        { type: "table", headers: ["Actividad", "Duración"], rows: [["Taller", "Dos horas"]] },
        { type: "image", assetId: "imagen-sintetica", alt: "Relación entre dos grupos" },
      ],
    },
    {
      key: "anexo-1",
      chapterKey: "anexo-1",
      chapterTitle: "",
      unitType: "SECTION",
      number: null,
      title: "ANEXO 1: EXCUSAS",
      pages: [4],
      blocks: [{ type: "text", text: "b. Falta leve\n\nb. Falta grave" }],
    },
  ],
});

describe("normativa completa v2", () => {
  it("conserva secciones, tablas e imágenes y deriva su texto buscable", () => {
    const result = parseArticlesJson(JSON.stringify(complete()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.sha256).toBe("a".repeat(64));
    const [first, annex] = result.data.articles;
    expect(first?.body).toContain("Actividad: Taller · Duración: Dos horas");
    expect(first?.body).toContain("Relación entre dos grupos");
    expect(annex).toMatchObject({
      unitType: "SECTION",
      number: null,
      body: "b. Falta leve\n\nb. Falta grave",
    });
    expect(blocksText(first?.blocks ?? [])).toBe(first?.body);
  });

  it.each([
    [
      "hash",
      (input: ReturnType<typeof complete>) => {
        input.sha256 = "incorrecto";
      },
    ],
    [
      "página fuera del original",
      (input: ReturnType<typeof complete>) => {
        unitAt(input, 0).pages = [5];
      },
    ],
    [
      "página repetida",
      (input: ReturnType<typeof complete>) => {
        unitAt(input, 0).pages = [2, 2];
      },
    ],
    [
      "páginas desordenadas",
      (input: ReturnType<typeof complete>) => {
        unitAt(input, 0).pages = [3, 2];
      },
    ],
    [
      "referencia confundida con artículo",
      (input: ReturnType<typeof complete>) => {
        unitAt(input, 0).key = "art-1-2";
      },
    ],
    [
      "sección sin título",
      (input: ReturnType<typeof complete>) => {
        unitAt(input, 1).title = "";
      },
    ],
    [
      "artículo sin número",
      (input: ReturnType<typeof complete>) => {
        unitAt(input, 0).number = null;
      },
    ],
    [
      "tabla incompleta",
      (input: ReturnType<typeof complete>) => {
        const block = blockAt(input, 1);
        if ("rows" in block) block.rows = [["Taller"]];
      },
    ],
    [
      "imagen sin alternativa",
      (input: ReturnType<typeof complete>) => {
        const block = blockAt(input, 2);
        if ("alt" in block) block.alt = "";
      },
    ],
  ])("rechaza %s antes de cargar", (_label, change) => {
    const input = complete();
    change(input);
    expect(parseArticlesJson(JSON.stringify(input)).ok).toBe(false);
  });

  it("rechaza capítulos contradictorios o que reaparecen fuera de orden", () => {
    const input = complete();
    input.units.push({ ...unitAt(input, 0), key: "art-2", number: "2", pages: [4] });
    expect(parseArticlesJson(JSON.stringify(input)).ok).toBe(false);
    input.units.splice(1, 1);
    unitAt(input, 1).chapterTitle = "OTRO TÍTULO";
    expect(parseArticlesJson(JSON.stringify(input)).ok).toBe(false);
  });
});

describe("JSON del extractor de normativa", () => {
  it("acepta el formato oe-normativa/1 y completa los valores por defecto", () => {
    const parsed = parseArticlesJson(
      JSON.stringify({
        format: "oe-normativa/1",
        kind: "ESTATUTOS",
        articles: [article("art-1", "cap-1", { pages: [2, 3] }), article("art-2", "cap-1")],
      }),
    );
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.data.articles[0]).toMatchObject({ title: "", pages: [2, 3] });
      expect(parsed.data.articles[1]?.pages).toEqual([]);
    }
  });

  it("señala el primer problema con su ruta", () => {
    expect(parseArticlesJson("{no json")).toEqual({ ok: false, detail: "no es JSON" });
    const wrongFormat = parseArticlesJson(JSON.stringify({ format: "otro", articles: [] }));
    expect(wrongFormat.ok).toBe(false);
    if (!wrongFormat.ok) {
      expect(wrongFormat.detail.startsWith("format")).toBe(true);
    }
    const emptyBody = parseArticlesJson(
      JSON.stringify({
        format: "oe-normativa/1",
        articles: [article("art-1", "cap-1", { body: "" })],
      }),
    );
    expect(emptyBody.ok).toBe(false);
    if (!emptyBody.ok) {
      expect(emptyBody.detail.startsWith("articles.0.body")).toBe(true);
    }
    const duplicated = parseArticlesJson(
      JSON.stringify({
        format: "oe-normativa/1",
        articles: [article("art-1", "cap-1"), article("art-1", "cap-2")],
      }),
    );
    expect(duplicated.ok).toBe(false);
    if (!duplicated.ok) {
      expect(duplicated.detail).toContain("clave repetida");
    }
  });

  it("agrupa por capítulo en orden de aparición y reconoce la cabecera de un PDF", () => {
    const groups = chaptersOf([
      article("art-1", "cap-1"),
      article("art-2", "cap-1"),
      article("art-3", "cap-2"),
    ]);
    expect(groups.map((group) => [group.key, group.articles.length])).toEqual([
      ["cap-1", 2],
      ["cap-2", 1],
    ]);
    expect(isPdfHeader(new TextEncoder().encode("%PDF-1.4\n"))).toBe(true);
    expect(isPdfHeader(new TextEncoder().encode("<html>"))).toBe(false);
    expect(documentKey("abc")).toBe("documents/abc.pdf");
  });
});

function unitAt(input: ReturnType<typeof complete>, index: number) {
  const unit = input.units[index];
  if (!unit) throw new Error("Falta la unidad sintética");
  return unit;
}
function blockAt(input: ReturnType<typeof complete>, index: number) {
  const block = unitAt(input, 0).blocks[index];
  if (!block) throw new Error("Falta el bloque sintético");
  return block;
}
