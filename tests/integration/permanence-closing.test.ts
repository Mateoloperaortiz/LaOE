import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { interaction } from "@/modules/crm/schema";
import { reactivateMembershipAs } from "@/modules/people";
import { committeeMembership, membership, membershipTerm } from "@/modules/people/schema";
import {
  applyDecisions,
  closeTermPermanenceAs,
  confirmAllProposedAs,
  confirmDecisionsAs,
  listClosingRows,
  listCompliance,
  listPersonDecisions,
  listSnapshots,
  parseResults,
  recomputeSnapshots,
} from "@/modules/permanence";
import { complianceResource } from "@/modules/permanence/admin";
import { manualCredit, permanenceSnapshot } from "@/modules/permanence/schema";
import { closeTermPoints, findTermByCode, getTerm } from "@/modules/terms";
import { t, tList } from "@/shared/copy";
import { copyPattern, itemPattern } from "../helpers/copy";
import { drainOutbox } from "../helpers/outbox";
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

/** Un ítem de una lista del catálogo como patrón: sus variables aceptan cualquier cosa. */

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
    ).rejects.toThrow(copyPattern("T-799"));
    await expect(confirmAllProposedAs(GH, termId)).rejects.toThrow(copyPattern("T-799"));
    await expect(closeTermPermanenceAs(GH, termId)).rejects.toThrow(copyPattern("T-799"));
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
    ).rejects.toThrow(t("T-805"));
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
    expect((await getTerm(termId))?.permanenceClosedAt).toBeInstanceOf(Date);
    const snapshots = await listSnapshots(termId);
    expect(snapshots).toHaveLength(3);
    for (const snapshot of snapshots) expect(snapshot.frozenAt).toBeInstanceOf(Date);
    await expect(closeTermPermanenceAs(GH, termId)).rejects.toThrow(copyPattern("T-808"));
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
    expect(left?.leftAt).toBeInstanceOf(Date);
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
    await drainOutbox();
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
    // Una por decisión más la condición de prueba fijada en el término siguiente (ADR-056).
    expect(timeline.length).toBe(4);
    expect(timeline.some((row) => row.summary.includes(tList("T-802")[2]))).toBe(true);
    expect(timeline.some((row) => itemPattern(tList("T-832")[7]).test(row.summary))).toBe(true);
    // El término cerrado no recalcula ni descongela.
    expect(await recomputeSnapshots(termId)).toBe(0);
  });

  it("expulsa a quien faltó a una obligatoria y fija la prueba solo en su comité (ADR-060)", async () => {
    const { termId, people, a3 } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    const { rows } = await listClosingRows(termId);
    const row = (id: string) => rows.find((item) => item.personId === id);
    // 55 en A3 con banda de 20 (Est. art. 7.5) es prueba en ese comité; pero faltó a la obligatoria.
    expect(row(people.prueba)?.committees[0]).toMatchObject({
      committeeId: a3,
      proposed: "PROBATION",
      reason: 1,
    });
    expect(row(people.prueba)).toMatchObject({ personProposed: "EXIT_OE", personReason: 4 });
    // 10 en A3 y 20 en Pixel están fuera de la banda: sale de los dos y de la OE por permanencia.
    expect(row(people.sale)).toMatchObject({ personProposed: "EXIT_OE", personReason: 3 });
    expect(row(people.cumple)).toMatchObject({ personProposed: "CONTINUES" });

    await confirmAllProposedAs(GH, termId);
    const { nextTermId } = await closeTermPermanenceAs(GH, termId);
    await applyDecisions(termId, nextTermId);
    const db = getDb();
    const membershipOf = async (personId: string) =>
      (await db.select().from(membership).where(eq(membership.personId, personId)))[0];
    expect(await membershipOf(people.prueba)).toMatchObject({
      status: "INACTIVE",
      endReason: "EXPULSION",
    });
    expect(await membershipOf(people.sale)).toMatchObject({
      status: "INACTIVE",
      endReason: "PERMANENCE",
    });
    expect(await membershipOf(people.cumple)).toMatchObject({ status: "ACTIVE" });
    // Quien fue expulsado no vuelve a ingresar (Regl. art. 61.3).
    await expect(
      reactivateMembershipAs(GH, people.prueba, { reason: "Pidió volver" }),
    ).rejects.toThrow(t("T-2206"));
  });

  it("al aplicar el cierre cada snapshot queda con su estado final y sin puntos posibles, y así lo entregan Cumplimiento y su exporte", async () => {
    const { termId, people } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await confirmAllProposedAs(GH, termId);
    // Con el término abierto el estado es una proyección y todavía quedan puntos posibles.
    const open = (await listSnapshots(termId)).flatMap((snapshot) =>
      snapshot.results.map((result) => ({ personId: snapshot.personId, ...result })),
    );
    expect(open).toHaveLength(4);
    for (const result of open) {
      expect(["EN_CAMINO", "EN_RIESGO", "NO_ALCANZA"]).toContain(result.state);
      expect(result.remaining).toBeGreaterThan(0);
    }
    const finalOf = new Map(
      open.map((result) => [`${result.personId}:${result.committeeId}`, result.finalState]),
    );

    await closeTermPermanenceAs(GH, termId);

    const frozen = await listSnapshots(termId);
    expect(frozen).toHaveLength(3);
    for (const snapshot of frozen) {
      expect(snapshot.frozenAt).toBeInstanceOf(Date);
      for (const criterion of snapshot.general) expect(criterion.remaining).toBe(0);
      for (const result of snapshot.results) {
        // El estado que queda guardado es el final que GH vio y confirmó.
        expect(result.state).toBe(finalOf.get(`${snapshot.personId}:${result.committeeId}`));
        expect(result.state).toBe(result.finalState);
        expect(result.remaining).toBe(0);
        expect(result.margin).toBe(Math.round((result.total - result.threshold) * 100) / 100);
        for (const criterion of result.criteria) expect(criterion.remaining).toBe(0);
      }
    }
    // Cumplimiento: cada fila dice Cumple, Prueba o No cumple, y sus filtros encuentran a cada quien.
    const stateOf = async (filter?: "no-alcanza" | "prueba") =>
      (await listCompliance(termId, filter)).map((row) => [row.personId, row.state]);
    expect((await stateOf()).sort()).toEqual(
      [
        [people.cumple, "CUMPLE"],
        [people.prueba, "PRUEBA"],
        [people.sale, "NO_CUMPLE"],
        [people.sale, "NO_CUMPLE"],
      ].sort(),
    );
    expect((await listCompliance(termId)).every((row) => row.remaining === 0)).toBe(true);
    expect(await stateOf("no-alcanza")).toEqual([
      [people.sale, "NO_CUMPLE"],
      [people.sale, "NO_CUMPLE"],
    ]);
    expect(await stateOf("prueba")).toEqual([[people.prueba, "PRUEBA"]]);
    // Y el exporte lleva la etiqueta del estado final (T-791: Cumple, Prueba, No cumple).
    const [, , , cumple, prueba, noCumple] = tList("T-791");
    const stateHeader = tList("T-836")[9] ?? "";
    const exported = await complianceResource.list({
      q: "",
      filters: { termId },
      page: 1,
      pageSize: 50,
    });
    expect(
      exported.rows.map((row) => complianceResource.exportRow?.(row)[stateHeader]).sort(),
    ).toEqual([cumple, prueba, noCumple, noCumple].sort());
  });

  // Decisión abierta 22: los términos que cerraron antes de ADR-116 regla 6 tienen sus snapshots
  // congelados con el estado abierto. Qué se hace con ellos no está decidido: ni el cierre ni los
  // lectores los tocan, y esta prueba fija que se leen tal como quedaron guardados.
  it("un snapshot congelado con el estado abierto se lee como quedó guardado (decisión abierta 22)", async () => {
    const { termId, people } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await confirmAllProposedAs(GH, termId);
    await closeTermPermanenceAs(GH, termId);
    const db = getDb();
    const mine = and(
      eq(permanenceSnapshot.termId, termId),
      eq(permanenceSnapshot.personId, people.cumple),
    );
    const [stored] = await db.select().from(permanenceSnapshot).where(mine);
    // Así quedaba congelado un snapshot antes de la regla: «En camino» y con puntos posibles.
    const legacy = parseResults(stored?.results).map((result) => ({
      ...result,
      state: "EN_CAMINO" as const,
      remaining: 18,
      margin: 18,
    }));
    await db.update(permanenceSnapshot).set({ results: legacy }).where(mine);

    expect(await recomputeSnapshots(termId)).toBe(0);

    const [row] = (await listCompliance(termId)).filter((item) => item.personId === people.cumple);
    expect(row).toMatchObject({ state: "EN_CAMINO", remaining: 18 });
    const [snapshot] = (await listSnapshots(termId)).filter(
      (item) => item.personId === people.cumple,
    );
    expect(snapshot?.results[0]).toMatchObject({
      state: "EN_CAMINO",
      finalState: "CUMPLE",
      remaining: 18,
    });
    expect(snapshot?.frozenAt).toEqual(stored?.frozenAt);
  });
});
