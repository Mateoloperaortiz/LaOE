import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import "@/jobs/handlers";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { drain } from "@/jobs/poller";
import {
  createRequestAs,
  decideExcuseForCommitteeAs,
  decideRequestAs,
  listPendingExcusesForCommittee,
  listRequestsByPerson,
} from "@/modules/crm";
import { interaction, request, task } from "@/modules/crm/schema";
import { checkIn } from "@/modules/participation/schema";
import { getSnapshot, recomputeSnapshots } from "@/modules/permanence";
import { closeTermPoints } from "@/modules/terms";
import { DomainError } from "@/shared/admin-kit/DomainError";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedCheckIn,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOccasion,
  seedTerm,
} from "./factories";

// Excusa válida como solicitud (ADR-060 regla 5): plazo de tres días hábiles, una pendiente por ocasión,
// aceptar escribe un check-in excusado que no expulsa por una obligatoria ni cuenta como falta, y la
// dirección del comité decide solo sobre las ocasiones de su comité.

const db = () => getDb();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function drenar(): Promise<void> {
  for (let batch = 0; batch < 20; batch += 1) {
    const result = await drain(50);
    expect(result.failed).toBe(0);
    if (result.processed === 0) {
      return;
    }
  }
  throw new Error("El outbox no terminó");
}

async function setup() {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3", "A3");
  const pixel = await seedCommittee("pixel", "PIXEL");
  const gh = await seedMember("gh@eafit.edu.co");
  const personId = await seedMember("miembro@eafit.edu.co");
  await seedCommitteeMembership(personId, a3, termId, "MIEMBRO", {
    joinedAt: new Date(Date.now() - 30 * DAY),
  });
  const now = new Date();
  // Elección de junta celebrada ayer: obligatoria en un término de segundo semestre.
  const election = await seedOccasion(termId, {
    title: "Elección de junta",
    kind: "ASSEMBLY",
    assemblyKind: "BOARD_ELECTION",
    points: 0,
    status: "CLOSED",
    startsAt: new Date(now.getTime() - DAY),
    checkInOpensAt: new Date(now.getTime() - DAY - HOUR),
    checkInClosesAt: new Date(now.getTime() - DAY + HOUR),
  });
  // Reunión del comité A3 hace dos días y otra dentro de una semana.
  const meeting = await seedOccasion(termId, {
    category: "COMMITTEE_MEETING",
    committeeId: a3,
    points: 0,
    status: "CLOSED",
    startsAt: new Date(now.getTime() - 2 * DAY),
    checkInOpensAt: new Date(now.getTime() - 2 * DAY - HOUR),
    checkInClosesAt: new Date(now.getTime() - 2 * DAY + HOUR),
  });
  // Una integración de hace tres semanas: fuera del plazo.
  const old = await seedOccasion(termId, {
    category: "INTEGRATION",
    points: 10,
    status: "CLOSED",
    startsAt: new Date(now.getTime() - 21 * DAY),
    checkInOpensAt: new Date(now.getTime() - 21 * DAY - HOUR),
    checkInClosesAt: new Date(now.getTime() - 21 * DAY + HOUR),
  });
  return { termId, a3, pixel, gh, personId, election, meeting, old, actor: { personId, ip: null } };
}

describe("excusas válidas", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("se presenta dentro del plazo, una pendiente por ocasión, y abre una tarea para GH", async () => {
    const f = await setup();
    await expect(
      createRequestAs(f.actor, "EXCUSE", {
        occasionId: f.old.id,
        cause: "WORK",
        reason: "Turno en el trabajo",
      }),
    ).rejects.toThrow(t("T-2219"));
    const first = await createRequestAs(f.actor, "EXCUSE", {
      occasionId: f.election.id,
      cause: "MEDICAL_LEAVE",
      reason: "Incapacidad de tres días",
      evidence: "Incapacidad adjunta por correo",
    });
    await expect(
      createRequestAs(f.actor, "EXCUSE", {
        occasionId: f.election.id,
        cause: "WORK",
        reason: "Otra vez",
      }),
    ).rejects.toThrow(t("T-2220"));
    // Otra ocasión sí admite su propia excusa pendiente.
    const second = await createRequestAs(f.actor, "EXCUSE", {
      occasionId: f.meeting.id,
      cause: "ACADEMIC",
      reason: "Parcial de cálculo",
    });
    expect(first.id).not.toBe(second.id);
    const mine = await listRequestsByPerson(f.personId);
    expect(mine.map((row) => row.kind)).toEqual(["EXCUSE", "EXCUSE"]);
    expect(mine.find((row) => row.id === first.id)?.detail).toContain("Incapacidad médica");
    const tasks = await db().select().from(task).where(eq(task.personId, f.personId));
    expect(tasks).toHaveLength(2);
    // Con asistencia registrada no hace falta excusa.
    await seedCheckIn(f.old.id, f.personId);
    await expect(
      createRequestAs(f.actor, "EXCUSE", {
        occasionId: f.old.id,
        cause: "WORK",
        reason: "Turno",
      }),
    ).rejects.toBeInstanceOf(DomainError);
  });

  it("aceptarla escribe un check-in excusado que no cuenta como obligatoria perdida ni como falta", async () => {
    const f = await setup();
    const created = await createRequestAs(f.actor, "EXCUSE", {
      occasionId: f.election.id,
      cause: "EMERGENCY",
      reason: "Accidente de un familiar",
    });
    await recomputeSnapshots(f.termId);
    const before = await getSnapshot(f.personId, f.termId);
    expect(before?.mandatory.lost).toEqual(["BOARD_ELECTION"]);

    await decideRequestAs({ personId: f.gh, ip: null }, created.id, { decision: "APPROVED" });
    const [row] = await db()
      .select()
      .from(checkIn)
      .where(and(eq(checkIn.occasionId, f.election.id), eq(checkIn.personId, f.personId)));
    expect(row).toMatchObject({ status: "EXCUSED", source: "ADMIN", decidedById: f.gh });
    expect(row?.reason).toContain("Accidente de un familiar");
    await drenar();
    const after = await getSnapshot(f.personId, f.termId);
    expect(after?.mandatory).toMatchObject({ lost: [], excused: ["BOARD_ELECTION"], met: false });
    const timeline = await db()
      .select({ summary: interaction.summary })
      .from(interaction)
      .where(and(eq(interaction.personId, f.personId), eq(interaction.kind, "PARTICIPATION")));
    expect(timeline.map((item) => item.summary)).toContain(
      "Excusa aceptada para Elección de junta",
    );
    // Repetir la excusa sobre esa ocasión ya no tiene sentido.
    await expect(
      createRequestAs(f.actor, "EXCUSE", {
        occasionId: f.election.id,
        cause: "WORK",
        reason: "Turno",
      }),
    ).rejects.toThrow(t("T-2223"));
    const [stored] = await db().select().from(request).where(eq(request.id, created.id));
    expect(stored).toMatchObject({ status: "APPROVED", occasionId: f.election.id });
  });

  it("la dirección del comité decide solo las excusas de sus ocasiones", async () => {
    const f = await setup();
    const meeting = await createRequestAs(f.actor, "EXCUSE", {
      occasionId: f.meeting.id,
      cause: "ACADEMIC",
      reason: "Parcial",
    });
    const election = await createRequestAs(f.actor, "EXCUSE", {
      occasionId: f.election.id,
      cause: "ACADEMIC",
      reason: "Parcial",
    });
    expect((await listPendingExcusesForCommittee(f.a3, f.termId)).map((row) => row.id)).toEqual([
      meeting.id,
    ]);
    expect(await listPendingExcusesForCommittee(f.pixel, f.termId)).toEqual([]);
    const general = { personId: f.gh, ip: null };
    await expect(
      decideExcuseForCommitteeAs(general, election.id, f.a3, { decision: "APPROVED" }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      decideExcuseForCommitteeAs(general, meeting.id, f.pixel, { decision: "APPROVED" }),
    ).rejects.toBeInstanceOf(DomainError);
    await decideExcuseForCommitteeAs(general, meeting.id, f.a3, {
      decision: "REJECTED",
      reason: "El parcial era a otra hora",
    });
    const [stored] = await db().select().from(request).where(eq(request.id, meeting.id));
    expect(stored).toMatchObject({ status: "REJECTED", reason: "El parcial era a otra hora" });
    expect(await listPendingExcusesForCommittee(f.a3, f.termId)).toEqual([]);
    // El cierre de puntos no cambia nada de lo anterior.
    await runCommand(SYSTEM_ACTOR, (ctx) => closeTermPoints(ctx, f.termId));
  });
});
