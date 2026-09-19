import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  createAnnouncement,
  getPublicAnnouncement,
  listAnnouncements,
  listPublicAnnouncements,
  publishAnnouncement,
  unpublishAnnouncement,
} from "@/modules/content/domain/announcements";
import { createPage, findPublicPage, listPages, updatePage } from "@/modules/content/domain/pages";
import { announcement } from "@/modules/content/schema";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/lib/errors";
import { truncateAll } from "./db";

describe("páginas", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea con auditoría, rechaza el identificador repetido y no cambia el slug al editar", async () => {
    const created = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createPage(ctx, {
        slug: "la-oe",
        title: "La OE",
        body: "# Hola",
        status: "DRAFT",
        audience: "PUBLIC",
      }),
    );
    expect(created.id).toBeTruthy();
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createPage(ctx, {
          slug: "la-oe",
          title: "Otra",
          body: "",
          status: "DRAFT",
          audience: "PUBLIC",
        }),
      ),
    ).rejects.toBeInstanceOf(DomainError);

    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updatePage(ctx, created.id, {
        slug: "cambiada",
        title: "La OE",
        body: "## Historia",
        status: "PUBLISHED",
        audience: "PUBLIC",
      }),
    );
    expect(await findPublicPage("cambiada")).toBeNull();
    expect(await findPublicPage("la-oe")).toMatchObject({
      slug: "la-oe",
      status: "PUBLISHED",
      body: "## Historia",
    });
    const [audits] = await getDb().select({ n: count() }).from(auditLog);
    expect(audits?.n).toBe(2);
  });

  it("solo expone al portal las páginas de audiencia pública, publicadas o en borrador", async () => {
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      createPage(ctx, {
        slug: "privacidad",
        title: "Tratamiento de datos personales",
        body: "",
        status: "DRAFT",
        audience: "PUBLIC",
      }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      createPage(ctx, {
        slug: "interna",
        title: "Solo miembros",
        body: "Secreto",
        status: "PUBLISHED",
        audience: "MEMBERS",
      }),
    );
    // En borrador el portal muestra el título y "en preparación": la lectura devuelve la fila.
    expect(await findPublicPage("privacidad")).toMatchObject({ status: "DRAFT", body: "" });
    // Lo de audiencia de miembros nunca sale al público, aunque esté publicado.
    expect(await findPublicPage("interna")).toBeNull();
    expect(await findPublicPage("no-existe")).toBeNull();

    const publicadas = await listPages({ q: "", status: "PUBLISHED", page: 1, pageSize: 10 });
    expect(publicadas.total).toBe(1);
    const buscadas = await listPages({ q: "datos", page: 1, pageSize: 10 });
    expect(buscadas.rows.map((row) => row.slug)).toEqual(["privacidad"]);
  });
});

describe("cartelera", () => {
  beforeEach(truncateAll);

  it("publica y despublica con auditoría, y al público salen los publicados con los fijados primero", async () => {
    const crear = (title: string, audience: "PUBLIC" | "MEMBERS" = "PUBLIC", pinned = false) =>
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createAnnouncement(ctx, { title, body: `## ${title}\n\nCuerpo.`, audience, pinned }),
      );
    const viejo = await crear("Viejo");
    const fijado = await crear("Fijado", "PUBLIC", true);
    const nuevo = await crear("Nuevo");
    const interno = await crear("Interno", "MEMBERS");
    const borrador = await crear("Borrador");

    const hace2h = new Date(Date.now() - 2 * 60 * 60_000);
    const hace1h = new Date(Date.now() - 60 * 60_000);
    await runCommand(SYSTEM_ACTOR, (ctx) => publishAnnouncement(ctx, viejo.id, hace2h));
    await runCommand(SYSTEM_ACTOR, (ctx) => publishAnnouncement(ctx, fijado.id, hace2h));
    await runCommand(SYSTEM_ACTOR, (ctx) => publishAnnouncement(ctx, nuevo.id, hace1h));
    await runCommand(SYSTEM_ACTOR, (ctx) => publishAnnouncement(ctx, interno.id, hace1h));
    // Publicar de nuevo no cambia la fecha ni audita otra vez.
    await runCommand(SYSTEM_ACTOR, (ctx) => publishAnnouncement(ctx, nuevo.id));
    const [row] = await getDb().select().from(announcement).where(eq(announcement.id, nuevo.id));
    expect(row?.publishedAt?.getTime()).toBe(hace1h.getTime());

    const publicos = await listPublicAnnouncements();
    expect(publicos.map((item) => item.title)).toEqual(["Fijado", "Nuevo", "Viejo"]);
    expect(await getPublicAnnouncement(interno.id)).toBeNull();
    expect(await getPublicAnnouncement(borrador.id)).toBeNull();
    expect((await getPublicAnnouncement(fijado.id))?.pinned).toBe(true);

    // Un anuncio programado hacia el futuro todavía no sale.
    const futuro = await crear("Futuro");
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      publishAnnouncement(ctx, futuro.id, new Date(Date.now() + 60 * 60_000)),
    );
    expect((await listPublicAnnouncements()).map((item) => item.title)).not.toContain("Futuro");

    await runCommand(SYSTEM_ACTOR, (ctx) => unpublishAnnouncement(ctx, nuevo.id));
    expect((await listPublicAnnouncements()).map((item) => item.title)).toEqual([
      "Fijado",
      "Viejo",
    ]);

    const listado = await listAnnouncements({ q: "", publication: "DRAFT", page: 1, pageSize: 10 });
    expect(listado.rows.map((item) => item.title).sort()).toEqual(["Borrador", "Nuevo"]);

    const [audits] = await getDb()
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.entityType, "announcement"));
    // 6 creados + 5 publicaciones efectivas + 1 despublicación
    expect(audits?.n).toBe(12);
  });
});
