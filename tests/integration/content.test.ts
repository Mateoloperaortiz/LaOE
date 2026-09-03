import { count } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createPage, findPublicPage, listPages, updatePage } from "@/modules/content/domain/pages";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
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
