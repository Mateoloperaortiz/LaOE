import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { type CommandContext, runCommand, type Tx } from "@/db/tx";
import { checkinApproved } from "@/domain-events/participation";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import {
  balanceFor,
  cancelOccasionAs,
  checkInSelfAs,
  closeOccasionAs,
  closeTermPointsAs,
  closingSummary,
  decideCheckInAs,
  decideManyAs,
  excuseCheckIn,
  findCheckIn,
  getTermStanding,
  grantBoosterAs,
  hostCheckInAs,
  listBoostersFor,
  listCheckIns,
  listParticipationsForPerson,
  loadGamificationSettings,
  setBoosterTargetAs,
} from "@/modules/participation";
import { decideCheckIn } from "@/modules/participation/domain/check-ins";
import { challenge, checkIn } from "@/modules/participation/schema";
import { anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import { person } from "@/modules/people/schema";
import { setConfigAs } from "@/modules/system";
import { outbox } from "@/modules/system/schema";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedChallenge, seedMember, seedOccasion, seedTerm } from "./factories";

// ADR-116 regla 1: dos decisiones a la vez sobre la misma asistencia se esperan. Toda transición de
// una asistencia que ya existe toma su fila con candado después del candado del término y valida
// contra lo que acaba de leer. Invariantes que estas pruebas afirman: hay puntos vivos si y solo si
// la asistencia está aprobada; una excusada no cambia de estado; el premio reservado y el reto
// presencial quedan como el estado final.

const POINTS = 10;
const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED", "EXCUSED"] as const;

/** El estado como lo nombra el error de transición (T-676). */
function notApplicable(status: (typeof STATUSES)[number]): string {
  return t("T-676", { estado: (tList("T-597")[STATUSES.indexOf(status)] ?? "").toLowerCase() });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Retiene en otra conexión las filas que `take` tome, hasta soltarlas. */
async function holdRows(take: (tx: Tx) => Promise<unknown>) {
  const ready = deferred<number>();
  const release = deferred<void>();
  const done = getDb().transaction(async (tx) => {
    await take(tx);
    const result = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    ready.resolve(result.rows[0]?.pid ?? 0);
    await release.promise;
  });
  void done.catch(ready.reject);
  return { pid: await ready.promise, release: () => release.resolve(), done };
}

/** Retiene la fila del término como la retiene el cierre de puntos (`for update`). */
function holdTerm(termId: string) {
  return holdRows((tx) =>
    tx.select({ id: term.id }).from(term).where(eq(term.id, termId)).for("update"),
  );
}

/** Retiene el reto presencial de la ocasión: quien decide una asistencia se detiene al llegar a él. */
function holdPresentialChallenge(occasionId: string) {
  return holdRows((tx) =>
    tx
      .select({ id: challenge.id })
      .from(challenge)
      .where(eq(challenge.occasionId, occasionId))
      .for("update"),
  );
}

/** Deja una decisión escrita y sin confirmar hasta soltarla: fija cuál de las dos entra primero. */
async function holdCommand(personId: string, command: (ctx: CommandContext) => Promise<unknown>) {
  const ready = deferred<number>();
  const release = deferred<void>();
  const done = runCommand({ personId, ip: null }, async (ctx) => {
    await command(ctx);
    const result = await ctx.tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
    ready.resolve(result.rows[0]?.pid ?? 0);
    await release.promise;
  });
  void done.catch(ready.reject);
  return { pid: await ready.promise, release: () => release.resolve(), done };
}

/** Cuántas conexiones esperan un candado de la transacción indicada, según PostgreSQL. */
async function waitingOn(pid: number): Promise<number> {
  const result = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and ${pid} = any(pg_blocking_pids(pid))
  `);
  return result.rows[0]?.n ?? 0;
}

/** Cuántas conexiones de esta base esperan un candado, de quien sea. */
async function waitingForLock(): Promise<number> {
  const result = await getDb().execute<{ n: number }>(sql`
    select count(*)::int as n from pg_stat_activity
    where datname = current_database() and wait_event_type = 'Lock'
  `);
  return result.rows[0]?.n ?? 0;
}

function outcome(result: PromiseSettledResult<unknown>): string {
  return result.status === "fulfilled" ? "ok" : (result.reason as Error).message;
}

async function setup() {
  const termId = await seedTerm();
  const first = await seedMember("gh.uno.decision@eafit.edu.co");
  const second = await seedMember("gh.dos.decision@eafit.edu.co");
  return { termId, admin: { personId: first, ip: null }, other: { personId: second, ip: null } };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

async function manualOccasion(f: Fixture) {
  return seedOccasion(f.termId, { title: "Taller de prueba", points: POINTS, approval: "MANUAL" });
}

/** Asistencia pendiente de un miembro nuevo en la ocasión, registrada por él mismo. */
async function pendingAttendance(occasion: { id: string; publicId: string }, email: string) {
  const personId = await seedMember(email);
  const attendance = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
  if (!attendance.ok || attendance.status !== "PENDING") {
    throw new Error("la asistencia no quedó pendiente");
  }
  return { personId, member: { personId, ip: null }, checkInId: attendance.checkInId, occasion };
}

async function requestExcuse(
  member: { personId: string; ip: null },
  occasionId: string,
): Promise<string> {
  const created = await createRequestAs(member, "EXCUSE", {
    occasionId,
    cause: "WORK",
    reason: "Turno que no se puede mover",
  });
  return created.id;
}

async function approvedEvents(): Promise<number> {
  const rows = await getDb()
    .select({ id: outbox.id })
    .from(outbox)
    .where(eq(outbox.eventType, checkinApproved.type));
  return rows.length;
}

/** Recálculos del puntaje de la ocasión que siguen pendientes en el outbox (`score:<ocasión>`). */
async function pendingScoreRecomputes(occasionId: string): Promise<number> {
  const rows = await getDb()
    .select({ id: outbox.id })
    .from(outbox)
    .where(and(eq(outbox.dedupeKey, `score:${occasionId}`), isNull(outbox.processedAt)));
  return rows.length;
}

describe("dos decisiones a la vez sobre la misma asistencia", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("aprobar mientras se acepta la excusa: gana la excusa y la aprobación recibe el error de transición", async () => {
    const f = await setup();
    await setConfigAs(f.admin, "gamification.enabled", true);
    const occasion = await manualOccasion(f);
    await seedChallenge(f.termId, {
      kind: "PRESENTIAL",
      occasionId: occasion.id,
      passPercent: null,
    });
    const personId = await seedMember("miembro.excusa.decision@eafit.edu.co");
    const booster = await grantBoosterAs(f.admin, {
      personId,
      termId: f.termId,
      kind: "PLUS_50",
      reason: "Premio de prueba",
    });
    await setBoosterTargetAs(
      { personId, ip: null },
      { boosterId: booster.id, target: { occasionId: occasion.id } },
    );
    const attendance = await checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId });
    if (!attendance.ok) throw new Error("la asistencia no se registró");
    expect((await closingSummary(f.termId)).reservedRewards).toBeGreaterThan(0);
    const requestId = await requestExcuse({ personId, ip: null }, occasion.id);

    const held = await holdTerm(f.termId);
    const approving = decideCheckInAs(f.admin, {
      checkInId: attendance.checkInId,
      decision: "APPROVE",
    });
    void approving.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      // La excusa no toma el candado de puntos (ADR-116 regla 3): entra aunque el término esté retenido.
      await decideRequestAs(f.other, requestId, { decision: "APPROVED" });
      held.release();
      await held.done;
      await expect(approving).rejects.toThrow(notApplicable("EXCUSED"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, approving]);
    }

    expect((await findCheckIn(occasion.id, personId))?.status).toBe("EXCUSED");
    expect(await balanceFor(personId, f.termId)).toBe(0);
    expect(await closingSummary(f.termId)).toMatchObject({
      pendingCheckIns: 0,
      pendingParticipations: 0,
      reservedRewards: 0,
    });
    expect(await listBoostersFor(personId)).toEqual([
      expect.objectContaining({ id: booster.id, state: "AVAILABLE" }),
    ]);
    expect(await listParticipationsForPerson(personId)).toEqual([
      expect.objectContaining({ status: "REJECTED" }),
    ]);
    expect(await approvedEvents()).toBe(0);
  });

  it("aceptar la excusa de una asistencia que otro está aprobando espera y recibe que ya tiene asistencia", async () => {
    const f = await setup();
    const a = await pendingAttendance(
      await manualOccasion(f),
      "miembro.tarde.decision@eafit.edu.co",
    );
    const requestId = await requestExcuse(a.member, a.occasion.id);
    const settings = await loadGamificationSettings();
    const held = await holdCommand(f.admin.personId, (ctx) =>
      decideCheckIn(ctx, { checkInId: a.checkInId, decision: "APPROVE" }, { settings }),
    );
    const excusing = decideRequestAs(f.other, requestId, { decision: "APPROVED" });
    void excusing.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(excusing).rejects.toThrow(t("T-2223"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, excusing]);
    }
    expect((await findCheckIn(a.occasion.id, a.personId))?.status).toBe("APPROVED");
    expect(await balanceFor(a.personId, f.termId)).toBe(POINTS);
  });

  it("aprobar y rechazar a la vez desde la fila, veinte veces: gana la primera, la otra recibe el error de transición y nunca quedan puntos vivos sin aprobación", async () => {
    const f = await setup();
    const occasion = await manualOccasion(f);
    for (let round = 0; round < 20; round += 1) {
      const a = await pendingAttendance(occasion, `miembro.ronda${round}.decision@eafit.edu.co`);
      // Las dos personas deciden desde la fila que veían pendiente, como lo manda la consola.
      const approve = () =>
        decideCheckInAs(f.admin, {
          checkInId: a.checkInId,
          decision: "APPROVE",
          seenStatus: "PENDING",
        });
      const reject = () =>
        decideCheckInAs(f.other, {
          checkInId: a.checkInId,
          decision: "REJECT",
          seenStatus: "PENDING",
        });
      const held = await holdTerm(f.termId);
      // Se alterna quién llega primero a la cola del candado: el orden de salida no se puede forzar.
      const pair = round % 2 === 0 ? [approve(), reject()] : [reject(), approve()];
      const settled = Promise.allSettled(pair);
      try {
        await expect.poll(() => waitingOn(held.pid)).toBe(2);
      } finally {
        held.release();
        await held.done;
      }
      const results = await settled;
      const [approved, rejected] = round % 2 === 0 ? results : [results[1], results[0]];
      const status = (await findCheckIn(occasion.id, a.personId))?.status;
      const points = await balanceFor(a.personId, f.termId);
      const seen = { round, status, points };
      expect({ ...seen, live: points > 0 }).toEqual({ ...seen, live: status === "APPROVED" });
      // Reaprobar un rechazo es válido (ADR-035 regla 6), pero no para quien lo veía pendiente: la que
      // llega segunda no aplica sobre lo que dejó la primera, sea la aprobación o el rechazo.
      const approval = approved ? outcome(approved) : "";
      const rejection = rejected ? outcome(rejected) : "";
      const winner = approval === "ok" ? "APPROVED" : "REJECTED";
      expect({ round, approval, rejection }).toEqual(
        winner === "APPROVED"
          ? { round, approval: "ok", rejection: notApplicable("APPROVED") }
          : { round, approval: notApplicable("REJECTED"), rejection: "ok" },
      );
      expect(seen).toEqual({ round, status: winner, points: winner === "APPROVED" ? POINTS : 0 });
    }
  });

  it("aprobar desde su fila una pendiente que otro está rechazando espera y recibe el error de transición: no la reaprueba", async () => {
    const f = await setup();
    const a = await pendingAttendance(
      await manualOccasion(f),
      "miembro.rechazo.decision@eafit.edu.co",
    );
    const settings = await loadGamificationSettings();
    const held = await holdCommand(f.other.personId, (ctx) =>
      decideCheckIn(ctx, { checkInId: a.checkInId, decision: "REJECT" }, { settings }),
    );
    const approving = decideCheckInAs(f.admin, {
      checkInId: a.checkInId,
      decision: "APPROVE",
      seenStatus: "PENDING",
    });
    void approving.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(approving).rejects.toThrow(notApplicable("REJECTED"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, approving]);
    }
    expect((await findCheckIn(a.occasion.id, a.personId))?.status).toBe("REJECTED");
    expect(await balanceFor(a.personId, f.termId)).toBe(0);
    expect(await approvedEvents()).toBe(0);

    // Quien ve el rechazo en su fila sí lo puede corregir (ADR-035 regla 6).
    await decideCheckInAs(f.admin, {
      checkInId: a.checkInId,
      decision: "APPROVE",
      seenStatus: "REJECTED",
    });
    expect((await findCheckIn(a.occasion.id, a.personId))?.status).toBe("APPROVED");
    expect(await balanceFor(a.personId, f.termId)).toBe(POINTS);
  });

  it("rechazar una asistencia que otro está aprobando espera y recibe el error de transición", async () => {
    const f = await setup();
    const a = await pendingAttendance(
      await manualOccasion(f),
      "miembro.orden.decision@eafit.edu.co",
    );
    const settings = await loadGamificationSettings();
    const held = await holdCommand(f.admin.personId, (ctx) =>
      decideCheckIn(ctx, { checkInId: a.checkInId, decision: "APPROVE" }, { settings }),
    );
    const rejecting = decideCheckInAs(f.other, { checkInId: a.checkInId, decision: "REJECT" });
    void rejecting.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(rejecting).rejects.toThrow(notApplicable("APPROVED"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, rejecting]);
    }
    expect((await findCheckIn(a.occasion.id, a.personId))?.status).toBe("APPROVED");
    expect(await balanceFor(a.personId, f.termId)).toBe(POINTS);
  });

  it("aprobar dos veces desde dos actores: una sola aprobación, un crédito y un aviso", async () => {
    const f = await setup();
    const a = await pendingAttendance(
      await manualOccasion(f),
      "miembro.doble.decision@eafit.edu.co",
    );
    const held = await holdTerm(f.termId);
    const settled = Promise.allSettled([
      decideCheckInAs(f.admin, { checkInId: a.checkInId, decision: "APPROVE" }),
      decideCheckInAs(f.other, { checkInId: a.checkInId, decision: "APPROVE" }),
    ]);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(2);
    } finally {
      held.release();
      await held.done;
    }
    expect((await settled).map(outcome).sort()).toEqual(["ok", notApplicable("APPROVED")].sort());
    expect((await findCheckIn(a.occasion.id, a.personId))?.status).toBe("APPROVED");
    expect(await balanceFor(a.personId, f.termId)).toBe(POINTS);
    expect(await approvedEvents()).toBe(1);
  });

  it("«Aprobar todos» aprueba y acredita cada pendiente", async () => {
    const f = await setup();
    const occasion = await manualOccasion(f);
    const one = await pendingAttendance(occasion, "miembro.lote1.decision@eafit.edu.co");
    const two = await pendingAttendance(occasion, "miembro.lote2.decision@eafit.edu.co");
    const listed = (await listCheckIns(occasion.id, ["PENDING"])).map((item) => item.id);
    expect(await decideManyAs(f.admin, listed, "APPROVE")).toBe(2);
    expect(await listCheckIns(occasion.id, ["APPROVED"])).toHaveLength(2);
    expect(await balanceFor(one.personId, f.termId)).toBe(POINTS);
    expect(await balanceFor(two.personId, f.termId)).toBe(POINTS);
    expect(await approvedEvents()).toBe(2);
  });

  it("«Aprobar todos» decide lo que sigue pendiente: no reaprueba la asistencia que otro rechazó después de listarla y aprueba las demás", async () => {
    const f = await setup();
    const occasion = await manualOccasion(f);
    const one = await pendingAttendance(occasion, "miembro.lote3.decision@eafit.edu.co");
    const two = await pendingAttendance(occasion, "miembro.lote4.decision@eafit.edu.co");
    // La consola lista los pendientes antes de abrir la transacción del lote.
    const listed = (await listCheckIns(occasion.id, ["PENDING"])).map((item) => item.id);
    await decideCheckInAs(f.other, { checkInId: two.checkInId, decision: "REJECT" });

    // Con las filas tomadas decide cuáles siguen pendientes (ADR-116 regla 4) y dice cuántas decidió.
    expect(await decideManyAs(f.admin, listed, "APPROVE")).toBe(1);

    expect((await findCheckIn(occasion.id, two.personId))?.status).toBe("REJECTED");
    expect((await findCheckIn(occasion.id, one.personId))?.status).toBe("APPROVED");
    expect(await balanceFor(one.personId, f.termId)).toBe(POINTS);
    expect(await balanceFor(two.personId, f.termId)).toBe(0);
    expect(await approvedEvents()).toBe(1);
  });

  it("«Aprobar todos» espera a quien está aprobando una de su lista desde la fila y aprueba las demás", async () => {
    const f = await setup();
    const occasion = await manualOccasion(f);
    const one = await pendingAttendance(occasion, "miembro.lote7.decision@eafit.edu.co");
    const two = await pendingAttendance(occasion, "miembro.lote8.decision@eafit.edu.co");
    const settings = await loadGamificationSettings();
    const held = await holdCommand(f.other.personId, (ctx) =>
      decideCheckIn(ctx, { checkInId: one.checkInId, decision: "APPROVE" }, { settings }),
    );
    const batch = decideManyAs(f.admin, [one.checkInId, two.checkInId], "APPROVE");
    void batch.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      // La aprobación individual no tumba el lote: esa ya no está pendiente y decide la otra.
      expect(await batch).toBe(1);
    } finally {
      held.release();
      await Promise.allSettled([held.done, batch]);
    }
    expect(await listCheckIns(occasion.id, ["APPROVED"])).toHaveLength(2);
    expect(await balanceFor(one.personId, f.termId)).toBe(POINTS);
    expect(await balanceFor(two.personId, f.termId)).toBe(POINTS);
    expect(await approvedEvents()).toBe(2);
  });

  it("«Aprobar todos» decide una sola vez la asistencia que llega repetida en la lista", async () => {
    const f = await setup();
    const occasion = await manualOccasion(f);
    const one = await pendingAttendance(occasion, "miembro.lote9.decision@eafit.edu.co");

    expect(
      await decideManyAs(f.admin, [one.checkInId, one.checkInId, one.checkInId], "APPROVE"),
    ).toBe(1);

    expect((await findCheckIn(occasion.id, one.personId))?.status).toBe("APPROVED");
    expect(await balanceFor(one.personId, f.termId)).toBe(POINTS);
    expect(await approvedEvents()).toBe(1);
  });

  it("«Aprobar todos» con una asistencia que no existe responde que no existe y no aprueba ninguna", async () => {
    const f = await setup();
    const occasion = await manualOccasion(f);
    const one = await pendingAttendance(occasion, "miembro.lote10.decision@eafit.edu.co");

    await expect(
      decideManyAs(f.admin, [one.checkInId, "asistencia-que-no-existe"], "APPROVE"),
    ).rejects.toThrow(t("T-032"));

    expect((await findCheckIn(occasion.id, one.personId))?.status).toBe("PENDING");
    expect(await balanceFor(one.personId, f.termId)).toBe(0);
    expect(await approvedEvents()).toBe(0);
  });

  it("«Aprobar todos» toma todas sus asistencias antes de decidir ninguna: quien aprueba una del lote desde su fila espera y recibe el error de transición", async () => {
    // Al aprobar la primera, el lote encola el recálculo del puntaje de la ocasión, que admite un
    // solo pendiente (`score:<ocasión>`). Si tomara la fila de la segunda después, quien la aprueba
    // desde su fila tendría la fila y esperaría esa clave, el lote tendría la clave y esperaría la
    // fila, y PostgreSQL cortaría a uno con un error sin traducir (ADR-116 regla 2).
    const f = await setup();
    const occasion = await manualOccasion(f);
    await seedChallenge(f.termId, {
      kind: "PRESENTIAL",
      occasionId: occasion.id,
      passPercent: null,
    });
    const one = await pendingAttendance(occasion, "miembro.lote5.decision@eafit.edu.co");
    const two = await pendingAttendance(occasion, "miembro.lote6.decision@eafit.edu.co");
    // El lote las decide en el orden de `id` de la base, llegue la lista como llegue.
    const ordered = await getDb()
      .select({ id: checkIn.id })
      .from(checkIn)
      .where(eq(checkIn.occasionId, occasion.id))
      .orderBy(asc(checkIn.id));
    const last = ordered[1]?.id ?? "";
    // Con el reto retenido, el lote se detiene después de aprobar la primera y encolar el recálculo.
    const held = await holdPresentialChallenge(occasion.id);
    const batch = decideManyAs(f.admin, [two.checkInId, one.checkInId], "APPROVE");
    void batch.catch(() => undefined);
    let single: Promise<void> = Promise.resolve();
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      single = decideCheckInAs(f.other, { checkInId: last, decision: "APPROVE" });
      void single.catch(() => undefined);
      await expect.poll(waitingForLock).toBe(2);
      held.release();
      await held.done;
      expect(await batch).toBe(2);
      await expect(single).rejects.toThrow(notApplicable("APPROVED"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, batch, single]);
    }
    expect(await listCheckIns(occasion.id, ["APPROVED"])).toHaveLength(2);
    expect(await balanceFor(one.personId, f.termId)).toBe(POINTS);
    expect(await balanceFor(two.personId, f.termId)).toBe(POINTS);
    expect(await approvedEvents()).toBe(2);
  });

  it("el registro del organizador no reaprueba un rechazo que se está excusando", async () => {
    const f = await setup();
    const a = await pendingAttendance(
      await manualOccasion(f),
      "miembro.puerta.decision@eafit.edu.co",
    );
    await decideCheckInAs(f.admin, { checkInId: a.checkInId, decision: "REJECT" });
    const settings = await loadGamificationSettings();
    const held = await holdCommand(f.other.personId, (ctx) =>
      excuseCheckIn(
        ctx,
        { occasionId: a.occasion.id, personId: a.personId, reason: "Motivo sintético" },
        { settings },
      ),
    );
    const registering = hostCheckInAs(f.admin, {
      occasionId: a.occasion.id,
      personId: a.personId,
      personName: "Persona sintética",
      source: "ADMIN",
    });
    void registering.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(registering).rejects.toThrow(t("T-601", { nombre: "Persona sintética" }));
    } finally {
      held.release();
      await Promise.allSettled([held.done, registering]);
    }
    expect((await findCheckIn(a.occasion.id, a.personId))?.status).toBe("EXCUSED");
    expect(await balanceFor(a.personId, f.termId)).toBe(0);
  });

  it("cancelar la ocasión mientras se aprueba una asistencia revierte el crédito que acaba de nacer", async () => {
    const f = await setup();
    const a = await pendingAttendance(
      await manualOccasion(f),
      "miembro.cancela.decision@eafit.edu.co",
    );
    const settings = await loadGamificationSettings();
    const held = await holdCommand(f.admin.personId, (ctx) =>
      decideCheckIn(ctx, { checkInId: a.checkInId, decision: "APPROVE" }, { settings }),
    );
    const cancelling = cancelOccasionAs(f.other, a.occasion.id, "Cancelación sintética");
    void cancelling.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      expect(await cancelling).toEqual({ cancelledCheckIns: 1 });
    } finally {
      held.release();
      await Promise.allSettled([held.done, cancelling]);
    }
    expect((await findCheckIn(a.occasion.id, a.personId))?.status).toBe("CANCELLED");
    expect(await balanceFor(a.personId, f.termId)).toBe(0);
  });

  it("cancelar la ocasión mientras se reaprueba un rechazo espera y anula lo que quedó aprobado", async () => {
    // El rechazo no estaba pendiente ni aprobado cuando la cancelación miró: por eso toma todas las
    // asistencias de la ocasión y filtra con la fila retenida.
    const f = await setup();
    const a = await pendingAttendance(
      await manualOccasion(f),
      "miembro.vuelve.decision@eafit.edu.co",
    );
    await decideCheckInAs(f.admin, { checkInId: a.checkInId, decision: "REJECT" });
    const settings = await loadGamificationSettings();
    const held = await holdCommand(f.admin.personId, (ctx) =>
      decideCheckIn(ctx, { checkInId: a.checkInId, decision: "APPROVE" }, { settings }),
    );
    const cancelling = cancelOccasionAs(f.other, a.occasion.id, "Cancelación sintética");
    void cancelling.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      expect(await cancelling).toEqual({ cancelledCheckIns: 1 });
    } finally {
      held.release();
      await Promise.allSettled([held.done, cancelling]);
    }
    expect((await findCheckIn(a.occasion.id, a.personId))?.status).toBe("CANCELLED");
    expect(await balanceFor(a.personId, f.termId)).toBe(0);
  });

  it("cancelar la ocasión encola el recálculo de su puntaje junto con las anulaciones", async () => {
    // La cancelación lo encola apenas toma sus asistencias, en el lugar del orden de candados de
    // ADR-116 regla 2, y no al final.
    const f = await setup();
    const occasion = await seedOccasion(f.termId, { points: POINTS, approval: "AUTO" });
    const personId = await seedMember("miembro.recalculo.decision@eafit.edu.co");
    await hostCheckInAs(f.admin, {
      occasionId: occasion.id,
      personId,
      personName: "Persona sintética",
      source: "ADMIN",
    });
    // El recálculo que encoló la aprobación ya corrió: el de la cancelación es otro.
    await drainOutbox();
    expect(await pendingScoreRecomputes(occasion.id)).toBe(0);

    expect(await cancelOccasionAs(f.other, occasion.id, "Cancelación sintética")).toEqual({
      cancelledCheckIns: 1,
    });

    expect(await pendingScoreRecomputes(occasion.id)).toBe(1);
    expect(await balanceFor(personId, f.termId)).toBe(0);
  });

  it("con la excusa esperando la asistencia y una anonimización en cola, quien decide todavía referencia a la persona", async () => {
    // Orden de candados (ADR-116 regla 2): la excusa toma a la persona y después la asistencia; una
    // decisión toma la asistencia y llega a la persona solo por las claves foráneas de lo que
    // escribe. No se cruzan: esa referencia no hace cola detrás de la anonimización que espera.
    const f = await setup();
    const a = await pendingAttendance(
      await manualOccasion(f),
      "miembro.sale.decision@eafit.edu.co",
    );
    const requestId = await requestExcuse(a.member, a.occasion.id);
    await requestDeletionAs(a.member);
    let excusing: Promise<void> = Promise.resolve();
    let anonymizing: Promise<void> = Promise.resolve();
    await getDb().transaction(async (deciding) => {
      await deciding
        .select({ id: checkIn.id })
        .from(checkIn)
        .where(eq(checkIn.id, a.checkInId))
        .for("no key update");
      excusing = decideRequestAs(f.other, requestId, { decision: "APPROVED" });
      await expect.poll(waitingForLock).toBe(1);
      anonymizing = anonymizePersonAs(f.admin, a.personId);
      await expect.poll(waitingForLock).toBe(2);
      await deciding.execute(sql`set local lock_timeout = '2s'`);
      await deciding
        .select({ id: person.id })
        .from(person)
        .where(eq(person.id, a.personId))
        .for("key share");
    });
    await Promise.all([excusing, anonymizing]);
    expect(await findCheckIn(a.occasion.id, a.personId)).toMatchObject({ status: "EXCUSED" });
  });

  it("el registro propio y el del organizador a la vez dejan una sola asistencia y un solo crédito", async () => {
    const f = await setup();
    const occasion = await seedOccasion(f.termId, { points: POINTS, approval: "AUTO" });
    const personId = await seedMember("miembro.puerta2.decision@eafit.edu.co");
    const held = await holdTerm(f.termId);
    const settled = Promise.allSettled([
      checkInSelfAs({ personId, ip: null }, { publicId: occasion.publicId }),
      hostCheckInAs(f.admin, {
        occasionId: occasion.id,
        personId,
        personName: "Persona sintética",
        source: "HOST",
      }),
    ]);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(2);
    } finally {
      held.release();
      await held.done;
    }
    const [own, host] = await settled;
    // El índice único decide: o entró el propio y el organizador recibe que ya estaba, o al revés.
    const ownWon = own?.status === "fulfilled" && (own.value as { ok: boolean }).ok;
    if (ownWon) {
      expect(host && outcome(host)).toBe(t("T-601", { nombre: "Persona sintética" }));
    } else {
      expect(host?.status).toBe("fulfilled");
      expect(own).toMatchObject({ status: "fulfilled", value: { ok: false, reason: "ALREADY" } });
    }
    expect(await listCheckIns(occasion.id)).toEqual([
      expect.objectContaining({ personId, status: "APPROVED" }),
    ]);
    expect(await balanceFor(personId, f.termId)).toBe(POINTS);
    expect(await approvedEvents()).toBe(1);
  });

  it("la excusa se acepta con los puntos del término ya cerrados y no toca lo que el cierre congeló", async () => {
    const f = await setup();
    const occasion = await manualOccasion(f);
    const a = await pendingAttendance(occasion, "miembro.cierre.decision@eafit.edu.co");
    const present = await seedMember("miembro.presente.decision@eafit.edu.co");
    await hostCheckInAs(f.admin, {
      occasionId: occasion.id,
      personId: present,
      personName: "Persona sintética",
      source: "ADMIN",
    });
    const requestId = await requestExcuse(a.member, occasion.id);
    await closeOccasionAs(f.admin, occasion.id);
    await closeTermPointsAs(f.admin, f.termId);
    const frozen = await getTermStanding(f.termId);
    const summary = await closingSummary(f.termId);
    expect(frozen?.stats).toMatchObject({ checkIns: 1, pointsAwarded: POINTS });

    await decideRequestAs(f.other, requestId, { decision: "APPROVED" });

    expect((await findCheckIn(occasion.id, a.personId))?.status).toBe("EXCUSED");
    expect(await getTermStanding(f.termId)).toEqual(frozen);
    expect(await closingSummary(f.termId)).toEqual({ ...summary, pendingCheckIns: 0 });
    expect(await balanceFor(a.personId, f.termId)).toBe(0);
    // Aprobar sí escribe en el ledger, así que sigue cerrado para la asistencia ya excusada.
    await expect(
      decideCheckInAs(f.admin, { checkInId: a.checkInId, decision: "APPROVE" }),
    ).rejects.toThrow(t("T-629"));
  });
});
