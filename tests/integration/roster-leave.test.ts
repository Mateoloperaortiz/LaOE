import { and, asc, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { task } from "@/modules/crm/schema";
import { leaveWindow } from "@/modules/people/domain/leave-pure";
import { listExpiredLeaves } from "@/modules/people/domain/membership";
import { applyRosterImportAs, createRosterPreviewAs } from "@/modules/people/domain/roster";
import { membership, person } from "@/modules/people/schema";
import { term } from "@/modules/terms/schema";
import { todayKey } from "@/shared/lib/dates";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { currentTermCode, seedCommittee, seedMember, seedPerson, seedTerm } from "./factories";

// Una licencia lleva su fecha de regreso (Est. art. 5.4; ADR-060 regla 10). El roster no la trae: la
// que importa vence al fin del término del roster, dentro de la ventana de un año. Sin fecha, la
// licencia nunca vence y el programado diario no le abre a GH la tarea de licencia vencida.

const db = () => getDb();
const DAY = 24 * 60 * 60 * 1000;
const HEADER = "NOMBRE;APELLIDO;CORREO;CELULAR;PREGRADO;COMITES;ENTRADA A LA OE;ESTADO;CARGO";
const NEW_EMAIL = "nueva.licencia@eafit.edu.co";
const EXISTING_EMAIL = "sin.membresia@eafit.edu.co";

function csv(lines: string[]): Uint8Array {
  return new TextEncoder().encode(`﻿${[HEADER, ...lines].join("\r\n")}\r\n`);
}

function leaves() {
  return db()
    .select({ email: person.email, status: membership.status, leaveUntil: membership.leaveUntil })
    .from(membership)
    .innerJoin(person, eq(person.id, membership.personId))
    .where(eq(membership.status, "ON_LEAVE"))
    .orderBy(asc(person.email));
}

async function openLeaveTasks(): Promise<Array<string | null>> {
  const rows = await db()
    .select({ personId: task.personId })
    .from(task)
    .where(and(eq(task.kind, "LEAVE_EXPIRED"), eq(task.status, "OPEN")));
  return rows.map((row) => row.personId).sort();
}

async function leaveCheck(): Promise<void> {
  await enqueueEvent(db(), { type: "membership.leave-check", payload: {} });
  await drainOutbox();
}

describe("licencias que nacen del roster", () => {
  beforeEach(truncateAll);
  afterEach(() => {
    vi.useRealTimers();
  });
  afterAll(() => closeDb());

  it("la persona nueva y la que no tenía membresía quedan en licencia con fecha de regreso, que vence y abre su tarea", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await seedCommittee("a3");
    const adminId = await seedMember("admin.roster@eafit.edu.co");
    const existingId = await seedPerson(EXISTING_EMAIL, { firstName: "Sara", lastName: "Sola" });
    const bytes = csv([
      `Nora;Nueva;${NEW_EMAIL};;Derecho;A3;${code};Licencia;`,
      `Sara;Sola;${EXISTING_EMAIL};;Derecho;A3;${code};Licencia;`,
    ]);
    const { jobId } = await createRosterPreviewAs(
      { personId: adminId },
      { filename: "roster.csv", contentType: "text/csv", bytes, termId },
    );

    await applyRosterImportAs({ personId: adminId }, jobId);

    // El fin del término del roster, o mañana si el término termina hoy: el mínimo de la ventana.
    const [rosterTerm] = await db()
      .select({ endsOn: term.endsOn })
      .from(term)
      .where(eq(term.id, termId));
    const { min } = leaveWindow(todayKey());
    const until = rosterTerm && rosterTerm.endsOn > min ? rosterTerm.endsOn : min;
    expect(await leaves()).toEqual([
      { email: NEW_EMAIL, status: "ON_LEAVE", leaveUntil: until },
      { email: EXISTING_EMAIL, status: "ON_LEAVE", leaveUntil: until },
    ]);
    const [created] = await db()
      .select({ id: person.id })
      .from(person)
      .where(eq(person.email, NEW_EMAIL));
    const onLeave = [created?.id ?? "", existingId].sort();

    // Hoy siguen vigentes: el programado no abre nada.
    await leaveCheck();
    expect(await listExpiredLeaves()).toEqual([]);
    expect(await openLeaveTasks()).toEqual([]);

    // Pasada la fecha salen en las vencidas y el programado le abre a GH una tarea por persona.
    const later = new Date(Date.parse(`${until}T17:00:00Z`) + 2 * DAY);
    const expired = await listExpiredLeaves(later.toISOString().slice(0, 10));
    expect(expired.map((row) => row.personId).sort()).toEqual(onLeave);
    vi.useFakeTimers({ toFake: ["Date"], now: later });
    await leaveCheck();
    expect(await openLeaveTasks()).toEqual(onLeave);
  });

  it("una licencia que ya estaba sin fecha se queda como está al volver a aplicar el roster (decisión abierta 24)", async () => {
    const termId = await seedTerm();
    const code = currentTermCode();
    await seedCommittee("a3");
    const adminId = await seedMember("admin.roster@eafit.edu.co");
    const oldEmail = "licencia.vieja@eafit.edu.co";
    const oldId = await seedMember(oldEmail, { firstName: "Vera", lastName: "Vieja" });
    await db()
      .update(membership)
      .set({ status: "ON_LEAVE", leaveUntil: null })
      .where(eq(membership.personId, oldId));
    const { jobId } = await createRosterPreviewAs(
      { personId: adminId },
      {
        filename: "roster.csv",
        contentType: "text/csv",
        bytes: csv([`Vera;Vieja;${oldEmail};;Derecho;A3;${code};Licencia;`]),
        termId,
      },
    );

    await applyRosterImportAs({ personId: adminId }, jobId);

    // Qué fecha se les pone a las licencias que ya existen sin ella es la decisión abierta 24: el
    // roster no la elige. Mientras tanto no vencen, ni pasado el tope de un año.
    expect(await leaves()).toEqual([{ email: oldEmail, status: "ON_LEAVE", leaveUntil: null }]);
    const afterTheLimit = new Date(Date.now() + 400 * DAY).toISOString().slice(0, 10);
    expect(await listExpiredLeaves(afterTheLimit)).toEqual([]);
  });
});
