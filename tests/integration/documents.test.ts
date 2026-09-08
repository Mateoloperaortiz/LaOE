import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  confirmDocument,
  documentContentChecksum,
  getDocumentWithArticles,
  getPublishedDocumentWithArticles,
  listDocuments,
  listPublishedDocuments,
  prepareDocumentUpload,
  publishDocument,
  replaceArticles,
  resolveDocumentRedirect,
  searchArticles,
  unpublishDocument,
} from "@/modules/content/domain/documents";
import { type DocumentKind, parseArticlesJson } from "@/modules/content/domain/documents-pure";
import { documentArticle, mediaAsset } from "@/modules/content/schema";
import { deleteObject, headObject } from "@/shared/adapters/storage";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { sampleArticlesJson, sampleNormativaPdf } from "../helpers/pdf";
import { truncateAll } from "./db";
import { seedMember } from "./factories";

// Contra Garage en local, como hace el navegador: presign → POST → confirm.

const keys: string[] = [];

async function uploadPdf(bytes: Buffer, filename = "estatutos-prueba.pdf"): Promise<string> {
  const prepared = await prepareDocumentUpload({ filename, byteSize: bytes.byteLength });
  keys.push(prepared.key);
  const form = new FormData();
  for (const [name, value] of Object.entries(prepared.fields)) {
    form.append(name, value);
  }
  form.append("file", new Blob([Uint8Array.from(bytes)], { type: "application/pdf" }), filename);
  const response = await fetch(prepared.url, { method: "POST", body: form });
  expect([200, 201, 204]).toContain(response.status);
  return prepared.key;
}

function articles() {
  const parsed = parseArticlesJson(sampleArticlesJson());
  if (!parsed.ok) {
    throw new Error(parsed.detail);
  }
  return parsed.data;
}

async function createDocument(kind: DocumentKind = "ESTATUTOS") {
  const pdf = sampleNormativaPdf();
  const key = await uploadPdf(pdf);
  return runCommand(SYSTEM_ACTOR, (ctx) =>
    confirmDocument(ctx, {
      key,
      filename: "estatutos-prueba.pdf",
      title: "Estatutos sintéticos",
      kind,
      version: "2",
      audience: "MEMBERS",
    }),
  );
}

function completeArticles(text = "La asamblea convoca una reunión.") {
  const input = {
    format: "oe-normativa/2",
    kind: "ESTATUTOS",
    source: "estatutos-prueba.pdf",
    pages: 3,
    sha256: createHash("sha256").update(sampleNormativaPdf()).digest("hex"),
    units: [
      {
        key: "art-1",
        unitType: "ARTICLE",
        number: "1",
        title: "Reuniones",
        chapterKey: "cap-1",
        chapterTitle: "CAPÍTULO PRIMERO",
        pages: [2],
        blocks: [{ type: "text", text }],
      },
      {
        key: "anexo-1",
        unitType: "SECTION",
        number: null,
        title: "ANEXO 1: EXCUSAS",
        chapterKey: "anexo-1",
        chapterTitle: "",
        pages: [3],
        blocks: [
          { type: "text", text: "Las excusas requieren evidencia." },
          { type: "table", headers: ["Actividad", "Duración"], rows: [["Taller", "Dos horas"]] },
        ],
      },
    ],
  };
  const parsed = parseArticlesJson(JSON.stringify(input));
  if (!parsed.ok) throw new Error(parsed.detail);
  return parsed.data;
}

describe("normativa", () => {
  beforeEach(truncateAll);
  afterAll(async () => {
    await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
    await closeDb();
  });

  it("rechaza lo que no es un PDF antes y después de subirlo", async () => {
    await expect(prepareDocumentUpload({ filename: "a.docx", byteSize: 5000 })).rejects.toThrow(
      DomainError,
    );
    await expect(
      prepareDocumentUpload({ filename: "a.pdf", byteSize: 30 * 1024 * 1024 }),
    ).rejects.toThrow(DomainError);
    const fake = Buffer.from(`<html>${"x".repeat(2000)}</html>`);
    const key = await uploadPdf(fake, "falso.pdf");
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        confirmDocument(ctx, {
          key,
          filename: "falso.pdf",
          title: "Falso",
          kind: "OTRO",
          version: "1",
          audience: "MEMBERS",
        }),
      ),
    ).rejects.toThrow(DomainError);
    expect(await headObject(key)).toBeNull();
  });

  it("confirma el PDF con sha256, carga artículos de forma atómica, busca en español y redirige solo publicado", async () => {
    const adminId = await seedMember("admin@eafit.edu.co");
    const pdf = sampleNormativaPdf();
    const key = await uploadPdf(pdf);
    const { id } = await runCommand({ personId: adminId }, (ctx) =>
      confirmDocument(ctx, {
        key,
        filename: "estatutos-prueba.pdf",
        title: "Estatutos de prueba",
        kind: "ESTATUTOS",
        version: "2026-05-08",
        audience: "MEMBERS",
      }),
    );
    const listed = await listDocuments({ q: "", page: 1, pageSize: 10 });
    expect(listed.rows[0]).toMatchObject({
      id,
      status: "DRAFT",
      byteSize: pdf.byteLength,
      articleCount: 0,
    });
    expect(listed.rows[0]?.sha256).toMatch(/^[a-f0-9]{64}$/);

    const loaded = await runCommand({ personId: adminId }, (ctx) =>
      replaceArticles(ctx, id, articles()),
    );
    expect(loaded).toBe(3);
    // Atómico: si algo falla después de reemplazar, los tres artículos anteriores siguen ahí.
    await expect(
      runCommand({ personId: adminId }, async (ctx) => {
        await replaceArticles(ctx, id, {
          ...articles(),
          articles: articles().articles.slice(0, 1),
        });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    const rows = await getDb()
      .select()
      .from(documentArticle)
      .where(eq(documentArticle.documentId, id));
    expect(rows).toHaveLength(3);

    // Sin publicar: ni lector ni PDF.
    expect(await listPublishedDocuments()).toEqual([]);
    expect(await getPublishedDocumentWithArticles(id)).toBeNull();
    expect(await searchArticles("asamblea")).toEqual([]);
    expect(await resolveDocumentRedirect(id, { authenticated: true, isAdmin: false })).toEqual({
      status: 404,
    });
    expect((await resolveDocumentRedirect(id, { authenticated: true, isAdmin: true })).status).toBe(
      302,
    );

    await runCommand({ personId: adminId }, (ctx) => publishDocument(ctx, id));
    const published = await listPublishedDocuments();
    expect(published.map((row) => [row.id, row.articleCount])).toEqual([[id, 3]]);
    const detail = await getPublishedDocumentWithArticles(id);
    expect(detail?.articles.map((row) => row.articleKey)).toEqual(["art-1", "art-2", "art-3"]);

    const hits = await searchArticles("asamblea");
    expect(hits.map((hit) => hit.articleKey)).toEqual(["art-3"]);
    expect(hits[0]?.headline).toContain("[[Asamblea]]");
    expect(await searchArticles("reglamento")).toHaveLength(1);
    expect(await searchArticles("blockchain")).toEqual([]);

    expect(await resolveDocumentRedirect(id, { authenticated: false, isAdmin: false })).toEqual({
      status: 403,
    });
    const redirect = await resolveDocumentRedirect(id, { authenticated: true, isAdmin: false });
    expect(redirect.status).toBe(302);
    if (redirect.status === 302) {
      expect(redirect.url).toContain(key);
    }

    await runCommand({ personId: adminId }, (ctx) => unpublishDocument(ctx, id));
    expect(await listPublishedDocuments()).toEqual([]);
  });

  it("no publica vacíos y conserva el borrador si el contenido pertenece a otro PDF o tipo", async () => {
    const { id } = await createDocument();
    await expect(runCommand(SYSTEM_ACTOR, (ctx) => publishDocument(ctx, id))).rejects.toThrow(
      DomainError,
    );
    const data = completeArticles();
    await runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, data));
    for (const wrong of [
      { ...data, sha256: "0".repeat(64) },
      { ...data, kind: "REGLAMENTO" as const },
    ]) {
      await expect(
        runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, wrong)),
      ).rejects.toThrow(DomainError);
    }
    const detail = await getDocumentWithArticles(id);
    expect(detail?.document).toMatchObject({
      status: "DRAFT",
      articleCount: 1,
      unitCount: 2,
      contentSha256: documentContentChecksum(data),
    });
    expect(detail?.articles.map((unit) => unit.articleKey)).toEqual(["art-1", "anexo-1"]);
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => publishDocument(ctx, id, "0".repeat(64))),
    ).rejects.toThrow(DomainError);
    expect((await getDocumentWithArticles(id))?.document.status).toBe("DRAFT");
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      publishDocument(ctx, id, documentContentChecksum(data)),
    );
    expect((await searchArticles("excusas"))[0]).toMatchObject({
      unitType: "SECTION",
      number: null,
      articleKey: "anexo-1",
    });
    expect((await searchArticles("taller"))[0]?.headline).toContain("[[Taller]]");
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, completeArticles("Otro texto"))),
    ).rejects.toThrow(DomainError);
    expect((await getDocumentWithArticles(id))?.document.contentSha256).toBe(
      documentContentChecksum(data),
    );
  });

  it("exige imágenes privadas listas y vuelve a comprobarlas al publicar", async () => {
    const { id } = await createDocument();
    const [asset] = await getDb()
      .insert(mediaAsset)
      .values({
        objectKey: "uploads/imagen-sintetica.png",
        originalFilename: "imagen-sintetica.png",
        contentType: "image/png",
        byteSize: 2048,
        visibility: "PUBLIC",
        status: "READY",
      })
      .returning();
    if (!asset) throw new Error("Falta la imagen sintética");
    const data = completeArticles();
    data.articles[0]?.blocks.push({
      type: "image",
      assetId: asset.id,
      alt: "Dos grupos conectados",
    });
    await expect(runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, data))).rejects.toThrow(
      DomainError,
    );
    await getDb()
      .update(mediaAsset)
      .set({ visibility: "PRIVATE", status: "PENDING" })
      .where(eq(mediaAsset.id, asset.id));
    await expect(runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, data))).rejects.toThrow(
      DomainError,
    );
    await getDb().update(mediaAsset).set({ status: "READY" }).where(eq(mediaAsset.id, asset.id));
    await runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, data));
    await getDb().update(mediaAsset).set({ status: "FAILED" }).where(eq(mediaAsset.id, asset.id));
    await expect(runCommand(SYSTEM_ACTOR, (ctx) => publishDocument(ctx, id))).rejects.toThrow(
      DomainError,
    );
  });

  it.each([
    "ACTA",
    "OTRO",
  ] as const)("publica %s sin contenido cuando coincide con la revisión vacía", async (kind) => {
    const { id } = await createDocument(kind);
    await runCommand(SYSTEM_ACTOR, (ctx) => publishDocument(ctx, id, null));
    const published = await getPublishedDocumentWithArticles(id);
    expect(published).not.toBeNull();
    expect((await getDocumentWithArticles(id))?.document).toMatchObject({
      status: "PUBLISHED",
      contentSha256: null,
    });
    expect(published?.articles).toEqual([]);
  });

  it.each([
    "ACTA",
    "OTRO",
  ] as const)("rechaza publicar %s desde una revisión vacía si otro administrador ya cargó contenido", async (kind) => {
    const { id } = await createDocument(kind);
    // El primer administrador abre el PDF sin JSON. Otro carga contenido antes de que publique.
    const reviewed = await getDocumentWithArticles(id);
    if (!reviewed) throw new Error("Falta el documento sintético");
    expect(reviewed.document.contentSha256).toBeNull();
    const replacement = { ...completeArticles(), kind };
    await runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, replacement));

    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => publishDocument(ctx, id, reviewed.document.contentSha256)),
    ).rejects.toThrow(t("T-1304"));
    const draft = await getDocumentWithArticles(id);
    expect(draft?.document).toMatchObject({
      status: "DRAFT",
      contentSha256: documentContentChecksum(replacement),
    });
    expect(draft?.articles).toHaveLength(2);
    // Revisar el nuevo contenido y publicar con su huella sí funciona.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      publishDocument(ctx, id, documentContentChecksum(replacement)),
    );
    expect((await getPublishedDocumentWithArticles(id))?.articles).toHaveLength(2);
  });

  it("serializa reemplazos y publicación sin mezclar unidades ni dejar contenido parcial", async () => {
    const { id } = await createDocument();
    const first = completeArticles("Primera revisión");
    const second = completeArticles("Segunda revisión");
    await Promise.all([
      runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, first)),
      runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, second)),
    ]);
    const detail = await getDocumentWithArticles(id);
    expect(detail?.articles).toHaveLength(2);
    const stored = detail?.articles[0]?.body === "Primera revisión" ? first : second;
    expect(detail?.document.contentSha256).toBe(documentContentChecksum(stored));
    const replacement = completeArticles("Revisión final");
    const outcomes = await Promise.allSettled([
      runCommand(SYSTEM_ACTOR, (ctx) => publishDocument(ctx, id)),
      runCommand(SYSTEM_ACTOR, (ctx) => replaceArticles(ctx, id, replacement)),
    ]);
    expect(outcomes[0]?.status).toBe("fulfilled");
    const published = await getDocumentWithArticles(id);
    expect(published?.document.status).toBe("PUBLISHED");
    expect(published?.articles).toHaveLength(2);
    const expected = outcomes[1]?.status === "fulfilled" ? replacement : stored;
    expect(published?.document.contentSha256).toBe(documentContentChecksum(expected));
  });
});
