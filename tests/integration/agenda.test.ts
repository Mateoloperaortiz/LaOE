import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  ForbiddenError,
  getOrCreateCalendarToken,
  resolveCalendarToken,
  rotateCalendarTokenAs,
} from "@/modules/identity";
import { calendarToken } from "@/modules/identity/schema";
import { listAgendaForPerson } from "@/modules/participation";
import { membership } from "@/modules/people/schema";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "./factories";

// Calendario personal (ADR-038 regla 12): el token se crea al primer uso, resuelve a la persona,
// regenerarlo invalida el anterior; la agenda trae lo general, las asambleas y sus comités.

const db = () => getDb();

describe("token del calendario", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("se crea una vez, resuelve a la persona y regenerar invalida el anterior", async () => {
    const ana = await seedMember("ana.ics@eafit.edu.co");
    const token = await getOrCreateCalendarToken(ana);
    expect(token.length).toBeGreaterThanOrEqual(24);
    expect(await getOrCreateCalendarToken(ana)).toBe(token);
    expect(await resolveCalendarToken(token)).toBe(ana);
    expect(await resolveCalendarToken("no-existe-este-token-000000")).toBeNull();
    expect(await resolveCalendarToken("corto")).toBeNull();
    const rotated = await rotateCalendarTokenAs({ personId: ana, ip: null });
    expect(rotated).not.toBe(token);
    expect(await resolveCalendarToken(token)).toBeNull();
    expect(await resolveCalendarToken(rotated)).toBe(ana);
  });

  it("la licencia impide consultar, crear o regenerar el enlace sin alterar el existente", async () => {
    const withToken = await seedMember("licencia.ics.existente@eafit.edu.co");
    await getOrCreateCalendarToken(withToken);
    const withoutToken = await seedMember("licencia.ics.nuevo@eafit.edu.co");
    await db().update(membership).set({ status: "ON_LEAVE" });
    const before = await db().select().from(calendarToken);

    for (const personId of [withToken, withoutToken]) {
      await expect(getOrCreateCalendarToken(personId)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(rotateCalendarTokenAs({ personId, ip: null })).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    }

    expect(await db().select().from(calendarToken)).toEqual(before);
  });
});

describe("agenda de una persona", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("trae lo general, las asambleas y las ocasiones de sus comités; las de solo nuevos según sea nueva", async () => {
    const termId = await seedTerm();
    const pixel = await seedCommittee("e2e-pixel", "Pixel");
    const a3 = await seedCommittee("e2e-a3", "A3");
    const ana = await seedMember("ana.agenda@eafit.edu.co");
    await seedCommitteeMembership(ana, pixel, termId);
    const general = await seedOccasion(termId, { title: "Integración general" });
    const dePixel = await seedOccasion(termId, { title: "Reunión de Pixel", committeeId: pixel });
    await seedOccasion(termId, { title: "Reunión de A3", committeeId: a3 });
    const soloNuevos = await seedOccasion(termId, { title: "Solo nuevos", newMembersOnly: true });
    await seedOccasion(termId, { title: "Borrador", status: "DRAFT" });
    await seedOccasion(termId, { title: "Cancelada", status: "CANCELLED" });
    const asamblea = await seedOccasion(termId, {
      title: "Asamblea",
      kind: "ASSEMBLY",
      assemblyKind: "ORDINARY",
      category: "OTHER",
      points: 0,
    });
    const nueva = await listAgendaForPerson({ personId: ana, termId, isNew: true });
    expect(nueva.map((row) => row.id).sort()).toEqual(
      [general.id, dePixel.id, soloNuevos.id, asamblea.id].sort(),
    );
    const veterana = await listAgendaForPerson({ personId: ana, termId, isNew: false });
    expect(veterana.map((row) => row.id).sort()).toEqual(
      [general.id, dePixel.id, asamblea.id].sort(),
    );
  });
});
