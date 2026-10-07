import { inArray } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { createRequestAs, decideRequestAs, listInteractions } from "@/modules/crm";
import {
  checkInSelfAs,
  closeOccasionAs,
  closeTermPointsAs,
  closingSummary,
  decideCheckInAs,
  findCheckIn,
  grantBoosterAs,
  listBoostersFor,
  listParticipationsForPerson,
  setBoosterTargetAs,
} from "@/modules/participation";
import { setConfigAs } from "@/modules/system";
import { auditLog } from "@/modules/system/schema";
import { t, tList } from "@/shared/copy";
import { fillCopy } from "@/shared/copy/format";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedChallenge, seedMember, seedOccasion, seedTerm } from "./factories";

// Una excusa aceptada (ADR-060 regla 5) cierra una asistencia pendiente sin aprobarla. Con el premio
// que esa asistencia tenía reservado hace lo mismo que un rechazo (ADR-067 regla 3): lo libera, y el
// semestre se puede cerrar después (ADR-067 regla 13).

const OCCASION = "Integración de prueba";
const EXCUSE_REASON = "Turno que no se puede mover";

async function setup() {
  const termId = await seedTerm();
  const gh = await seedMember("gh.excusa.premio@eafit.edu.co");
  const personId = await seedMember("miembro.excusa.premio@eafit.edu.co");
  await setConfigAs({ personId: gh }, "gamification.enabled", true);
  return { termId, personId, admin: { personId: gh }, member: { personId } };
}

type Fixture = Awaited<ReturnType<typeof setup>>;

/** Asistencia pendiente con un booster apuntado: el extra del booster queda reservado. */
async function pendingAttendanceWithBooster() {
  const f = await setup();
  const occasion = await seedOccasion(f.termId, {
    title: OCCASION,
    points: 10,
    approval: "MANUAL",
  });
  const booster = await grantBoosterAs(f.admin, {
    personId: f.personId,
    termId: f.termId,
    kind: "PLUS_50",
    reason: "Premio de prueba",
  });
  await setBoosterTargetAs(f.member, {
    boosterId: booster.id,
    target: { occasionId: occasion.id },
  });
  const attendance = await checkInSelfAs(f.member, { publicId: occasion.publicId });
  if (!attendance.ok) throw new Error("la asistencia no se registró");
  return { ...f, occasion, boosterId: booster.id, checkInId: attendance.checkInId };
}

async function approveExcuse(f: Fixture, occasionId: string): Promise<void> {
  const created = await createRequestAs(f.member, "EXCUSE", {
    occasionId,
    cause: "WORK",
    reason: EXCUSE_REASON,
  });
  await decideRequestAs(f.admin, created.id, { decision: "APPROVED" });
}

async function auditOf(actions: string[]) {
  return getDb()
    .select({ action: auditLog.action, before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .where(inArray(auditLog.action, actions));
}

describe("excusa sobre una asistencia pendiente con premio reservado", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("libera el premio reservado y el booster vuelve a quedar disponible", async () => {
    const f = await pendingAttendanceWithBooster();
    expect(await closingSummary(f.termId)).toMatchObject({
      pendingCheckIns: 1,
      reservedRewards: 1,
    });
    expect(await listBoostersFor(f.personId)).toEqual([
      expect.objectContaining({ id: f.boosterId, state: "RESERVED" }),
    ]);

    await approveExcuse(f, f.occasion.id);

    expect((await findCheckIn(f.occasion.id, f.personId))?.status).toBe("EXCUSED");
    expect(await closingSummary(f.termId)).toMatchObject({
      pendingCheckIns: 0,
      reservedRewards: 0,
    });
    expect(await listBoostersFor(f.personId)).toEqual([
      expect.objectContaining({ id: f.boosterId, state: "AVAILABLE", target: null }),
    ]);
  });

  it("deja cerrar el semestre: la reserva ya no lo bloquea", async () => {
    const f = await pendingAttendanceWithBooster();
    await approveExcuse(f, f.occasion.id);
    await closeOccasionAs(f.admin, f.occasion.id);

    await expect(closeTermPointsAs(f.admin, f.termId)).resolves.toEqual({
      id: expect.any(String),
    });
    await drainOutbox();
  });

  it("audita la liberación con el estado de la asistencia, sin copiar el motivo de la persona", async () => {
    const f = await pendingAttendanceWithBooster();
    await approveExcuse(f, f.occasion.id);

    const released = await auditOf(["reward.released"]);
    expect(released).toEqual([
      {
        action: "reward.released",
        before: { status: "RESERVED" },
        after: { status: "RELEASED", reason: tList("T-597")[4] },
      },
    ]);
  });

  it("conserva la auditoría y la línea de tiempo de la excusa", async () => {
    const f = await pendingAttendanceWithBooster();
    await approveExcuse(f, f.occasion.id);
    await drainOutbox();

    const [excused] = await auditOf(["checkin.excused"]);
    expect(excused?.before).toEqual({ status: "PENDING" });
    expect(excused?.after).toMatchObject({ status: "EXCUSED" });
    expect(JSON.stringify(excused?.after)).toContain(EXCUSE_REASON);
    const timeline = await listInteractions(f.personId, "PARTICIPATION");
    expect(timeline.map((item) => item.summary)).toContain(
      fillCopy(tList("T-667")[7], { ocasion: OCCASION }),
    );
  });

  it("no vuelve a tocar el premio de una asistencia que ya estaba rechazada", async () => {
    const f = await pendingAttendanceWithBooster();
    await decideCheckInAs(f.admin, {
      checkInId: f.checkInId,
      decision: "REJECT",
      reason: "No asistió",
    });

    await approveExcuse(f, f.occasion.id);

    expect((await findCheckIn(f.occasion.id, f.personId))?.status).toBe("EXCUSED");
    expect(await closingSummary(f.termId)).toMatchObject({
      pendingCheckIns: 0,
      reservedRewards: 0,
    });
    expect(await listBoostersFor(f.personId)).toEqual([
      expect.objectContaining({ id: f.boosterId, state: "AVAILABLE", target: null }),
    ]);
    expect(await auditOf(["reward.released"])).toHaveLength(1);
  });

  it("con un reto presencial, rechaza la entrega pendiente, libera su reserva y deja cerrar el semestre", async () => {
    const f = await setup();
    const occasion = await seedOccasion(f.termId, {
      title: OCCASION,
      points: 10,
      approval: "MANUAL",
    });
    await seedChallenge(f.termId, {
      kind: "PRESENTIAL",
      occasionId: occasion.id,
      passPercent: null,
    });
    const attendance = await checkInSelfAs(f.member, { publicId: occasion.publicId });
    expect(attendance).toMatchObject({ ok: true, status: "PENDING" });
    expect(await closingSummary(f.termId)).toMatchObject({
      pendingParticipations: 1,
      reservedRewards: 1,
    });

    await approveExcuse(f, occasion.id);

    expect(await listParticipationsForPerson(f.personId)).toEqual([
      expect.objectContaining({
        status: "REJECTED",
        reason: t("T-2579", { actividad: OCCASION }),
      }),
    ]);
    expect(await closingSummary(f.termId)).toMatchObject({
      pendingParticipations: 0,
      reservedRewards: 0,
    });
    await closeOccasionAs(f.admin, occasion.id);
    await expect(closeTermPointsAs(f.admin, f.termId)).resolves.toEqual({
      id: expect.any(String),
    });
    await drainOutbox();
  });
});
