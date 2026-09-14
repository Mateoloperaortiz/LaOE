import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { isCheckViolation } from "@/db/errors";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import {
  addMacroeventDirector,
  appointmentLabel,
  listAppointments,
  listMacroeventBoard,
  listMacroeventDirectorsForTerm,
  listMacroeventRoles,
  removeAppointment,
} from "@/modules/people/domain/appointments";
import { appointment } from "@/modules/people/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { tList } from "@/shared/copy";
import { truncateAll } from "./db";
import { seedMember, seedPerson, seedTerm } from "./factories";

// Mesa directiva de un macroevento (ADR-060 regla 9): un titular y una codirección por cargo, una
// persona por edición, solo miembros activos; se etiqueta con la edición.

async function seedEdition(): Promise<string> {
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
      slug: "2026",
      name: "2026",
      description: "",
      startsAt: new Date("2026-10-20T14:00:00Z"),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  return edicion.id;
}

describe("mesa directiva de macroevento", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("nombra titular y codirección por cargo y etiqueta el cargo con la edición", async () => {
    const termId = await seedTerm();
    const editionId = await seedEdition();
    const general = await seedMember("general@example.com", {
      firstName: "Ana",
      lastName: "General",
    });
    const co = await seedMember("co@example.com", { firstName: "Bea", lastName: "Codirección" });

    await runCommand(SYSTEM_ACTOR, (ctx) =>
      addMacroeventDirector(ctx, { editionId, termId, personId: general, roleCode: "GENERAL" }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      addMacroeventDirector(ctx, {
        editionId,
        termId,
        personId: co,
        roleCode: "GENERAL",
        coDirector: true,
      }),
    );

    const board = await listMacroeventBoard(editionId);
    expect(board.map((row) => [row.fullName, row.roleCode, row.coDirector])).toEqual([
      ["Ana General", "GENERAL", false],
      ["Bea Codirección", "GENERAL", true],
    ]);

    const [cargo] = await listAppointments(co);
    expect(cargo).toMatchObject({
      kind: "MACROEVENT_DIRECTOR",
      editionId,
      editionLabel: "Inventiva · 2026",
      roleCode: "GENERAL",
      roleLabel: "Dirección General",
      coDirector: true,
    });
    expect(appointmentLabel(cargo as NonNullable<typeof cargo>)).toBe(
      "Dirección General (codirección) · Inventiva · 2026",
    );

    const vivos = await listMacroeventDirectorsForTerm(termId, [general, co, "nadie"]);
    expect(vivos).toHaveLength(2);

    const roles = await listMacroeventRoles();
    expect(roles.map((role) => role.code)).toEqual([
      "GENERAL",
      "LOGISTICA",
      "FINANZAS",
      "MERCADEO",
      "PUBLICIDAD",
      "GESTION_HUMANA",
      "THE_GAMES",
      "CARNIVAL",
      "SEGURIDAD",
      "AGENDA_ACADEMICA",
    ]);
  });

  it("rechaza un segundo titular, una persona repetida en la edición y a quien no es activo", async () => {
    const termId = await seedTerm();
    const editionId = await seedEdition();
    const [titularTomado, , soloActivos, yaEnLaMesa] = tList("T-2271");
    const general = await seedMember("general@example.com");
    const otra = await seedMember("otra@example.com");
    const externa = await seedPerson("externa@example.com");

    await runCommand(SYSTEM_ACTOR, (ctx) =>
      addMacroeventDirector(ctx, { editionId, termId, personId: general, roleCode: "GENERAL" }),
    );
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        addMacroeventDirector(ctx, { editionId, termId, personId: otra, roleCode: "GENERAL" }),
      ),
    ).rejects.toThrow(new DomainError(titularTomado ?? ""));
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        addMacroeventDirector(ctx, { editionId, termId, personId: general, roleCode: "LOGISTICA" }),
      ),
    ).rejects.toThrow(new DomainError(yaEnLaMesa ?? ""));
    await expect(
      runCommand(SYSTEM_ACTOR, (ctx) =>
        addMacroeventDirector(ctx, { editionId, termId, personId: externa, roleCode: "LOGISTICA" }),
      ),
    ).rejects.toThrow(new DomainError(soloActivos ?? ""));
    expect(await listMacroeventBoard(editionId)).toHaveLength(1);
  });

  it("quita el cargo y la base exige edición y cargo para una dirección de macroevento", async () => {
    const termId = await seedTerm();
    const editionId = await seedEdition();
    const general = await seedMember("general@example.com");
    const { id } = await runCommand(SYSTEM_ACTOR, (ctx) =>
      addMacroeventDirector(ctx, { editionId, termId, personId: general, roleCode: "GENERAL" }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) => removeAppointment(ctx, id));
    expect(await listMacroeventBoard(editionId)).toEqual([]);

    await expect(
      getDb()
        .insert(appointment)
        .values({ personId: general, termId, kind: "MACROEVENT_DIRECTOR" }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "appointment_macroevent_consistent"));
    await expect(
      getDb()
        .insert(appointment)
        .values({ personId: general, termId, kind: "PRESIDENT", editionId, roleCode: "GENERAL" }),
    ).rejects.toSatisfy((error) => isCheckViolation(error, "appointment_macroevent_consistent"));
  });
});
