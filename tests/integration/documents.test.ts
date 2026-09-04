import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  confirmDocument,
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
import { parseArticlesJson } from "@/modules/content/domain/documents-pure";
import { documentArticle } from "@/modules/content/schema";
import { deleteObject, headObject } from "@/shared/adapters/storage";
import { DomainError } from "@/shared/admin-kit/DomainError";
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
});
