import { describe, expect, it } from "vitest";
import {
  matchNormativaDocument,
  normativaContentChecksum,
  normativaImportIntent,
  normativaManifestSchema,
} from "../../scripts/lib/normativa-import";

const identity = {
  kind: "ESTATUTOS",
  version: "2026-05-08",
  sha256: "a".repeat(64),
  title: "Estatutos de prueba",
  audience: "MEMBERS",
};
const existing = { ...identity, id: "documentodeprueba", status: "DRAFT" as const };
const imageUnit = (assetId: string) => ({
  key: "art-1",
  unitType: "ARTICLE" as const,
  chapterKey: "cap-1",
  chapterTitle: "Naturaleza",
  number: "1",
  title: "Organización",
  pages: [1],
  body: "Organigrama de prueba",
  blocks: [{ type: "image" as const, assetId, alt: "Organigrama de prueba" }],
});

describe("importación operativa de normativa", () => {
  it("solo admite un manifiesto explícito para miembros y hashes íntegros", () => {
    const document = {
      pdf: "estatutos.pdf",
      json: "estatutos.json",
      title: "Estatutos de prueba",
      version: "2026-05-08",
      audience: "MEMBERS",
    };
    expect(normativaManifestSchema.parse({ documents: [document] }).documents[0]?.assets).toEqual(
      {},
    );
    expect(
      normativaManifestSchema.safeParse({ documents: [{ ...document, audience: "PUBLIC" }] })
        .success,
    ).toBe(false);
    expect(
      normativaManifestSchema.safeParse({
        documents: [
          {
            ...document,
            assets: { organigrama: { path: "organigrama.png", sha256: "no-es-un-hash" } },
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      normativaManifestSchema.safeParse({ documents: [{ ...document, actorId: "no-permitido" }] })
        .success,
    ).toBe(false);
  });

  it("identifica el mismo PDF y rechaza versiones ambiguas o metadatos distintos", () => {
    expect(matchNormativaDocument(identity, [existing])).toBe(existing);
    expect(matchNormativaDocument(identity, [{ ...existing, version: "2025" }])).toBeUndefined();
    for (const changed of [
      { ...existing, sha256: "b".repeat(64) },
      { ...existing, title: "Otro título" },
      { ...existing, audience: "PUBLIC" },
    ]) {
      expect(() => matchNormativaDocument(identity, [changed])).toThrow(
        "otro PDF, título o audiencia",
      );
    }
    expect(() =>
      matchNormativaDocument(identity, [existing, { ...existing, id: "otrodocumento" }]),
    ).toThrow("duplicados");
  });

  it("publicar requiere la carga previa idéntica y cargar no modifica lo publicado", () => {
    expect(normativaImportIntent(undefined, false)).toBe("create");
    expect(normativaImportIntent({ status: "DRAFT", identical: false }, false)).toBe("replace");
    expect(normativaImportIntent({ status: "DRAFT", identical: true }, false)).toBe("unchanged");
    expect(normativaImportIntent({ status: "DRAFT", identical: true }, true)).toBe("publish");
    expect(normativaImportIntent({ status: "PUBLISHED", identical: true }, true)).toBe("unchanged");
    expect(() => normativaImportIntent(undefined, true)).toThrow("carga previa idéntica");
    expect(() => normativaImportIntent({ status: "DRAFT", identical: false }, true)).toThrow(
      "carga previa idéntica",
    );
    expect(() => normativaImportIntent({ status: "PUBLISHED", identical: false }, false)).toThrow(
      "publicado tiene otro contenido",
    );
  });

  it("compara imágenes por bytes conservando orden, alt, páginas y texto", () => {
    const local = imageUnit("organigrama");
    const remote = { ...imageUnit("assetremotodeprueba"), key: undefined, articleKey: "art-1" };
    const localHashes = new Map([["organigrama", "a".repeat(64)]]);
    const remoteHashes = new Map([["assetremotodeprueba", "a".repeat(64)]]);
    // La clave persistida se llama articleKey y su ID de imagen cambia en cada entorno.
    const { key: _key, ...stored } = remote;
    const checksum = normativaContentChecksum([local], localHashes);
    expect(normativaContentChecksum([stored], remoteHashes)).toBe(checksum);
    expect(normativaContentChecksum([local], new Map([["organigrama", "b".repeat(64)]]))).not.toBe(
      checksum,
    );
    expect(normativaContentChecksum([{ ...local, pages: [2] }], localHashes)).not.toBe(checksum);
    expect(
      normativaContentChecksum(
        [
          {
            ...local,
            blocks: [{ type: "image", assetId: "organigrama", alt: "Otro organigrama" }],
          },
        ],
        localHashes,
      ),
    ).not.toBe(checksum);
    expect(() => normativaContentChecksum([local], new Map())).toThrow("verificar una imagen");
  });

  it("la huella detecta cambios y reordenamientos en tablas y secciones", () => {
    const first = {
      ...imageUnit("unused"),
      blocks: [
        {
          type: "table" as const,
          headers: ["Alimento", "Horas"],
          rows: [
            ["Refrigerio", "3"],
            ["Almuerzo", "6"],
          ],
        },
      ],
    };
    const section = {
      ...imageUnit("unused"),
      key: "anexo-1",
      unitType: "SECTION" as const,
      number: null,
      blocks: [{ type: "text" as const, text: "Texto del anexo" }],
    };
    const checksum = normativaContentChecksum([first, section], new Map());
    expect(normativaContentChecksum([section, first], new Map())).not.toBe(checksum);
    expect(
      normativaContentChecksum(
        [
          {
            ...first,
            blocks: [
              {
                type: "table",
                headers: ["Alimento", "Horas"],
                rows: [
                  ["Refrigerio", "4"],
                  ["Almuerzo", "6"],
                ],
              },
            ],
          },
          section,
        ],
        new Map(),
      ),
    ).not.toBe(checksum);
  });
});
