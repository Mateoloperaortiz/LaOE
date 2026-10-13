import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR, type Tx } from "@/db/tx";
import { permanenceClosed, permanenceDecided } from "@/domain-events/permanence";
import { message } from "@/modules/comms/schema";
import { interaction } from "@/modules/crm/schema";
import { reactivateMembershipAs } from "@/modules/people";
import { committeeMembership, membership, membershipTerm } from "@/modules/people/schema";
import {
  applyDecisions,
  closeTermPermanenceAs,
  confirmAllProposedAs,
  confirmDecisionsAs,
  freezeSnapshots,
  getPersonPermanence,
  listClosingRows,
  listCompliance,
  listPersonDecisions,
  listSnapshots,
  parseResults,
  recomputeSnapshots,
} from "@/modules/permanence";
import { complianceResource } from "@/modules/permanence/admin";
import { permanenceDecision, permanenceSnapshot } from "@/modules/permanence/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { closeTermPermanence, closeTermPoints, findTermByCode, getTerm } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedManualCredit,
  seedMembership,
  seedOccasion,
  seedPerson,
  seedRule,
  seedTerm,
} from "../factories";
import { copyPattern, itemPattern } from "../helpers/copy";
import {
  backendPid,
  deferred,
  holdCommand,
  holdTransaction,
  outcome,
  waitingForLock,
  waitingOn,
} from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

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
  for (const [ruleId, personId, value] of [
    [eventos, people.cumple, 60],
    [eventos, people.prueba, 55],
    [eventos, people.sale, 10],
    [pixelRule, people.sale, 20],
  ] as const) {
    await seedManualCredit(termId, ruleId, personId, value, { reason: "seed", grantedById: gh });
  }
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

/** Las decisiones de una persona como las lee la Persona 360: sobre el resultado que la pestaña muestra. */
async function decisionsOf(personId: string, termId: string) {
  const view = await getPersonPermanence(personId, termId);
  if (!view) {
    throw new Error("el término no tiene hechos de permanencia");
  }
  return listPersonDecisions(personId, termId, view);
}

/** Retiene la fila del término: el cierre se detiene al estamparlo, con su transacción ya abierta. */
function holdTerm(termId: string) {
  return holdTransaction((tx) =>
    tx.select({ id: term.id }).from(term).where(eq(term.id, termId)).for("update"),
  );
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
    const decisions = await decisionsOf(people.sale, termId);
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

  it("un recálculo que llega con el cierre en vuelo lo espera y encuentra los snapshots congelados", async () => {
    const { termId } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await confirmAllProposedAs(GH, termId);
    const held = await holdTerm(termId);
    const closing = closeTermPermanenceAs(GH, termId);
    void closing.catch(() => undefined);
    let recompute: Promise<number> = Promise.resolve(0);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      recompute = recomputeSnapshots(termId);
      void recompute.catch(() => undefined);
      // Hace cola por el candado del término, que el cierre tomó antes de tocar nada (ADR-116 regla 6).
      await expect.poll(waitingForLock).toBe(2);
      held.release();
      await held.done;
      await closing;
      // Cuando le toca, el término ya cerró: no escribe ninguna fila.
      expect(await recompute).toBe(0);
    } finally {
      held.release();
      await Promise.allSettled([held.done, closing, recompute]);
    }
    const frozen = await listSnapshots(termId);
    expect(frozen).toHaveLength(3);
    for (const snapshot of frozen) expect(snapshot.frozenAt).toBeInstanceOf(Date);
  });

  it("el cierre y un recálculo que escribe los snapshots en otro orden no se interbloquean", async () => {
    const { termId } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await confirmAllProposedAs(GH, termId);
    const ids = (
      await getDb()
        .select({ id: permanenceSnapshot.id })
        .from(permanenceSnapshot)
        .where(eq(permanenceSnapshot.termId, termId))
        .orderBy(asc(permanenceSnapshot.id))
    ).map((row) => row.id);
    const first = ids[0] ?? "";
    const last = ids.at(-1) ?? "";
    const held = await holdTerm(termId);
    const state = { closed: false, writer: null as number | null };
    const closing = closeTermPermanenceAs(GH, termId).finally(() => {
      state.closed = true;
    });
    void closing.catch(() => undefined);
    // Lo que hace `recomputeSnapshots`: toma el candado del término y escribe los snapshots sin congelar
    // en el orden de las personas, que no es el de `id`. Acá, la última fila primero y, cuando la prueba
    // la suelta, la primera: el cierre las toma en orden de `id`.
    const next = deferred<void>();
    const touch = (tx: Tx, id: string) =>
      tx
        .update(permanenceSnapshot)
        .set({ computedAt: new Date() })
        .where(and(eq(permanenceSnapshot.id, id), isNull(permanenceSnapshot.frozenAt)));
    let recompute: Promise<unknown> = Promise.resolve();
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      recompute = getDb().transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`permanence:${termId}`}))`);
        await touch(tx, last);
        state.writer = await backendPid(tx);
        await next.promise;
        await touch(tx, first);
      });
      void recompute.catch(() => undefined);
      // O hace cola por el candado del término, o no esperó al cierre y ya tiene escrita su fila.
      await expect
        .poll(async () => state.writer !== null || (await waitingForLock()) === 2)
        .toBe(true);
      held.release();
      await held.done;
      // El cierre sigue: termina, o se detiene en la fila que el recálculo tiene escrita.
      await expect
        .poll(
          async () =>
            state.closed || (state.writer !== null && (await waitingOn(state.writer)) === 1),
        )
        .toBe(true);
      next.resolve();
      const [closed, recomputed] = await Promise.allSettled([closing, recompute]);
      expect({ cierre: outcome(closed), recalculo: outcome(recomputed) }).toEqual({
        cierre: "ok",
        recalculo: "ok",
      });
    } finally {
      held.release();
      next.resolve();
      await Promise.allSettled([held.done, closing, recompute]);
    }
    for (const snapshot of await listSnapshots(termId)) {
      expect(snapshot.frozenAt).toBeInstanceOf(Date);
    }
  });

  it("un recálculo que deja a alguien sin decisión entre la validación y el candado detiene el cierre, que no aplica nada", async () => {
    const { termId, pixel, people } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await confirmAllProposedAs(GH, termId);
    const termsBefore = (await getDb().select({ id: term.id }).from(term)).length;
    const lockTerm = (tx: Tx) =>
      tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`permanence:${termId}`}))`);
    // La cola del candado de los recálculos del término, en el orden en que PostgreSQL lo entrega:
    // el recálculo del propio cierre, una transacción que solo lo retiene y un recálculo ajeno.
    const first = await holdTransaction(lockTerm);
    const closing = closeTermPermanenceAs(GH, termId);
    void closing.catch(() => undefined);
    let second: ReturnType<typeof holdTransaction> | null = null;
    let recompute: Promise<number> = Promise.resolve(0);
    try {
      await expect.poll(() => waitingOn(first.pid)).toBe(1);
      second = holdTransaction(lockTerm);
      void second.catch(() => undefined);
      await expect.poll(() => waitingOn(first.pid)).toBe(2);
      recompute = recomputeSnapshots(termId);
      void recompute.catch(() => undefined);
      await expect.poll(() => waitingOn(first.pid)).toBe(3);
      first.release();
      await first.done;
      // El cierre ya recalculó y validó «nadie sin decidir»; ahora hace cola, detrás del recálculo
      // ajeno, por el candado con el que abre su transacción.
      const gap = await second;
      await expect.poll(() => waitingOn(gap.pid)).toBe(2);
      // En ese hueco cambian los hechos: quien cumplía entra a un segundo comité, y el recálculo que
      // esperaba le suma un resultado que nadie decidió.
      await seedCommitteeMembership(people.cumple, pixel, termId, "MIEMBRO", {
        joinedAt: new Date("2024-07-20T12:00:00Z"),
      });
      gap.release();
      await gap.done;
      expect(await recompute).toBe(3);
      // El mismo error que cuando falta una decisión antes de empezar (T-807).
      await expect(closing).rejects.toThrow(t("T-807", { n: 1 }));
    } finally {
      first.release();
      const gap = await second?.catch(() => null);
      gap?.release();
      await Promise.allSettled([first.done, gap?.done, closing, recompute]);
    }
    // Nada se aplicó: el término sigue abierto, no nació el siguiente, ningún snapshot quedó congelado
    // y no hay evento de cierre que el job pueda tomar.
    expect((await getTerm(termId))?.permanenceClosedAt).toBeNull();
    expect(await getDb().select({ id: term.id }).from(term)).toHaveLength(termsBefore);
    for (const snapshot of await listSnapshots(termId)) expect(snapshot.frozenAt).toBeNull();
    expect(
      await getDb()
        .select({ id: outbox.id })
        .from(outbox)
        .where(eq(outbox.eventType, permanenceClosed.type)),
    ).toHaveLength(0);
    const { summary } = await listClosingRows(termId);
    expect(summary).toMatchObject({ undecided: 1, applied: 0 });
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

  // Leer degrada a vacío un JSON que no valida, para no romper la pantalla. Congelar escribe encima:
  // si guardara ese vacío, el término quedaría cerrado con el resultado de la persona borrado.
  it("congelar no escribe vacío sobre un snapshot que no entiende: falla y no congela ninguno", async () => {
    const { termId, people } = await setup();
    await recomputeSnapshots(termId);
    const db = getDb();
    const mine = and(
      eq(permanenceSnapshot.termId, termId),
      eq(permanenceSnapshot.personId, people.cumple),
    );
    const ofTerm = () =>
      db.select().from(permanenceSnapshot).where(eq(permanenceSnapshot.termId, termId));
    const freeze = () => runCommand(SYSTEM_ACTOR, (ctx) => freezeSnapshots(ctx, termId));
    const [intact] = await db.select().from(permanenceSnapshot).where(mine);
    if (!intact) throw new Error("falta el snapshot");
    const sound = { general: intact.general, results: intact.results };

    for (const column of ["general", "results"] as const) {
      const broken = [{ roto: `sin lo que pide ${column}` }];
      await db
        .update(permanenceSnapshot)
        .set({ ...sound, [column]: broken })
        .where(mine);

      await expect(freeze()).rejects.toThrow(/no valida/);

      // La transacción se devuelve entera: ni el dañado ni los sanos quedan congelados.
      const rows = await ofTerm();
      expect(rows.length).toBeGreaterThan(1);
      expect(rows.filter((row) => row.frozenAt !== null)).toEqual([]);
      const [stored] = await db.select().from(permanenceSnapshot).where(mine);
      expect(stored?.[column]).toEqual(broken);
    }

    // Con lo guardado sano, congela todos.
    await db.update(permanenceSnapshot).set(sound).where(mine);
    await freeze();
    expect((await ofTerm()).filter((row) => row.frozenAt === null)).toEqual([]);
  });

  /** Cuántas auditorías del cierre tiene el término. */
  async function closingAudits(termId: string): Promise<number> {
    const rows = await getDb()
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(and(eq(auditLog.action, "term.permanence-closed"), eq(auditLog.entityId, termId)));
    return rows.length;
  }

  // ADR-118 regla 27: el cierre toma la fila del término antes de leerla, como el cierre de puntos.
  it("dos cierres de permanencia a la vez sobre el término: el segundo espera la fila y recibe que ya cerró", async () => {
    const { termId } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    const first = new Date("2025-01-10T15:00:00Z");
    const later = new Date("2025-01-10T15:00:05Z");
    const held = await holdCommand(GH, (ctx) => closeTermPermanence(ctx, termId, first));
    const second = runCommand(GH, (ctx) => closeTermPermanence(ctx, termId, later));
    void second.catch(() => undefined);
    let settled: PromiseSettledResult<unknown>[] = [];
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
    } finally {
      held.release();
      settled = await Promise.allSettled([second, held.done]);
    }
    const [result] = settled;
    if (!result) throw new Error("sin resultado");
    expect({
      second: outcome(result),
      closedAt: (await getTerm(termId))?.permanenceClosedAt?.toISOString(),
      audits: await closingAudits(termId),
    }).toEqual({
      second: expect.stringMatching(copyPattern("T-808")),
      closedAt: first.toISOString(),
      audits: 1,
    });
  });

  it("dos «Aplicar el cierre» a la vez: el segundo espera y recibe que ya cerró, con un solo evento de aplicación", async () => {
    const { termId } = await setup();
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, termId));
    await confirmAllProposedAs(GH, termId);
    const held = await holdTerm(termId);
    const first = closeTermPermanenceAs(GH, termId);
    void first.catch(() => undefined);
    let second: Promise<unknown> = Promise.resolve();
    try {
      // El primero ya tiene el candado de los recálculos y espera la fila del término.
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      second = closeTermPermanenceAs(GH, termId);
      void second.catch(() => undefined);
      // El segundo hace cola detrás del primero, no detrás de la prueba.
      await expect.poll(waitingForLock).toBe(2);
      expect(await waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(first).resolves.toMatchObject({ nextTermId: expect.any(String) });
      await expect(second).rejects.toThrow(copyPattern("T-808"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, first, second]);
    }
    expect(await closingAudits(termId)).toBe(1);
    const events = await getDb()
      .select({ id: outbox.id })
      .from(outbox)
      .where(eq(outbox.eventType, permanenceClosed.type));
    expect(events).toHaveLength(1);
  });

  // DT-025: `applyDecisions` aplica cada consecuencia en su transacción y marca la decisión en otra.
  // Dice ser reanudable porque los comandos de `people` toleran repetirse; acá se mata entre las dos.

  /** Cuántas filas de cada tipo dejó el cierre aplicado, sin identificadores. */
  async function footprint() {
    const tally = (keys: string[]) => {
      const out: Record<string, number> = {};
      for (const key of [...keys].sort()) out[key] = (out[key] ?? 0) + 1;
      return out;
    };
    const db = getDb();
    const [audits, events, messages, interactions] = await Promise.all([
      db.select({ key: auditLog.action }).from(auditLog),
      db.select({ key: outbox.eventType }).from(outbox),
      db
        .select({ channel: message.channel, status: message.status, subject: message.subject })
        .from(message),
      db.select({ key: interaction.kind }).from(interaction),
    ]);
    return {
      audits: tally(audits.map((row) => row.key)),
      events: tally(events.map((row) => row.key)),
      messages: tally(messages.map((row) => `${row.channel}:${row.status}:${row.subject}`)),
      interactions: tally(interactions.map((row) => row.key)),
    };
  }

  /**
   * El cierre con las tres consecuencias (una baja, una prueba, y una salida de comité con prueba en
   * el otro), aplicado de corrido o con la aplicación muerta al marcar las decisiones de `victim`:
   * su consecuencia ya quedó confirmada y su marca no. Devuelve lo que quedó después de reanudar.
   */
  async function applyClosing(victim: "cumple" | "prueba" | "sale" | null) {
    const { termId, people, a3, pixel } = await setup();
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
    await confirmDecisionsAs(GH, termId, {
      personId: people.cumple,
      person: "EXIT_OE",
      committees: [{ committeeId: a3, decision: "CONTINUES" }],
      reason: "Se retira por decisión propia",
    });
    const { nextTermId } = await closeTermPermanenceAs(GH, termId);
    const db = getDb();
    if (victim) {
      const personId = people[victim];
      const held = await holdTransaction((tx) =>
        tx
          .select({ id: permanenceDecision.id })
          .from(permanenceDecision)
          .where(
            and(eq(permanenceDecision.termId, termId), eq(permanenceDecision.personId, personId)),
          )
          .for("update"),
      );
      const interrupted = applyDecisions(termId, nextTermId);
      void interrupted.catch(() => undefined);
      try {
        // La consecuencia ya confirmó en su transacción; la que marca espera las filas retenidas.
        await expect.poll(() => waitingOn(held.pid)).toBe(1);
        await db.execute(sql`
          select pg_cancel_backend(pid) from pg_stat_activity
          where datname = current_database() and ${held.pid} = any(pg_blocking_pids(pid))
        `);
        await expect(interrupted).rejects.toThrow();
      } finally {
        held.release();
        await Promise.allSettled([held.done, interrupted]);
      }
      // Murió donde se quería: la consecuencia está y ninguna decisión suya quedó marcada.
      const [member] = await db.select().from(membership).where(eq(membership.personId, personId));
      const conditions = await db
        .select({ committeeId: membershipTerm.committeeId })
        .from(membershipTerm)
        .where(
          and(
            eq(membershipTerm.personId, personId),
            eq(membershipTerm.termId, nextTermId),
            eq(membershipTerm.probation, true),
          ),
        );
      const left = await db
        .select({ committeeId: committeeMembership.committeeId })
        .from(committeeMembership)
        .where(
          and(
            eq(committeeMembership.personId, personId),
            eq(committeeMembership.termId, termId),
            sql`${committeeMembership.leftAt} is not null`,
          ),
        );
      expect({
        status: member?.status,
        probation: conditions.map((row) => row.committeeId),
        left: left.map((row) => row.committeeId),
      }).toEqual(
        {
          cumple: { status: "INACTIVE", probation: [], left: [a3] },
          prueba: { status: "ACTIVE", probation: [a3], left: [] },
          sale: { status: "ACTIVE", probation: [pixel], left: [a3] },
        }[victim],
      );
      const unmarked = await decisionsOf(personId, termId);
      expect(unmarked.length).toBeGreaterThan(0);
      expect(unmarked.every((row) => row.appliedAt === null)).toBe(true);
      // Se reanuda: lo que el poller hace al reintentar `permanence.closed`.
      expect(await applyDecisions(termId, nextTermId)).toBeGreaterThanOrEqual(unmarked.length);
    } else {
      expect(await applyDecisions(termId, nextTermId)).toBe(7);
    }
    expect(await applyDecisions(termId, nextTermId)).toBe(0);
    expect((await listClosingRows(termId)).summary).toMatchObject({ applied: 7, toApply: 7 });
    // Corren los handlers de todo lo emitido: correos, línea de tiempo y el `permanence.closed`.
    await drainOutbox();
    return footprint();
  }

  it.each([
    "cumple",
    "prueba",
    "sale",
  ] as const)("morir entre aplicar la consecuencia de «%s» y marcarla, y reanudar, deja lo mismo que aplicar de corrido", async (victim) => {
    const straight = await applyClosing(null);
    // La huella mira lo que importa: una auditoría de aplicación por persona y un evento por decisión.
    expect(straight.audits["permanence-decision.applied"]).toBe(3);
    expect(straight.audits["membership.ended"]).toBe(1);
    expect(straight.audits["committee-membership.left"]).toBe(1);
    expect(straight.audits["membership-term.set"]).toBe(2);
    expect(straight.events[permanenceDecided.type]).toBe(7);
    expect(Object.keys(straight.messages).length).toBeGreaterThan(0);
    await truncateAll();
    expect(await applyClosing(victim)).toEqual(straight);
  });
});
