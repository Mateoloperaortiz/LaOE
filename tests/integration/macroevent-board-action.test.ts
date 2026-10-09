import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addDirectorAction } from "@/app/admin/eventos/[id]/ediciones/[edicionId]/mesa/actions";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { appointment } from "@/modules/people/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedTerm, seedVeteran } from "./factories";

// La mesa de una edición queda en el término que contiene su fecha (ADR-060 regla 9; ADR-118 regla
// 9). Acá va la action de `/admin/eventos/[id]/ediciones/[edicionId]/mesa` entera, contra la base.

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));
vi.mock("@/app/_lib/actor", () => ({
  requireAdminContext: async () => ({ personId: null, ip: null }),
}));

// Una edición del primer semestre de 2031: ningún término la contiene hasta que alguien lo cree.
const STARTS_AT = new Date("2031-03-10T14:00:00Z");

async function seedEdition(): Promise<{ eventId: string; editionId: string }> {
  const evento = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEvent(ctx, {
      slug: "inventiva",
      name: "Inventiva",
      summary: "",
      description: "",
      audience: "PUBLIC",
      publicationStatus: "PUBLISHED",
      sortOrder: 1,
    }),
  );
  const edicion = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId: evento.id,
      slug: "2031",
      name: "2031",
      description: "",
      startsAt: STARTS_AT,
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  return { eventId: evento.id, editionId: edicion.id };
}

/** A dónde redirige la action; si no redirige, lo que devolvió o el error con que falló. */
async function redirectOf(action: Promise<unknown>): Promise<unknown> {
  try {
    return await action;
  } catch (error) {
    return error instanceof Error ? error.message : error;
  }
}

function boardForm(ids: { eventId: string; editionId: string }, personId: string): FormData {
  const data = new FormData();
  data.set("eventId", ids.eventId);
  data.set("editionId", ids.editionId);
  data.set("personId", personId);
  data.set("roleCode", "GENERAL");
  return data;
}

describe("mesa directiva desde la edición", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("no nombra la mesa de una edición cuyo semestre todavía no existe ni la deja en el vigente", async () => {
    await seedTerm();
    const ids = await seedEdition();
    const personId = await seedVeteran("general.mesa@example.com");

    const destino = await redirectOf(addDirectorAction(boardForm(ids, personId)));

    expect(destino).toBe(
      `redirect:/admin/eventos/${ids.eventId}/ediciones/${ids.editionId}/mesa?error=${encodeURIComponent(t("T-3244"))}`,
    );
    expect(await getDb().select().from(appointment)).toEqual([]);
  });

  it("con el semestre de la edición creado, el cargo queda en ese semestre y no en el vigente", async () => {
    await seedTerm();
    const deLaEdicion = await seedTerm("2031-1");
    const ids = await seedEdition();
    const personId = await seedVeteran("general.mesa@example.com");

    const destino = await redirectOf(addDirectorAction(boardForm(ids, personId)));

    expect(destino).toBe(
      `redirect:/admin/eventos/${ids.eventId}/ediciones/${ids.editionId}/mesa?guardado=1`,
    );
    expect(await getDb().select().from(appointment)).toEqual([
      expect.objectContaining({ personId, editionId: ids.editionId, termId: deLaEdicion }),
    ]);
  });
});
