import { count, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import {
  createEdition,
  editionInputSchema,
  findNextPublicEdition,
  findNextPublicEditions,
  getEdition,
  getPublishedEdition,
  listEditions,
  listPublicEditionsForIcs,
  listPublishedEditionsOf,
  updateEdition,
} from "@/modules/events/domain/editions";
import {
  createEvent,
  getPublishedEvent,
  listEvents,
  listPublishedEvents,
  updateEvent,
} from "@/modules/events/domain/events";
import { editionCommittee } from "@/modules/events/schema";
import { createCommittee } from "@/modules/people/domain/committees";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { truncateAll } from "./db";

const day = 24 * 60 * 60_000;

function localInput(date: Date): string {
  // datetime-local en Bogotá (UTC-5) del instante dado.
  const local = new Date(date.getTime() - 5 * 60 * 60_000);
  return local.toISOString().slice(0, 16);
}

describe("eventos y ediciones", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("crea eventos y ediciones con organizadores, rechaza duplicados y fechas invertidas", async () => {
    const dias = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createEvent(ctx, {
        slug: "dias-eafit",
        name: "Días EAFIT",
        summary: "",
        description: "",
        audience: "PUBLIC",
        publicationStatus: "PUBLISHED",
        sortOrder: 1,
      }),
    );
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createEvent(ctx, {
          slug: "dias-eafit",
          name: "Otro",
          summary: "",
          description: "",
          audience: "PUBLIC",
          publicationStatus: "DRAFT",
          sortOrder: 0,
        }),
      ),
    ).rejects.toBeInstanceOf(DomainError);

    const a3 = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createCommittee(ctx, {
        slug: "a3",
        name: "A3",
        status: "ACTIVE",
        publicationStatus: "PUBLISHED",
      }),
    );
    const pixel = await runCommand(SYSTEM_ACTOR, (ctx) =>
      createCommittee(ctx, {
        slug: "pixel",
        name: "Pixel",
        status: "ACTIVE",
        publicationStatus: "DRAFT",
      }),
    );

    const startsAt = new Date(Date.now() + 10 * day);
    const parsed = editionInputSchema.safeParse({
      eventId: dias.id,
      slug: "2026-2",
      name: "2026-2",
      startsAt: localInput(startsAt),
      endsAt: localInput(new Date(startsAt.getTime() + 3 * 60 * 60_000)),
      location: "Bloque 38",
      publicationStatus: "PUBLISHED",
      committeeIds: [a3.id, pixel.id],
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // El datetime-local de Bogotá se guarda como instante UTC (+5 h).
    expect(Math.abs(parsed.data.startsAt.getTime() - startsAt.getTime())).toBeLessThan(60_000);

    const invertida = editionInputSchema.safeParse({
      ...parsed.data,
      startsAt: localInput(startsAt),
      endsAt: localInput(new Date(startsAt.getTime() - 60 * 60_000)),
    });
    expect(invertida.success).toBe(false);

    const created = await runCommand(SYSTEM_ACTOR, (ctx) => createEdition(ctx, parsed.data));
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) => createEdition(ctx, parsed.data)),
    ).rejects.toBeInstanceOf(DomainError);

    const edition = await getEdition(created.id);
    expect(edition).toMatchObject({
      eventName: "Días EAFIT",
      slug: "2026-2",
      location: "Bloque 38",
    });
    expect(edition?.committeeIds.sort()).toEqual([a3.id, pixel.id].sort());

    // Editar reemplaza organizadores y conserva slug y evento.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updateEdition(ctx, created.id, {
        ...parsed.data,
        slug: "otro",
        name: "2026-2 editada",
        committeeIds: [pixel.id],
      }),
    );
    const edited = await getEdition(created.id);
    expect(edited).toMatchObject({
      slug: "2026-2",
      name: "2026-2 editada",
      committeeIds: [pixel.id],
    });
    const [organizers] = await getDb().select({ n: count() }).from(editionCommittee);
    expect(organizers?.n).toBe(1);

    const listed = await listEditions({ q: "", eventId: dias.id, page: 1, pageSize: 10 });
    expect(listed.total).toBe(1);
    const events = await listEvents({ q: "", page: 1, pageSize: 10 });
    expect(events.rows[0]).toMatchObject({ slug: "dias-eafit", editionCount: 1 });

    const [audits] = await getDb()
      .select({ n: count() })
      .from(auditLog)
      .where(eq(auditLog.entityType, "event_edition"));
    expect(audits?.n).toBe(2);
  });

  it("expone al portal solo lo publicado y encuentra el próximo encuentro", async () => {
    const crearEvento = (
      slug: string,
      name: string,
      publicationStatus: "DRAFT" | "PUBLISHED",
      sortOrder: number,
    ) =>
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createEvent(ctx, {
          slug,
          name,
          summary: "",
          description: "",
          audience: "PUBLIC",
          publicationStatus,
          sortOrder,
        }),
      );
    const inventiva = await crearEvento("inventiva", "Inventiva", "PUBLISHED", 2);
    const dias = await crearEvento("dias-eafit", "Días EAFIT", "PUBLISHED", 1);
    const borrador = await crearEvento("borrador", "Borrador", "DRAFT", 3);

    const crearEdicion = (
      eventId: string,
      slug: string,
      daysFromNow: number,
      publicationStatus: "DRAFT" | "PUBLISHED" = "PUBLISHED",
    ) =>
      runCommand(SYSTEM_ACTOR, (ctx) =>
        createEdition(ctx, {
          eventId,
          slug,
          name: slug,
          description: "",
          startsAt: new Date(Date.now() + daysFromNow * day),
          location: "",
          publicationStatus,
          committeeIds: [],
        }),
      );
    await crearEdicion(dias.id, "pasada", -30);
    await crearEdicion(dias.id, "cercana", 5);
    await crearEdicion(dias.id, "lejana", 40);
    await crearEdicion(dias.id, "oculta", 2, "DRAFT");
    await crearEdicion(inventiva.id, "inventiva-2026", 20);
    await crearEdicion(borrador.id, "invisible", 1);

    expect((await listPublishedEvents()).map((item) => item.slug)).toEqual([
      "dias-eafit",
      "inventiva",
    ]);
    expect(await getPublishedEvent("borrador")).toBeNull();
    expect((await listPublishedEditionsOf(dias.id)).map((item) => item.slug)).toEqual([
      "lejana",
      "cercana",
      "pasada",
    ]);
    expect((await getPublishedEdition("dias-eafit", "cercana"))?.event.name).toBe("Días EAFIT");
    expect(await getPublishedEdition("dias-eafit", "oculta")).toBeNull();
    expect(await getPublishedEdition("borrador", "invisible")).toBeNull();

    const proximo = await findNextPublicEdition();
    expect(proximo?.slug).toBe("cercana");
    const porEvento = await findNextPublicEditions();
    expect(porEvento.get(dias.id)?.slug).toBe("cercana");
    expect(porEvento.get(inventiva.id)?.slug).toBe("inventiva-2026");
    expect(porEvento.has(borrador.id)).toBe(false);

    const ics = await listPublicEditionsForIcs();
    expect(ics.map((item) => item.slug)).toEqual(["pasada", "cercana", "inventiva-2026", "lejana"]);

    await runCommand(SYSTEM_ACTOR, (ctx) =>
      updateEvent(ctx, dias.id, {
        slug: "dias-eafit",
        name: "Días EAFIT",
        summary: "",
        description: "",
        audience: "PUBLIC",
        publicationStatus: "DRAFT",
        sortOrder: 1,
      }),
    );
    // Un evento en borrador esconde todas sus ediciones.
    expect((await findNextPublicEdition())?.slug).toBe("inventiva-2026");
  });
});
