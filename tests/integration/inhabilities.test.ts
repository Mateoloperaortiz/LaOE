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
import { leadershipContext } from "@/modules/people/domain/inhabilities";
import { loadPeopleFacts, loadTermFacts } from "@/modules/permanence";
import { auditLog } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { DomainError } from "@/shared/lib/errors";
import {
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedMembership,
  seedMembershipTerm,
  seedPerson,
  seedTerm,
} from "../factories";
import { truncateAll } from "./db";

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
    await seedMembershipTerm(nuevo, termId, false, { reportAsVeteran: true });
    await setCommitteeMembershipsAs(admin, nuevo, termId, [
      { committeeId: a3, roles: [{ roleCode: "LOGISTICA", coDirector: false }] },
    ]);

    const sancionada = await veteran("sancionada@eafit.edu.co");
    await recordSanctionAs(
      admin,
      sancionada,
      {
        termId,
        kind: "OFFICE_BAN",
        cause: "Inhabilidad de prueba",
        occurredOn: todayKey(),
      },
      { by: "ADMIN" },
    );
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

// Caracterización (DT-287): quién es nuevo en un término lo decidían dos copias de la misma regla,
// la guarda de cargos (`leadershipContext`) y la permanencia (`personStanding`). Nuevo es quien
// ingresó en este término o retoma como nuevo, salvo que GH lo reporte como activo (Est. art. 5
// par. 1; ADR-060 reglas 8 y 11). No es el «nuevo» de la agenda, el check-in «solo nuevos» y el
// onboarding, que miran solo el término de ingreso (decisión abierta 56).
describe("quién es nuevo en el término, para la guarda de cargos y para la permanencia", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  const cases = [
    {
      title: "quien ingresó en este término es nuevo",
      entered: "este",
      generalRow: null,
      isNew: true,
    },
    {
      title: "quien ingresó en un término anterior no es nuevo",
      entered: "anterior",
      generalRow: null,
      isNew: false,
    },
    {
      title: "quien retoma como nuevo es nuevo aunque haya ingresado en un término anterior",
      entered: "anterior",
      generalRow: { resumedNew: true, reportAsVeteran: false },
      isNew: true,
    },
    {
      title: "quien ingresó en este término y GH reporta como activo no es nuevo",
      entered: "este",
      generalRow: { resumedNew: false, reportAsVeteran: true },
      isNew: false,
    },
    {
      title: "quien retoma como nuevo y GH reporta como activo no es nuevo",
      entered: "anterior",
      generalRow: { resumedNew: true, reportAsVeteran: true },
      isNew: false,
    },
    {
      title: "una fila del término sin ninguna de las dos marcas no hace nuevo a nadie",
      entered: "anterior",
      generalRow: { resumedNew: false, reportAsVeteran: false },
      isNew: false,
    },
  ] as const;

  it.each(cases)("$title: lo dicen igual la guarda y la permanencia", async (scene) => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const personId =
      scene.entered === "este"
        ? await seedMember("persona@eafit.edu.co")
        : await veteran("persona@eafit.edu.co");
    await seedCommitteeMembership(personId, a3, termId);
    if (scene.generalRow) {
      await seedMembershipTerm(personId, termId, false, scene.generalRow);
    }

    // La permanencia: con qué condición llega la persona al cálculo.
    const facts = await loadTermFacts(termId);
    if (!facts) throw new Error("sin hechos");
    const [person] = await loadPeopleFacts(facts, [personId]);
    expect(person?.isNew).toBe(scene.isNew);

    // La guarda de cargos: lo que lee, y lo que hace el comando con eso. Un nuevo no recibe cargo de
    // mesa sin aval (el tercer motivo de T-2281).
    expect((await leadershipContext(getDb(), personId, termId)).isNew).toBe(scene.isNew);
    const verdict = await setCommitteeMembershipsAs(admin, personId, termId, [
      { committeeId: a3, roles: [{ roleCode: "LOGISTICA", coDirector: false }] },
    ]).then(
      () => "nombrado",
      (error: unknown) => (error instanceof Error ? error.message : String(error)),
    );
    expect(verdict).toBe(scene.isNew ? t("T-2282", { motivos: motivos[2] ?? "" }) : "nombrado");
  });

  it("sin membresía ni fila del término, la guarda no cuenta a la persona como nueva", async () => {
    const termId = await seedTerm();
    const personId = await seedPerson("sin-membresia@eafit.edu.co");
    expect((await leadershipContext(getDb(), personId, termId)).isNew).toBe(false);
  });
});
