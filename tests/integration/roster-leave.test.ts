import { and, asc, eq, inArray } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { task } from "@/modules/crm/schema";
import {
  applyRosterImportAs,
  createRosterPreviewAs,
  leaveWindow,
  listExpiredLeaves,
} from "@/modules/people";
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

/** La fecha de dentro de `days` días (o de hace, si es negativo). */
function dayIn(days: number): string {
  return new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
}

/** El término del roster, con el fin que le pone la prueba y no el de la convención del semestre. */
async function seedTermEnding(endsOn: string): Promise<string> {
  const termId = await seedTerm();
  await db()
    .update(term)
    .set({ startsOn: dayIn(-90), endsOn })
    .where(eq(term.id, termId));
  return termId;
}

/** Aplica un roster con dos personas en licencia: una nueva y una que existía sin membresía. */
async function applyRosterWithLeaves(termId: string): Promise<void> {
  const code = currentTermCode();
  await seedCommittee("a3");
  const adminId = await seedMember("admin.roster@eafit.edu.co");
  await seedPerson(EXISTING_EMAIL, { firstName: "Sara", lastName: "Sola" });
  const bytes = csv([
    `Nora;Nueva;${NEW_EMAIL};;Derecho;A3;${code};Licencia;`,
    `Sara;Sola;${EXISTING_EMAIL};;Derecho;A3;${code};Licencia;`,
  ]);
  const { jobId } = await createRosterPreviewAs(
    { personId: adminId, ip: null },
    { filename: "roster.csv", contentType: "text/csv", bytes, termId },
  );
  await applyRosterImportAs({ personId: adminId, ip: null }, jobId);
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

  it("la persona nueva y la que no tenía membresía quedan en licencia hasta el fin del término del roster, y pasada esa fecha vencen y abren su tarea", async () => {
    const until = dayIn(30);

    await applyRosterWithLeaves(await seedTermEnding(until));

    expect(await leaves()).toEqual([
      { email: NEW_EMAIL, status: "ON_LEAVE", leaveUntil: until },
      { email: EXISTING_EMAIL, status: "ON_LEAVE", leaveUntil: until },
    ]);
    const people = await db()
      .select({ id: person.id })
      .from(person)
      .where(inArray(person.email, [NEW_EMAIL, EXISTING_EMAIL]));
    const onLeave = people.map((row) => row.id).sort();

    // Hoy siguen vigentes: el programado no abre nada.
    await leaveCheck();
    expect(await listExpiredLeaves()).toEqual([]);
    expect(await openLeaveTasks()).toEqual([]);

    // Pasada la fecha salen en las vencidas y el programado le abre a GH una tarea por persona. El
    // programado lee el día del reloj (`todayKey()`), no del poller: la opción `now` de `drainOutbox`
    // no lo mueve, así que acá se adelanta `Date`.
    const later = new Date(Date.parse(`${until}T17:00:00Z`) + 2 * DAY);
    const expired = await listExpiredLeaves(later.toISOString().slice(0, 10));
    expect(expired.map((row) => row.personId).sort()).toEqual(onLeave);
    vi.useFakeTimers({ toFake: ["Date"], now: later });
    await leaveCheck();
    expect(await openLeaveTasks()).toEqual(onLeave);
  });

  it.each([
    ["ya terminó", "mañana, el primer regreso válido", -1, "min"],
    ["termina a más de un año", "al año, que es el tope", 730, "max"],
  ] as const)("si el término del roster %s, la licencia no sale de la ventana: vence %s", async (_case, _until, days, bound) => {
    await applyRosterWithLeaves(await seedTermEnding(dayIn(days)));

    const until = leaveWindow(todayKey())[bound];
    expect(await leaves()).toEqual([
      { email: NEW_EMAIL, status: "ON_LEAVE", leaveUntil: until },
      { email: EXISTING_EMAIL, status: "ON_LEAVE", leaveUntil: until },
    ]);
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
      { personId: adminId, ip: null },
      {
        filename: "roster.csv",
        contentType: "text/csv",
        bytes: csv([`Vera;Vieja;${oldEmail};;Derecho;A3;${code};Licencia;`]),
        termId,
      },
    );

    await applyRosterImportAs({ personId: adminId, ip: null }, jobId);

    // Qué fecha se les pone a las licencias que ya existen sin ella es la decisión abierta 24: el
    // roster no la elige. Mientras tanto no vencen, ni pasado el tope de un año.
    expect(await leaves()).toEqual([{ email: oldEmail, status: "ON_LEAVE", leaveUntil: null }]);
    const afterTheLimit = new Date(Date.now() + 400 * DAY).toISOString().slice(0, 10);
    expect(await listExpiredLeaves(afterTheLimit)).toEqual([]);
  });
});
