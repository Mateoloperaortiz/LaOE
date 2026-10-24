import { beforeEach, describe, expect, it, vi } from "vitest";
import { replaceArticlesAs } from "@/modules/content/domain/documents";
import { type ArticlesJson, parseArticlesJson } from "@/modules/content/domain/documents-pure";
import { setFormFieldsAs } from "@/modules/forms/domain/forms";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";

const state = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock("@/db/client", () => ({
  getDb: () => ({
    transaction: async (command: (tx: unknown) => Promise<unknown>) =>
      command({
        select: () => ({
          from: () => ({
            where: () => ({
              for: async () => {
                state.read();
                return [{ kind: "REGLAMENTO", status: "DRAFT", sha256: "a".repeat(64) }];
              },
            }),
          }),
        }),
        insert: state.write,
        update: state.write,
        delete: state.write,
      }),
  }),
}));

beforeEach(() => vi.clearAllMocks());

describe("errores controlados de colecciones que ya tenían máximo", () => {
  it("el formulario convierte el exceso de opciones en DomainError antes de consultar", async () => {
    await expect(
      setFormFieldsAs({ personId: "admin-sintetico", ip: null }, "form-sintetico", [
        { key: "opcion", label: "Opción", type: "SELECT", options: Array(51).fill(null) },
      ]),
    ).rejects.toBeInstanceOf(DomainError);
    expect(state.read).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
  });

  it("la unión de normativa convierte el exceso de columnas en DomainError sin escribir", async () => {
    const json: ArticlesJson = {
      format: "oe-normativa/2",
      kind: "REGLAMENTO",
      source: "reglamento-sintetico.pdf",
      pages: 1,
      sha256: "a".repeat(64),
      articles: [
        {
          key: "art-1",
          chapterKey: "cap-1",
          chapterTitle: "Capítulo de prueba",
          unitType: "ARTICLE",
          number: "1",
          title: "Artículo de prueba",
          pages: [1],
          blocks: [{ type: "table", headers: Array(21).fill("Columna"), rows: [["Valor"]] }],
          body: "Texto de prueba",
        },
      ],
    };
    const parsed = parseArticlesJson(JSON.stringify({ ...json, units: json.articles }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) throw new Error("Se aceptó la tabla sobredimensionada");
    await expect(
      replaceArticlesAs({ personId: "admin-sintetico", ip: null }, "documento-sintetico", json),
    ).rejects.toMatchObject({
      name: "DomainError",
      message: t("T-499", { detalle: parsed.detail }),
    });
    expect(state.read).toHaveBeenCalledOnce();
    expect(state.write).not.toHaveBeenCalled();
  });
});
