import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import {
  addAppointmentAs,
  addMacroeventDirectorAs,
  recordSanctionAs,
  setCommitteeMembershipsAs,
  setMemberRolesAs,
} from "@/modules/people";
import { membershipTerm } from "@/modules/people/schema";
import { auditLog } from "@/modules/system/schema";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { truncateAll } from "./db";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedPerson,
  seedTerm,
} from "./factories";

// Inhabilidades y topes al nombrar cargos (Regl. art. 11 y 27; ADR-060 regla 11): entre comités,
// macroeventos y junta; nuevos sin aval; inhabilidad viva; ADMIN fuerza con motivo y queda auditado.

const admin = { personId: null, ip: null };
const allCapabilities = { isAdmin: true, allCapabilities: true };
const motivos = tList("T-2281");

/** Un activo veterano: su primer término es anterior al actual. */
async function veteran(email: string): Promise<string> {
  const old = await seedTerm("2025-1");
  const personId = await seedPerson(email);
  await seedMembership(personId, old);
  return personId;
}

async function seedEdition(slug: string): Promise<string> {
  const evento = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEvent(ctx, {
      slug,
      name: slug,
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

describe("inhabilidades y topes de cargos", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("no deja ser General de dos comités ni dos cargos sin codirección; ADMIN fuerza con motivo auditado", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const pixel = await seedCommittee("pixel", "PIXEL");
    const gala = await veteran("gala@eafit.edu.co");
    await seedCommitteeMembership(gala, a3, termId, "GENERAL");

    const rows = (second: { roleCode: string; coDirector: boolean }) => [
      { committeeId: a3, roles: [{ roleCode: "GENERAL", coDirector: false }] },
      { committeeId: pixel, roles: [second] },
    ];
    await expect(
      setCommitteeMembershipsAs(
        admin,
        gala,
        termId,
        rows({ roleCode: "GENERAL", coDirector: true }),
      ),
    ).rejects.toThrow(motivos[4] ?? "x");
    await expect(
      setCommitteeMembershipsAs(
        admin,
        gala,
        termId,
        rows({ roleCode: "LOGISTICA", coDirector: false }),
      ),
    ).rejects.toThrow(motivos[7] ?? "x");
    // Con codirección sí; y la dirección del comité pasa por la misma guarda.
    await setCommitteeMembershipsAs(
      admin,
      gala,
      termId,
      rows({ roleCode: "LOGISTICA", coDirector: true }),
    );
    await expect(
      setMemberRolesAs(SYSTEM_ACTOR, { committeeId: pixel, termId }, allCapabilities, {
        personId: gala,
        roles: [{ roleCode: "LOGISTICA", coDirector: false }],
      }),
    ).rejects.toThrow(motivos[7] ?? "x");

    // Forzado con motivo: se nombra y queda la excepción auditada.
    await setCommitteeMembershipsAs(
      admin,
      gala,
      termId,
      rows({ roleCode: "GENERAL", coDirector: true }),
      { reason: "Decisión de la junta del 2026-09-13" },
    );
    const [audit] = await getDb()
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.action, "inhabilities.overridden"), eq(auditLog.entityId, gala)));
    expect(audit?.after).toMatchObject({
      termId,
      codes: ["TWO_GENERAL"],
      reason: "Decisión de la junta del 2026-09-13",
    });
  });

  it("la junta no convive con la mesa, un nuevo no recibe cargo de mesa sin aval y la inhabilidad viva bloquea", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const presi = await veteran("presi@eafit.edu.co");
    await seedCommitteeMembership(presi, a3, termId, "GENERAL");
    await expect(addAppointmentAs(admin, presi, { kind: "PRESIDENT", termId })).rejects.toThrow(
      motivos[1] ?? "x",
    );
    // GH no es junta: se puede.
    await addAppointmentAs(admin, presi, { kind: "GH_DIRECTOR", termId });
    await addAppointmentAs(admin, presi, { kind: "PRESIDENT", termId }, { reason: "Transición" });

    const nuevo = await seedMember("nuevo@eafit.edu.co");
    await expect(
      setCommitteeMembershipsAs(admin, nuevo, termId, [
        { committeeId: a3, roles: [{ roleCode: "LOGISTICA", coDirector: false }] },
      ]),
    ).rejects.toThrow(motivos[2] ?? "x");
    // La mesa de un comité nuevo se reporta como activa: deja de ser nuevo para la guarda.
    await getDb()
      .insert(membershipTerm)
      .values({ personId: nuevo, termId, probation: false, reportAsVeteran: true });
    await setCommitteeMembershipsAs(admin, nuevo, termId, [
      { committeeId: a3, roles: [{ roleCode: "LOGISTICA", coDirector: false }] },
    ]);

    const sancionada = await veteran("sancionada@eafit.edu.co");
    await recordSanctionAs(admin, sancionada, {
      termId,
      kind: "OFFICE_BAN",
      cause: "Inhabilidad de prueba",
      occurredOn: todayKey(),
    });
    await expect(
      addAppointmentAs(admin, sancionada, { kind: "VP_FINANCE", termId }),
    ).rejects.toThrow(motivos[0] ?? "x");
    await expect(
      setCommitteeMembershipsAs(admin, sancionada, termId, [
        { committeeId: a3, roles: [{ roleCode: "FINANCIERO", coDirector: false }] },
      ]),
    ).rejects.toThrow(motivos[0] ?? "x");
    // Como Miembro sí entra.
    await setCommitteeMembershipsAs(admin, sancionada, termId, [{ committeeId: a3 }]);
  });

  it("cuenta los cargos de macroevento: dos cargos exigen codirección y nadie dirige dos macroeventos", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const inventiva = await seedEdition("inventiva");
    const dias = await seedEdition("dias-eafit");
    const gala = await veteran("gala@eafit.edu.co");
    await seedCommitteeMembership(gala, a3, termId, "GENERAL");

    await expect(
      addMacroeventDirectorAs(admin, {
        editionId: inventiva,
        termId,
        personId: gala,
        roleCode: "LOGISTICA",
      }),
    ).rejects.toThrow(motivos[7] ?? "x");
    await addMacroeventDirectorAs(admin, {
      editionId: inventiva,
      termId,
      personId: gala,
      roleCode: "LOGISTICA",
      coDirector: true,
    });
    const error = await addMacroeventDirectorAs(admin, {
      editionId: dias,
      termId,
      personId: gala,
      roleCode: "SEGURIDAD",
      coDirector: true,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).message).toBe(
      t("T-2282", { motivos: [motivos[3], motivos[6]].join("; ") }),
    );
  });
});
