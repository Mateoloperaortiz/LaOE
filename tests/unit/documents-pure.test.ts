import { describe, expect, it } from "vitest";
import {
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
