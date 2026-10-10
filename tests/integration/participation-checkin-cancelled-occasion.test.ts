import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import {
  balanceFor,
  cancelOccasionAs,
  checkInSelfAs,
  closeOccasionAs,
  decideCheckInAs,
  findCheckIn,
  hostCheckInAs,
} from "@/modules/participation";
import { OCCASION_STATUSES } from "@/modules/participation/domain/occasion-pure";
import { challenge } from "@/modules/participation/schema";
import { t, tList } from "@/shared/copy";
import { holdTransaction, waitingForLock, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";
import { seedChallenge, seedMember, seedOccasion, seedTerm } from "./factories";

// ADR-119 regla 1 (DT-161): una asistencia no nace ni se reaprueba en una ocasión cancelada. Crear y
// decidir leen el estado de la ocasión con su fila tomada, después del término: la cancelación que va
// en curso se espera y se encuentra ya hecha.

const POINTS = 10;
const NAME = "Persona Sintética";

/** La ocasión cancelada como la nombra el error de transición (T-578). */
const cancelled = t("T-578", {
  estado: (tList("T-568")[OCCASION_STATUSES.indexOf("CANCELLED")] ?? "").toLowerCase(),
});

async function setup(approval: "AUTO" | "MANUAL") {
  const termId = await seedTerm();
  const admin = { personId: await seedMember("gh.uno.cancelada@eafit.edu.co"), ip: null };
  const other = { personId: await seedMember("gh.dos.cancelada@eafit.edu.co"), ip: null };
  const occasion = await seedOccasion(termId, { points: POINTS, approval });
  await seedChallenge(termId, { kind: "PRESENTIAL", occasionId: occasion.id, passPercent: null });
  return { termId, admin, other, occasion };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

/**
 * Deja una cancelación a medias: la ocasión ya está cancelada dentro de su transacción y todas sus
 * asistencias tomadas, y espera el reto presencial, que la prueba retiene. Hace falta una asistencia
 * viva para que la cancelación llegue hasta el reto: la de un testigo.
 */
async function cancellationInProgress(f: Fixture) {
  const witnessId = await seedMember("testigo.cancelada@eafit.edu.co");
  await hostCheckInAs(f.admin, {
    occasionId: f.occasion.id,
    personId: witnessId,
    personName: NAME,
    source: "HOST",
  });
  const held = await holdTransaction((tx) =>
    tx
      .select({ id: challenge.id })
      .from(challenge)
      .where(eq(challenge.occasionId, f.occasion.id))
      .for("update"),
  );
  const cancellation = cancelOccasionAs(f.other, f.occasion.id, "Cancelación sintética");
  void cancellation.catch(() => undefined);
  try {
    await expect.poll(() => waitingOn(held.pid)).toBe(1);
  } catch (error) {
    held.release();
    await Promise.allSettled([held.done, cancellation]);
    throw error;
  }
  return { held, cancellation };
}

/** Espera a que la solicitud haga cola detrás de la cancelación, o a que termine sin esperarla. */
async function queuedOrDone(request: Promise<unknown>): Promise<void> {
  let done = false;
  const finish = () => {
    done = true;
  };
  void request.then(finish, finish);
  await expect.poll(async () => done || (await waitingForLock()) === 2).toBe(true);
}

async function rejectedAttendance(f: Fixture, email: string) {
  const personId = await seedMember(email);
  const attendance = await checkInSelfAs({ personId, ip: null }, { publicId: f.occasion.publicId });
  if (!attendance.ok) throw new Error("la asistencia no se registró");
  await decideCheckInAs(f.admin, { checkInId: attendance.checkInId, decision: "REJECT" });
  return { personId, checkInId: attendance.checkInId };
}

describe("una asistencia en una ocasión cancelada", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("registrarse mientras la ocasión se cancela espera y recibe que está cancelada: no nace una asistencia", async () => {
    const f = await setup("AUTO");
    const personId = await seedMember("miembro.llega.cancelada@eafit.edu.co");
    const { held, cancellation } = await cancellationInProgress(f);
    const registering = checkInSelfAs({ personId, ip: null }, { publicId: f.occasion.publicId });
    void registering.catch(() => undefined);
    try {
      await queuedOrDone(registering);
    } finally {
      held.release();
      await Promise.allSettled([held.done, cancellation]);
    }

    expect(await registering).toEqual({ ok: false, reason: "CANCELLED" });
    expect(await findCheckIn(f.occasion.id, personId)).toBeNull();
    expect(await balanceFor(personId, f.termId)).toBe(0);
  });

  it("el organizador que registra mientras la ocasión se cancela espera y recibe que no está abierta", async () => {
    const f = await setup("AUTO");
    const personId = await seedMember("miembro.puerta.cancelada@eafit.edu.co");
    const { held, cancellation } = await cancellationInProgress(f);
    const registering = hostCheckInAs(f.admin, {
      occasionId: f.occasion.id,
      personId,
      personName: NAME,
      source: "HOST",
    });
    void registering.catch(() => undefined);
    try {
      await queuedOrDone(registering);
    } finally {
      held.release();
      await Promise.allSettled([held.done, cancellation]);
    }

    await expect(registering).rejects.toThrow(t("T-620"));
    expect(await findCheckIn(f.occasion.id, personId)).toBeNull();
    expect(await balanceFor(personId, f.termId)).toBe(0);
  });

  // DT-269: la consola respondía T-578 con el valor del enum («la ocasión está CANCELLED»).
  it("la consola que registra en una ocasión cancelada recibe su estado como lo nombra la interfaz", async () => {
    const f = await setup("AUTO");
    const personId = await seedMember("miembro.consola.cancelada@eafit.edu.co");
    await cancelOccasionAs(f.other, f.occasion.id, "Cancelación sintética");

    await expect(
      hostCheckInAs(f.admin, {
        occasionId: f.occasion.id,
        personId,
        personName: NAME,
        source: "ADMIN",
      }),
    ).rejects.toThrow(cancelled);
    expect(await findCheckIn(f.occasion.id, personId)).toBeNull();
  });

  it("un rechazo de una ocasión ya cancelada no se reaprueba ni acredita", async () => {
    const f = await setup("MANUAL");
    const a = await rejectedAttendance(f, "miembro.rechazo.cancelada@eafit.edu.co");
    await cancelOccasionAs(f.other, f.occasion.id, "Cancelación sintética");

    await expect(
      decideCheckInAs(f.admin, {
        checkInId: a.checkInId,
        decision: "APPROVE",
        seenStatus: "REJECTED",
      }),
    ).rejects.toThrow(cancelled);

    expect((await findCheckIn(f.occasion.id, a.personId))?.status).toBe("REJECTED");
    expect(await balanceFor(a.personId, f.termId)).toBe(0);
  });

  it("reaprobar un rechazo mientras la ocasión se cancela espera y recibe que está cancelada", async () => {
    const f = await setup("MANUAL");
    const a = await rejectedAttendance(f, "miembro.vuelve.cancelada@eafit.edu.co");
    const { held, cancellation } = await cancellationInProgress(f);
    const approving = decideCheckInAs(f.admin, {
      checkInId: a.checkInId,
      decision: "APPROVE",
      seenStatus: "REJECTED",
    });
    void approving.catch(() => undefined);
    try {
      await queuedOrDone(approving);
    } finally {
      held.release();
      await Promise.allSettled([held.done, cancellation]);
    }

    await expect(approving).rejects.toThrow(cancelled);
    expect((await findCheckIn(f.occasion.id, a.personId))?.status).toBe("REJECTED");
    expect(await balanceFor(a.personId, f.termId)).toBe(0);
  });

  it("una pendiente de una ocasión cerrada se sigue aprobando: la regla es de la cancelada", async () => {
    const f = await setup("MANUAL");
    const personId = await seedMember("miembro.cerrada.cancelada@eafit.edu.co");
    const attendance = await checkInSelfAs(
      { personId, ip: null },
      { publicId: f.occasion.publicId },
    );
    if (!attendance.ok) throw new Error("la asistencia no se registró");
    await closeOccasionAs(f.admin, f.occasion.id);

    await decideCheckInAs(f.admin, { checkInId: attendance.checkInId, decision: "APPROVE" });

    expect((await findCheckIn(f.occasion.id, personId))?.status).toBe("APPROVED");
    expect(await balanceFor(personId, f.termId)).toBe(POINTS);
  });
});
