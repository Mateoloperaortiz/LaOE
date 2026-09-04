import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain } from "@/jobs/poller";
import "@/jobs/handlers";
import { interaction } from "@/modules/crm/schema";
import { committeeMembership, membership, membershipTerm } from "@/modules/people/schema";
import {
  applyDecisions,
  closeTermPermanenceAs,
  confirmAllProposedAs,
  confirmDecisionsAs,
  listClosingRows,
  listPersonDecisions,
  listSnapshots,
  recomputeSnapshots,
} from "@/modules/permanence";
import { manualCredit } from "@/modules/permanence/schema";
import { closeTermPoints, findTermByCode, getTerm } from "@/modules/terms";
import { truncateAll } from "./db";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedRule,
  seedTerm,
} from "./factories";

// Cierre de permanencia (ADR-036 regla 9): precondiciones, propuestas derivadas, motivo al cambiar,
// confirmación en bloque y aplicación reanudable por el job con comandos de `people`.

const GH = { personId: null as string | null, ip: null };

/**
 * Un término ya vencido (2024-2) con tres personas en A3 y una tabla del comité de 60 puntos por
 * crédito manual: quien cumple, quien queda en prueba y quien no alcanza; más una asamblea
 * obligatoria celebrada a la que solo faltó la persona en prueba.
 */
async function setup() {
  const termId = await seedTerm("2024-2");
  const previous = await seedTerm("2024-1");
  const a3 = await seedCommittee("a3");
  const pixel = await seedCommittee("pixel");
  const gh = await seedPerson("gh@eafit.edu.co");
  await seedMembership(gh, previous);
  GH.personId = gh;
  const eventos = await seedRule(termId, "eventos", {
    committeeId: a3,
    weight: 60,
    computation: "MANUAL",
    params: {},
  });
  const pixelRule = await seedRule(termId, "pixel", {
    committeeId: pixel,
    weight: 60,
    computation: "MANUAL",
    params: {},
  });
  const people = {
    cumple: await seedPerson("cumple@eafit.edu.co"),
    prueba: await seedPerson("prueba@eafit.edu.co"),
    sale: await seedPerson("sale@eafit.edu.co"),
  };
  for (const personId of Object.values(people)) {
    await seedMembership(personId, previous);
    await seedCommitteeMembership(personId, a3, termId, "MIEMBRO", {
      joinedAt: new Date("2024-07-20T12:00:00Z"),
    });
  }
  await seedCommitteeMembership(people.sale, pixel, termId, "MIEMBRO", {
    joinedAt: new Date("2024-07-20T12:00:00Z"),
  });
  await getDb()
    .insert(manualCredit)
    .values(
      [
        [eventos, people.cumple, 60],
        [eventos, people.prueba, 55],
        [eventos, people.sale, 10],
        [pixelRule, people.sale, 20],
      ].map(([ruleId, personId, value]) => ({
        termId,
        ruleId: String(ruleId),
        personId: String(personId),
        value: Number(value),
        reason: "seed",
        grantedById: gh,
      })),
    );
  const assembly = await seedOccasion(termId, {
    kind: "ASSEMBLY",
    assemblyKind: "ORDINARY",
    points: 0,
    status: "CLOSED",
    startsAt: new Date("2024-09-10T22:00:00Z"),
    checkInOpensAt: new Date("2024-09-10T21:00:00Z"),
    checkInClosesAt: new Date("2024-09-10T23:00:00Z"),
  });
  await seedCheckIn(assembly.id, people.cumple);
  await seedCheckIn(assembly.id, people.sale);
  await recomputeSnapshots(termId);
  return { termId, a3, pixel, gh, people };
}

describe("cierre de permanencia", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("deriva las propuestas del snapshot y no confirma nada sin los puntos cerrados", async () => {
    const { termId, people, a3, pixel } = await setup();
    const { rows, summary } = await listClosingRows(termId);
    const byId = new Map(rows.map((row) => [row.personId, row]));
    expect(byId.get(people.cumple)).toMatchObject({
      personProposed: "CONTINUES",
      committees: [{ committeeId: a3, proposed: "CONTINUES", reason: 0 }],
      decided: false,
    });
    // En prueba por puntos y además faltó a la obligatoria celebrada: sale de la OE.
    expect(byId.get(people.prueba)).toMatchObject({
      personProposed: "EXIT_OE",
      personReason: 4,
      mandatoryMet: false,
      committees: [{ committeeId: a3, proposed: "PROBATION", reason: 1 }],
    });
    expect(byId.get(people.sale)?.committees.map((c) => [c.committeeId, c.proposed])).toEqual(
      expect.arrayContaining([
        [a3, "EXIT_COMMITTEE"],
        [pixel, "EXIT_COMMITTEE"],
      ]),
    );
    expect(byId.get(people.sale)).toMatchObject({ personProposed: "EXIT_OE", personReason: 3 });
    expect(summary).toMatchObject({
      people: 3,
      continues: 1,
      probation: 1,
      exitCommittee: 2,
      exitOe: 2,
      undecided: 3,
      toApply: 0,
    });
    await expect(
      confirmDecisionsAs(GH, termId, {
        personId: people.cumple,
        person: "CONTINUES",
        committees: [],
        reason: "",
      }),
    ).rejects.toThrow(/Primero cerrá los puntos/);
    await expect(confirmAllProposedAs(GH, termId)).rejects.toThrow(/Primero cerrá los puntos/);
    await expect(closeTermPermanenceAs(GH, termId)).rejects.toThrow(/Primero cerrá los puntos/);
  });

  it("cambiar la propuesta exige motivo; rige la confirmada y el bloque cubre a quienes faltan", async () => {
    const { termId, people, a3, gh } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await expect(
      confirmDecisionsAs(GH, termId, {
        personId: people.prueba,
        person: "CONTINUES",
        committees: [{ committeeId: a3, decision: "PROBATION" }],
        reason: "",
      }),
    ).rejects.toThrow(/exige un motivo/);
    await confirmDecisionsAs(GH, termId, {
      personId: people.prueba,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "PROBATION" }],
      reason: "Justificó la falta a la asamblea",
    });
    const confirmed = await confirmAllProposedAs(GH, termId);
    expect(confirmed).toBe(2);
    expect(await confirmAllProposedAs(GH, termId)).toBe(0);
    const { rows, summary } = await listClosingRows(termId);
    expect(rows.every((row) => row.decided)).toBe(true);
    const prueba = rows.find((row) => row.personId === people.prueba);
    expect(prueba).toMatchObject({
      effective: "CONTINUES",
      personProposed: "EXIT_OE",
      overridden: true,
      drifted: false,
      decidedByName: expect.any(String),
    });
    expect(prueba?.personDecision).toMatchObject({
      decidedById: gh,
      reason: "Justificó la falta a la asamblea",
    });
    expect(summary).toMatchObject({ undecided: 0, exitOe: 1, continues: 2, toApply: 7 });
    // Aplicar el cierre: estampa, congela, crea 2025-1 y encola el job.
    await expect(closeTermPermanenceAs(GH, termId)).resolves.toMatchObject({
      nextTermId: expect.any(String),
    });
    const next = await findTermByCode("2025-1");
    expect(next).not.toBeNull();
    expect((await getTerm(termId))?.permanenceClosedAt).not.toBeNull();
    expect((await listSnapshots(termId)).every((row) => row.frozenAt !== null)).toBe(true);
    await expect(closeTermPermanenceAs(GH, termId)).rejects.toThrow(/ya cerró su permanencia/);
  });

  it("el job aplica cada decisión con comandos de people, es reanudable y no repite efectos", async () => {
    const { termId, people, a3, pixel, gh } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await confirmDecisionsAs(GH, termId, {
      personId: people.prueba,
      person: "CONTINUES",
      committees: [{ committeeId: a3, decision: "PROBATION" }],
      reason: "Justificó la falta",
    });
    await confirmDecisionsAs(GH, termId, {
      personId: people.sale,
      person: "CONTINUES",
      committees: [
        { committeeId: a3, decision: "EXIT_COMMITTEE" },
        { committeeId: pixel, decision: "PROBATION" },
      ],
      reason: "Se queda solo en Pixel",
    });
    await confirmAllProposedAs(GH, termId);
    // Una salida de la OE real: la persona que cumple, cambiada con motivo.
    await confirmDecisionsAs(GH, termId, {
      personId: people.cumple,
      person: "EXIT_OE",
      committees: [{ committeeId: a3, decision: "CONTINUES" }],
      reason: "Se retira por decisión propia",
    });
    const { nextTermId } = await closeTermPermanenceAs(GH, termId);
    // Primera pasada parcial: aplica todo lo pendiente y una segunda no repite nada.
    const applied = await applyDecisions(termId, nextTermId);
    expect(applied).toBe(7);
    expect(await applyDecisions(termId, nextTermId)).toBe(0);
    const db = getDb();
    const [cumple] = await db
      .select()
      .from(membership)
      .where(eq(membership.personId, people.cumple));
    expect(cumple).toMatchObject({
      status: "INACTIVE",
      endReason: "PERMANENCE",
      lastTermId: termId,
    });
    const [probation] = await db
      .select()
      .from(membershipTerm)
      .where(
        and(eq(membershipTerm.personId, people.prueba), eq(membershipTerm.termId, nextTermId)),
      );
    expect(probation).toMatchObject({ probation: true, decidedById: gh });
    const [left] = await db
      .select()
      .from(committeeMembership)
      .where(
        and(
          eq(committeeMembership.personId, people.sale),
          eq(committeeMembership.committeeId, a3),
          eq(committeeMembership.termId, termId),
        ),
      );
    expect(left?.leftAt).not.toBeNull();
    const [stays] = await db
      .select()
      .from(committeeMembership)
      .where(
        and(
          eq(committeeMembership.personId, people.sale),
          eq(committeeMembership.committeeId, pixel),
        ),
      );
    expect(stays?.leftAt).toBeNull();
    // El evento del outbox (`permanence.closed`) ya se aplicó a mano: el drain no repite nada
    // y la línea de tiempo recibe una interacción por decisión.
    await drain(50);
    expect(await applyDecisions(termId, nextTermId)).toBe(0);
    const decisions = await listPersonDecisions(people.sale, termId);
    expect(decisions.every((row) => row.appliedAt !== null)).toBe(true);
    expect(decisions.map((row) => row.decision).sort()).toEqual(
      ["CONTINUES", "EXIT_COMMITTEE", "PROBATION"].sort(),
    );
    const timeline = await db
      .select({ summary: interaction.summary })
      .from(interaction)
      .where(and(eq(interaction.personId, people.sale), eq(interaction.kind, "PERMANENCE")));
    expect(timeline.length).toBe(3);
    expect(timeline.some((row) => row.summary.includes("Sale del comité"))).toBe(true);
    // El término cerrado no recalcula ni descongela.
    expect(await recomputeSnapshots(termId)).toBe(0);
  });
});
