import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { personAnonymized } from "@/domain-events/people";
import { createRequestAs, decideRequestAs } from "@/modules/crm";
import {
  decideCheckInAs,
  findCheckIn,
  listCheckInsForExport,
  listCheckInsForPerson,
} from "@/modules/participation";
import { checkIn } from "@/modules/participation/schema";
import { anonymizePersonAs, requestDeletionAs } from "@/modules/people";
import { person } from "@/modules/people/schema";
import { auditLog, outbox } from "@/modules/system/schema";
import { tList } from "@/shared/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedCheckIn, seedMember, seedOccasion, seedTerm } from "./factories";

// Anonimizar a una persona (ADR-030 regla 4; ADR-114 regla 4): su asistencia se conserva de forma
// anónima, pero el texto de una excusa lo aportó ella y puede decir de su salud, así que se borra.
// Lo que escribió GH al rechazar o anular una asistencia no es suyo y se queda.

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Una ocasión de ayer, ya cerrada: dentro del plazo de tres días hábiles para excusarse. */
function yesterday(termId: string, title: string) {
  const startsAt = Date.now() - DAY;
  return seedOccasion(termId, {
    title,
    points: 0,
    status: "CLOSED",
    startsAt: new Date(startsAt),
    checkInOpensAt: new Date(startsAt - HOUR),
    checkInClosesAt: new Date(startsAt + HOUR),
  });
}

/** El motivo que una excusa aceptada deja escrito fuera de la asistencia: en su auditoría y en su evento. */
async function excuseTraces(occasionId: string, personId: string) {
  const audits = await getDb()
    .select({ after: auditLog.after })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.action, "checkin.excused"),
        eq(auditLog.entityId, `${occasionId}:${personId}`),
      ),
    );
  const events = (
    await getDb()
      .select({ payload: outbox.payload })
      .from(outbox)
      .where(eq(outbox.eventType, "checkin.excused"))
  ).filter((event) => event.payload.personId === personId);
  return {
    audits: audits.map((row) => (row.after as { reason: unknown }).reason),
    events: events.map((event) => event.payload.reason),
  };
}

/**
 * Espera a que `count` sesiones de esta base estén en cola por un candado, que es como se sabe que un
 * comando llegó a su punto de espera. Devuelve `false` si `settled` termina antes de hacer cola.
 */
async function queuedForLock(count: number, settled: Promise<unknown>): Promise<boolean> {
  let over = false;
  const finish = () => {
    over = true;
  };
  void settled.then(finish, finish);
  for (let attempt = 0; attempt < 1000 && !over; attempt += 1) {
    const result = await getDb().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if ((result.rows[0]?.waiting ?? 0) >= count) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!over) {
    throw new Error(`Ninguna espera llegó a ${count} sesiones en cola por un candado`);
  }
  return false;
}

describe("anonimización en participación", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("anonimizar a una persona borra el motivo de sus asistencias excusadas y conserva que fueron excusadas", async () => {
    const termId = await seedTerm();
    const gh = await seedMember("gh@eafit.edu.co");
    const leaving = await seedMember("se-va@eafit.edu.co");
    const staying = await seedMember("se-queda@eafit.edu.co");
    const asGh = { personId: gh, ip: null };
    const assembly = await yesterday(termId, "Asamblea de mitad de semestre");
    const workshop = await yesterday(termId, "Taller de vocería");
    const fair = await yesterday(termId, "Feria de comités");

    // Las dos se excusan de la asamblea con una causal médica y GH acepta las dos.
    const excuses = [
      { personId: leaving, reason: "Incapacidad de tres días por una cirugía de rodilla" },
      { personId: staying, reason: "Control con el especialista que no se pudo mover" },
    ];
    for (const excuse of excuses) {
      const created = await createRequestAs({ personId: excuse.personId, ip: null }, "EXCUSE", {
        occasionId: assembly.id,
        cause: "MEDICAL_LEAVE",
        reason: excuse.reason,
      });
      await decideRequestAs(asGh, created.id, { decision: "APPROVED" });
    }
    // Además GH le rechaza una asistencia y le anula otra: esos motivos los escribe GH.
    const rejected = await seedCheckIn(workshop.id, leaving, "PENDING");
    await decideCheckInAs(asGh, {
      checkInId: rejected,
      decision: "REJECT",
      reason: "No estuvo en el taller",
    });
    const cancelled = await seedCheckIn(fair.id, leaving, "APPROVED");
    await decideCheckInAs(asGh, {
      checkInId: cancelled,
      decision: "CANCEL",
      reason: "Registro duplicado por error del anfitrión",
    });
    await drainOutbox();
    const before = await findCheckIn(assembly.id, leaving);
    expect(before).toMatchObject({ status: "EXCUSED", decidedById: gh });
    expect(before?.reason).toContain(tList("T-2215")[2]);
    expect(before?.reason).toContain("cirugía de rodilla");

    await requestDeletionAs({ personId: leaving, ip: null });
    await anonymizePersonAs(asGh, leaving);
    await drainOutbox();

    // La asistencia sigue excusada, con quién y cuándo la decidió, y sin el texto.
    const after = await findCheckIn(assembly.id, leaving);
    expect(after).toMatchObject({
      id: before?.id,
      status: "EXCUSED",
      reason: null,
      decidedById: gh,
      decidedAt: before?.decidedAt,
    });
    // Es lo que lee GH en el exporte de asistencias: la de quien se queda no cambia.
    const exported = await listCheckInsForExport({
      q: "",
      occasionId: assembly.id,
      page: 1,
      pageSize: 50,
    });
    expect(exported.rows).toHaveLength(2);
    expect(exported.rows.find((row) => row.email !== "se-queda@eafit.edu.co")).toMatchObject({
      status: "EXCUSED",
      reason: null,
    });
    expect(exported.rows.find((row) => row.email === "se-queda@eafit.edu.co")).toMatchObject({
      status: "EXCUSED",
      reason: expect.stringContaining("Control con el especialista que no se pudo mover"),
    });
    expect((await findCheckIn(assembly.id, staying))?.reason).toContain(
      "Control con el especialista que no se pudo mover",
    );

    // Lo que escribió GH al rechazar y al anular no es texto de la persona: se conserva.
    const mine = new Map((await listCheckInsForPerson(leaving)).map((row) => [row.id, row]));
    expect(mine.get(rejected)).toMatchObject({
      status: "REJECTED",
      reason: "No estuvo en el taller",
    });
    expect(mine.get(cancelled)).toMatchObject({
      status: "CANCELLED",
      reason: "Registro duplicado por error del anfitrión",
    });
    expect(mine.size).toBe(3);
  });

  it("un aviso de anonimización repetido no cambia nada más", async () => {
    const termId = await seedTerm();
    const gh = await seedMember("gh@eafit.edu.co");
    const leaving = await seedMember("se-va@eafit.edu.co");
    const asGh = { personId: gh, ip: null };
    const assembly = await yesterday(termId, "Asamblea de mitad de semestre");
    const created = await createRequestAs({ personId: leaving, ip: null }, "EXCUSE", {
      occasionId: assembly.id,
      cause: "MEDICAL_APPOINTMENT",
      reason: "Cita de control que no se pudo reprogramar",
    });
    await decideRequestAs(asGh, created.id, { decision: "APPROVED" });
    await requestDeletionAs({ personId: leaving, ip: null });
    await anonymizePersonAs(asGh, leaving);
    await drainOutbox();
    const first = await findCheckIn(assembly.id, leaving);
    expect(first).toMatchObject({ status: "EXCUSED", reason: null });

    // El outbox entrega al menos una vez: el mismo aviso puede llegar de nuevo.
    await runCommand(SYSTEM_ACTOR, (ctx) =>
      ctx.emit(eventOf(personAnonymized, { actorId: gh, personId: leaving })),
    );
    await drainOutbox();
    expect(await findCheckIn(assembly.id, leaving)).toEqual(first);
  });

  it("una excusa pendiente que se acepta después de anonimizar deja la asistencia excusada sin el motivo, también en la auditoría y en el evento", async () => {
    const termId = await seedTerm();
    const gh = await seedMember("gh@eafit.edu.co");
    const leaving = await seedMember("se-va@eafit.edu.co");
    const asGh = { personId: gh, ip: null };
    const assembly = await yesterday(termId, "Asamblea de mitad de semestre");
    const created = await createRequestAs({ personId: leaving, ip: null }, "EXCUSE", {
      occasionId: assembly.id,
      cause: "MEDICAL_LEAVE",
      reason: "Incapacidad de tres días por una cirugía de rodilla",
    });
    // Se anonimiza con la solicitud todavía pendiente: no hay asistencia que limpiar.
    await requestDeletionAs({ personId: leaving, ip: null });
    await anonymizePersonAs(asGh, leaving);
    await drainOutbox();
    expect(await findCheckIn(assembly.id, leaving)).toBeNull();

    // GH la acepta después: la asistencia queda excusada y el texto no se vuelve a escribir.
    await decideRequestAs(asGh, created.id, { decision: "APPROVED" });
    await drainOutbox();
    expect(await findCheckIn(assembly.id, leaving)).toMatchObject({
      status: "EXCUSED",
      reason: null,
      decidedById: gh,
    });
    const exported = await listCheckInsForExport({
      q: "",
      occasionId: assembly.id,
      page: 1,
      pageSize: 50,
    });
    expect(exported.rows).toMatchObject([{ status: "EXCUSED", reason: null }]);
    expect(await excuseTraces(assembly.id, leaving)).toEqual({ audits: [null], events: [null] });
  });

  it("una excusa que se acepta mientras se anonimiza a la persona no deja el motivo: la anonimización espera a la aprobación", async () => {
    const termId = await seedTerm();
    const gh = await seedMember("gh@eafit.edu.co");
    const leaving = await seedMember("se-va@eafit.edu.co");
    const asGh = { personId: gh, ip: null };
    const assembly = await yesterday(termId, "Asamblea de mitad de semestre");
    // Ya tenía una asistencia por decidir: aceptar la excusa la actualiza.
    const pending = await seedCheckIn(assembly.id, leaving, "PENDING");
    const created = await createRequestAs({ personId: leaving, ip: null }, "EXCUSE", {
      occasionId: assembly.id,
      cause: "MEDICAL_LEAVE",
      reason: "Incapacidad de tres días por una cirugía de rodilla",
    });
    await requestDeletionAs({ personId: leaving, ip: null });
    await drainOutbox();

    let approving: Promise<void> = Promise.resolve();
    let anonymizing: Promise<void> = Promise.resolve();
    const queued = { approval: false, reference: false, anonymization: false };
    // Otra sesión retiene la fila de la asistencia: la aprobación ya miró a la persona, que todavía
    // no está anonimizada, y queda en cola para escribir el motivo. La anonimización llega ahí.
    await getDb().transaction(async (holder) => {
      await holder
        .select({ id: checkIn.id })
        .from(checkIn)
        .where(eq(checkIn.id, pending))
        .for("update");
      approving = decideRequestAs(asGh, created.id, { decision: "APPROVED" });
      queued.approval = await queuedForLock(1, approving);
      // Otra sesión todavía puede referenciar a la persona, como hace una clave foránea al
      // insertar: el candado de la aprobación es compartido y no la deja en cola.
      const referencing = getDb()
        .select({ id: person.id })
        .from(person)
        .where(eq(person.id, leaving))
        .for("key share")
        .execute();
      queued.reference = await queuedForLock(2, referencing);
      anonymizing = anonymizePersonAs(asGh, leaving);
      queued.anonymization = await queuedForLock(queued.reference ? 3 : 2, anonymizing);
    });
    await Promise.all([approving, anonymizing]);
    await drainOutbox();

    // La anonimización hizo cola detrás de la aprobación: su aviso sale cuando el motivo ya está
    // escrito, y lo borra. Sin esa cola el aviso podía atenderse antes y el motivo quedaba.
    expect(queued).toEqual({ approval: true, reference: false, anonymization: true });
    expect(await findCheckIn(assembly.id, leaving)).toMatchObject({
      id: pending,
      status: "EXCUSED",
      reason: null,
      decidedById: gh,
    });
  });
});
