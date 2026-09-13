import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { grantRecognitionAs, listRecognitionsFor } from "@/modules/crm/domain/recognitions";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { addMacroeventDirector } from "@/modules/people/domain/appointments";
import { setMemberRoles } from "@/modules/people/domain/committee-direction";
import { honoraryFacts } from "@/modules/people/domain/honorary";
import { honoraryEligibility } from "@/modules/people/domain/honorary-pure";
import { getPerson360 } from "@/modules/people/domain/person-360";
import { listPreferentialSchedule } from "@/modules/people/domain/preferential-schedule";
import { setProbation } from "@/modules/people/domain/term-outcomes";
import { t } from "@/shared/copy";
import { todayKey } from "@/shared/lib/dates";
import { truncateAll } from "./db";
import {
  seedAppointment,
  seedCommittee,
  seedCommitteeMembership,
  seedTerm,
  seedVeteran,
} from "./factories";

// Menores de la normativa (ADR-060 regla 13): verificación académica, hechos de la elegibilidad a
// honorario, Premios OE y horario preferencial.

const admin = { personId: null, ip: null };

describe("menores de la normativa 2026", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("la verificación académica queda en la condición del término y se retira sin borrar la prueba", async () => {
    const termId = await seedTerm();
    const personId = await seedVeteran("academica@eafit.edu.co");
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setProbation(ctx, personId, termId, {
        probation: true,
        reason: "Cierre",
        academicVerified: true,
      }),
    );
    let row = (await getPerson360(personId))?.probation.find((item) => item.termId === termId);
    expect(row).toMatchObject({ probation: true, academicVerifiedOn: todayKey() });
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setProbation(ctx, personId, termId, {
        probation: true,
        reason: "Cierre",
        academicVerified: false,
      }),
    );
    row = (await getPerson360(personId))?.probation.find((item) => item.termId === termId);
    expect(row).toMatchObject({ probation: true, academicVerifiedOn: null });
  });

  it("reúne los hechos de honorario: cargos de comité y macroevento, semestres, junta", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const personId = await seedVeteran("honoraria@eafit.edu.co");
    await seedCommitteeMembership(personId, a3, termId, "GENERAL");
    await seedAppointment(personId, termId, "PRESIDENT");
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
        slug: "2025",
        name: "2025",
        description: "",
        startsAt: new Date("2025-10-20T14:00:00Z"),
        location: "",
        publicationStatus: "DRAFT",
        committeeIds: [],
      }),
    );
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      addMacroeventDirector(
        ctx,
        { editionId: edicion.id, termId, personId, roleCode: "LOGISTICA", coDirector: true },
        { reason: "prueba" },
      ),
    );
    const facts = await honoraryFacts(personId);
    expect(facts.committeeRoles).toHaveLength(1);
    expect(facts.macroeventRoles[0]?.editionStartsAt?.toISOString()).toBe(
      "2025-10-20T14:00:00.000Z",
    );
    expect(facts.memberTermIds).toEqual([termId]);
    expect(facts.boardTermIds).toEqual([termId]);
    const eligibility = honoraryEligibility({ ...facts, workCommitteeTermIds: [] });
    // El término actual sigue abierto: solo cuenta la dirección del macroevento ya celebrado.
    expect(eligibility.items.find((item) => item.code === "MACROEVENT_ROLE_COMPLETE")?.met).toBe(
      true,
    );
    expect(eligibility.eligible).toBe(false);
  });

  it("registra un Premio OE con su categoría y lo lista en la persona", async () => {
    const termId = await seedTerm();
    const personId = await seedVeteran("premiada@eafit.edu.co");
    await grantRecognitionAs(admin, {
      personId,
      kind: "OE_AWARD",
      termId,
      award: "BEST_NEW_MEMBER",
      title: "",
    });
    const [premio] = await listRecognitionsFor(personId);
    expect(premio).toMatchObject({
      kind: "OE_AWARD",
      award: "BEST_NEW_MEMBER",
      title: "Mejor Miembro Nuevo",
      announcementId: null,
    });
  });

  it("el horario preferencial lista junta, mesa (máximo seis por comité) y macroevento", async () => {
    const termId = await seedTerm();
    const a3 = await seedCommittee("a3", "A3");
    const presi = await seedVeteran("presi@eafit.edu.co", { firstName: "Pía", lastName: "Presi" });
    await seedAppointment(presi, termId, "PRESIDENT");
    const roles = [
      "GENERAL",
      "FINANCIERO",
      "LOGISTICA",
      "MERCADEO",
      "RELACIONES_PUBLICAS",
      "GESTION_HUMANA",
    ];
    for (const [index, roleCode] of roles.entries()) {
      const personId = await seedVeteran(`mesa${index}@eafit.edu.co`, {
        firstName: "Mesa",
        lastName: String(index),
      });
      await seedCommitteeMembership(personId, a3, termId, roleCode);
    }
    // Una séptima persona en codirección queda fuera del tope de seis (Regl. art. 72).
    const septima = await seedVeteran("septima@eafit.edu.co", {
      firstName: "Sara",
      lastName: "Séptima",
    });
    await seedCommitteeMembership(septima, a3, termId);
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      setMemberRoles(
        ctx,
        { committeeId: a3, termId },
        { isAdmin: true, allCapabilities: true },
        { personId: septima, roles: [{ roleCode: "GENERAL", coDirector: true }] },
      ),
    );
    const rows = await listPreferentialSchedule(termId);
    expect(rows.filter((row) => row.kind === "BOARD").map((row) => row.name)).toEqual([
      "Pía Presi",
    ]);
    expect(rows.filter((row) => row.kind === "COMMITTEE")).toHaveLength(6);
    expect(rows.some((row) => row.name === "Sara Séptima")).toBe(false);
    expect(rows[0]?.roleLabel).toBe(t("T-444").split(" · ")[0]);
  });
});
