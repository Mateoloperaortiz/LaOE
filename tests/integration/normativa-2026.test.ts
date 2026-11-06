import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { createEdition } from "@/modules/events/domain/editions";
import { createEvent } from "@/modules/events/domain/events";
import { macroeventRoleCodes } from "@/modules/events/domain/macroevents-pure";
import { addMacroeventDirector, removeAppointment } from "@/modules/people/domain/appointments";
import {
  decideMacroeventReactivationAs,
  getMacroeventGovernance,
  proposeMacroeventReactivationAs,
  recordMacroeventElectionAs,
  reviewMacroeventAs,
} from "@/modules/people/domain/macroevent-governance";
import { electionRecordSchema } from "@/modules/people/domain/macroevent-governance-pure";
import { membership } from "@/modules/people/schema";
import { loadTermFacts } from "@/modules/permanence/domain/facts";
import { recomputeSnapshots } from "@/modules/permanence/domain/snapshots";
import { auditLog } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { seedMember, seedTerm } from "../factories";
import { truncateAll } from "./db";

const evidence = electionRecordSchema.parse({
  origin: "ELECTED",
  minutes: "Acta de prueba",
  requirementsChecked: true,
  lateCandidacy: false,
  qualifiedPermission: "",
  experience: "VERIFIED",
  generalFacultyChecked: true,
  compositionChecked: true,
  extraordinary: false,
  workPlan: "",
});
async function setup() {
  const termId = await seedTerm("2026-2");
  const event = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEvent(ctx, {
      slug: "inventiva",
      name: "Inventiva",
      summary: "",
      description: "",
      audience: "PUBLIC",
      publicationStatus: "DRAFT",
      sortOrder: 1,
    }),
  );
  const edition = await runCommand(SYSTEM_ACTOR, (ctx) =>
    createEdition(ctx, {
      eventId: event.id,
      slug: "2026",
      name: "Edición de prueba",
      description: "",
      startsAt: new Date("2026-09-01T15:00:00Z"),
      location: "",
      publicationStatus: "DRAFT",
      committeeIds: [],
    }),
  );
  const add = async (roleCode: "GENERAL" | "LOGISTICA", coDirector = false) => {
    const personId = await seedMember(`${roleCode.toLowerCase()}-${coDirector}@example.com`);
    return runCommand(SYSTEM_ACTOR, (ctx) =>
      addMacroeventDirector(ctx, { termId, editionId: edition.id, personId, roleCode, coDirector }),
    );
  };
  const review = () =>
    reviewMacroeventAs(SYSTEM_ACTOR, {
      eventId: event.id,
      year: 2026,
      assemblyOn: "2026-09-02",
      minutes: "Acta del corte de prueba",
      afterElections: true,
    });
  return { termId, event, edition, add, review };
}
describe("normativa actualizada en la base", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);
  it("carga las dos políticas por semestre y no recalcula un cierre anterior", async () => {
    const previous = await seedTerm("2026-1");
    const current = await seedTerm("2026-2");
    expect((await loadTermFacts(previous))?.config.probationMargins.active).toBe(20);
    expect((await loadTermFacts(current))?.config.probationMargins.active).toBe(10);
    await getDb()
      .update(term)
      .set({ permanenceClosedAt: new Date("2026-06-30T12:00:00Z") })
      .where(eq(term.id, previous));
    expect(await recomputeSnapshots(previous)).toBe(0);
  });
  it("exige verificar todos los nombramientos y conserva el corte aunque después cambie la mesa", async () => {
    const { event, add, review, edition } = await setup();
    const general = await add("GENERAL");
    const logistics = await add("LOGISTICA");
    await expect(review()).rejects.toThrow();
    await recordMacroeventElectionAs(SYSTEM_ACTOR, event.id, general.id, evidence);
    await recordMacroeventElectionAs(SYSTEM_ACTOR, event.id, logistics.id, evidence);
    expect((await review()).status).toBe("ENABLED");
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      removeAppointment(ctx, logistics.id, { editionId: edition.id }),
    );
    const state = await getMacroeventGovernance(event.id, 2026);
    expect(state.viability.status).toBe("DISABLED");
    expect(state.review?.status).toBe("ENABLED");
    expect(state.review?.electedRoles).toHaveLength(2);
    await expect(review()).rejects.toThrow();
  });
  it("un cambio en la codirección invalida la constancia de la candidatura conjunta", async () => {
    const { event, add } = await setup();
    const general = await add("GENERAL");
    await recordMacroeventElectionAs(SYSTEM_ACTOR, event.id, general.id, evidence);
    expect((await getMacroeventGovernance(event.id, 2026)).viability.unverified).toBe(0);
    await add("GENERAL", true);
    expect((await getMacroeventGovernance(event.id, 2026)).viability.unverified).toBe(2);
  });
  it("no permite clasificar el nombramiento desde otro evento ni omitir el permiso tardío", async () => {
    const { event, add } = await setup();
    const general = await add("GENERAL");
    await expect(
      recordMacroeventElectionAs(SYSTEM_ACTOR, "otro-evento", general.id, evidence),
    ).rejects.toThrow();
    await expect(
      recordMacroeventElectionAs(SYSTEM_ACTOR, event.id, general.id, {
        ...evidence,
        lateCandidacy: true,
      }),
    ).rejects.toThrow();
    expect((await getMacroeventGovernance(event.id, 2026)).viability.unverified).toBe(1);
  });
  it("reactiva solo con mesa completa vigente, aprobación y aviso; conserva propuesta y auditoría", async () => {
    const { event, review } = await setup();
    expect((await review()).status).toBe("DISABLED");
    const roster = [];
    for (const [i, roleCode] of macroeventRoleCodes("inventiva").entries())
      roster.push({ roleCode, personId: await seedMember(`reactivacion-${i}@example.com`) });
    const input = {
      eventId: event.id,
      year: 2027,
      submittedOn: "2026-10-01",
      electionSession: "Jornadas de elección de prueba",
      mission: "Misión de prueba completa",
      workPlan: "Plan de trabajo de prueba",
      roster,
    };
    await expect(
      proposeMacroeventReactivationAs(SYSTEM_ACTOR, { ...input, roster: roster.slice(0, 2) }),
    ).rejects.toThrow();
    const proposal = await proposeMacroeventReactivationAs(SYSTEM_ACTOR, input);
    await expect(proposeMacroeventReactivationAs(SYSTEM_ACTOR, input)).rejects.toThrow();
    await expect(
      decideMacroeventReactivationAs(SYSTEM_ACTOR, {
        eventId: event.id,
        proposalId: proposal.id,
        approved: true,
        decisionMinutes: "Acta de Junta",
        assemblyNotice: "",
      }),
    ).rejects.toThrow();
    const rosterPersonId = roster[0]?.personId;
    if (!rosterPersonId) throw new Error("Falta integrante de prueba");
    await getDb()
      .update(membership)
      .set({ status: "ON_LEAVE" })
      .where(eq(membership.personId, rosterPersonId));
    await expect(
      decideMacroeventReactivationAs(SYSTEM_ACTOR, {
        eventId: event.id,
        proposalId: proposal.id,
        approved: true,
        decisionMinutes: "Acta de Junta",
        assemblyNotice: "Comunicación a Asamblea",
      }),
    ).rejects.toThrow();
    expect((await getMacroeventGovernance(event.id, 2027)).approved).toBe(false);
    await getDb()
      .update(membership)
      .set({ status: "ACTIVE" })
      .where(eq(membership.personId, rosterPersonId));
    await decideMacroeventReactivationAs(SYSTEM_ACTOR, {
      eventId: event.id,
      proposalId: proposal.id,
      approved: true,
      decisionMinutes: "Acta de Junta",
      assemblyNotice: "Comunicación a Asamblea",
    });
    expect((await getMacroeventGovernance(event.id, 2027)).approved).toBe(true);
    expect(
      await getDb()
        .select()
        .from(auditLog)
        .where(eq(auditLog.action, "macroevent.reactivation_decided")),
    ).toHaveLength(1);
    await expect(
      decideMacroeventReactivationAs(SYSTEM_ACTOR, {
        eventId: event.id,
        proposalId: proposal.id,
        approved: false,
        decisionMinutes: "Otra acta de Junta",
        assemblyNotice: "Otra comunicación",
      }),
    ).rejects.toThrow();
  });
});
