import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "@/db/client";
import { callEntryChanged } from "@/domain-events/crm";
import { registerHandler } from "@/jobs/registry";
import { applyToCallAs, decideEntryAs, listCallEntries, listTasks } from "@/modules/crm";
import {
  addMembersAs,
  createGroupAs,
  groupJoinBlocker,
  listGroupIdsOf,
  listGroups,
  seedWorkCommitteesAs,
} from "@/modules/permanence";
import { t } from "@/shared/copy";
import {
  seedCall,
  seedCallEntry,
  seedMember,
  seedMembership,
  seedPerson,
  seedTerm,
} from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";

// Una inscripción aceptada entra al grupo o quien acepta recibe el motivo (ADR-116 regla 7): aceptar
// comprueba antes lo que el grupo exige (solo activos, tope de dos comités de trabajo), y si la
// condición cambia entre aceptar y el trabajo que agrega, el evento no muere: queda una tarea para GH.

const admin = { personId: null, ip: null };
/** Lo que compone la capa de la app: crm pregunta y permanence responde. */
const admission = { joinBlocker: groupJoinBlocker };

async function setup() {
  const termId = await seedTerm();
  await seedWorkCommitteesAs(admin, termId);
  const { rows } = await listGroups({
    q: "",
    termId,
    kind: "WORK_COMMITTEE",
    page: 1,
    pageSize: 20,
  });
  const [cap, cgh, cml] = rows.map((row) => row.id);
  if (!cap || !cgh || !cml) throw new Error("faltan comités de trabajo");
  const personId = await seedMember("tres@eafit.edu.co", { firstName: "Tere", lastName: "Tres" });
  return { termId, cap, cgh, cml, personId };
}

async function statusesOf(callId: string): Promise<string[]> {
  return (await listCallEntries(callId)).map((entry) => entry.status);
}

async function openTasks() {
  return (await listTasks({ q: "", status: "OPEN", page: 1, pageSize: 20 })).rows;
}

const twoCommittees = t("T-2284", { nombre: "Tere Tres" });
// Errores de quien programa, no copy: la comprobación falta o respondió algo que no se reconoce.
const MISSING_CHECK = /exige la comprobación del grupo/;
const NOT_A_REASON = /respondió algo que no es un motivo/;

/** Cuántas veces falla el vecino de `call-entry.changed` antes de dejar pasar el evento. */
let neighbourFailures = 0;

describe("una inscripción aceptada entra al grupo o quien acepta recibe el motivo", () => {
  beforeAll(() => {
    // Un vecino al final de la cadena del evento: falla después de que permanence ya avisó que la
    // persona no entró, y con eso el poller reintenta el evento entero.
    registerHandler(callEntryChanged.type, async () => {
      if (neighbourFailures > 0) {
        neighbourFailures -= 1;
        throw new Error("vecino caído");
      }
    });
  });
  beforeEach(async () => {
    neighbourFailures = 0;
    await truncateAll();
  });
  afterAll(() => closeDb());

  it("aceptar a quien ya está en dos comités de trabajo responde el motivo y no acepta", async () => {
    const { termId, cap, cgh, cml, personId } = await setup();
    await addMembersAs(admin, cap, [personId]);
    await addMembersAs(admin, cgh, [personId]);
    const callId = await seedCall(termId, cml, { selection: "MANUAL" });
    const entryId = await seedCallEntry(callId, personId, "APPLIED");

    await expect(
      decideEntryAs(admin, callId, entryId, "ACCEPTED", undefined, admission),
    ).rejects.toThrow(twoCommittees);

    expect(await statusesOf(callId)).toEqual(["APPLIED"]);
    // Nada queda fallando en el outbox ni esperando un reintento.
    await drainOutbox();
    expect(await listGroupIdsOf(personId)).not.toContain(cml);
    // Rechazar no pregunta por el grupo.
    await decideEntryAs(admin, callId, entryId, "REJECTED", "Ya está en dos comités", admission);
    expect(await statusesOf(callId)).toEqual(["REJECTED"]);
  });

  it("aceptar a quien ya no está activo responde el motivo y no acepta", async () => {
    const termId = await seedTerm();
    const { id: groupId } = await createGroupAs(admin, { termId, kind: "GAP", name: "GAP Días" });
    const onLeave = await seedPerson("licencia@eafit.edu.co");
    await seedMembership(onLeave, termId, "ON_LEAVE");
    const callId = await seedCall(termId, groupId, { selection: "MANUAL" });
    const entryId = await seedCallEntry(callId, onLeave, "APPLIED");

    await expect(
      decideEntryAs(admin, callId, entryId, "ACCEPTED", undefined, admission),
    ).rejects.toThrow(t("T-752", { nombre: "Persona Sintética" }));

    expect(await statusesOf(callId)).toEqual(["APPLIED"]);
    await drainOutbox();
  });

  it("por orden de llegada, quien ya está en dos comités de trabajo recibe el motivo en vez de quedar aceptado", async () => {
    const { termId, cap, cgh, cml, personId } = await setup();
    await addMembersAs(admin, cap, [personId]);
    await addMembersAs(admin, cgh, [personId]);
    const callId = await seedCall(termId, cml, { selection: "FIRST_COME", capacity: 5 });

    await expect(
      applyToCallAs({ personId, ip: null }, callId, {}, { inGroup: false, ...admission }),
    ).rejects.toThrow(twoCommittees);

    expect(await statusesOf(callId)).toEqual([]);
    await drainOutbox();
  });

  it("sin cupo, quien ya está en dos comités de trabajo queda en lista de espera: el grupo se comprueba al aceptar", async () => {
    const { termId, cap, cgh, cml, personId } = await setup();
    await addMembersAs(admin, cap, [personId]);
    await addMembersAs(admin, cgh, [personId]);
    const other = await seedMember("otra@eafit.edu.co");
    const callId = await seedCall(termId, cml, { selection: "FIRST_COME", capacity: 1 });
    await seedCallEntry(callId, other, "ACCEPTED");

    const result = await applyToCallAs(
      { personId, ip: null },
      callId,
      {},
      { inGroup: false, ...admission },
    );

    expect(result.status).toBe("WAITLISTED");
  });

  it("si la condición cambia entre aceptar y el trabajo, el evento no muere: queda una tarea para GH", async () => {
    const { termId, cap, cgh, cml, personId } = await setup();
    await addMembersAs(admin, cap, [personId]);
    const callId = await seedCall(termId, cml, { selection: "MANUAL", title: "Logística 2026" });
    const entryId = await seedCallEntry(callId, personId, "APPLIED");
    // Al aceptar la persona está en un solo comité de trabajo: el grupo la admite.
    await decideEntryAs(admin, callId, entryId, "ACCEPTED", undefined, admission);
    // Antes de que corra el trabajo entra a otro comité: ya son dos.
    await addMembersAs(admin, cgh, [personId]);

    // El trabajo que agrega no le lanza un error de dominio al poller: el outbox drena limpio.
    await drainOutbox();

    expect(await listGroupIdsOf(personId)).not.toContain(cml);
    // La inscripción sigue aceptada, como hoy: si debe volver a pendiente o rechazarse sola es la
    // decisión abierta 31. Mientras tanto GH la resuelve desde la tarea.
    expect(await statusesOf(callId)).toEqual(["ACCEPTED"]);
    const tasks = await openTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: t("T-3217", {
        nombre: "Tere Tres",
        convocatoria: "Logística 2026",
        motivo: twoCommittees,
      }),
      kind: "GENERAL",
      personId,
      assigneeId: null,
    });
    expect(tasks[0]?.dueAt).toBeInstanceOf(Date);
  });

  it("si el evento de la inscripción se reintenta, el aviso se repite y sigue una sola tarea abierta", async () => {
    const { termId, cap, cgh, cml, personId } = await setup();
    await addMembersAs(admin, cap, [personId]);
    const callId = await seedCall(termId, cml, { selection: "MANUAL", title: "Logística 2026" });
    const entryId = await seedCallEntry(callId, personId, "APPLIED");
    await decideEntryAs(admin, callId, entryId, "ACCEPTED", undefined, admission);
    await addMembersAs(admin, cgh, [personId]);

    // El trabajo de permanence avisa por fuera de la transacción del evento, así que el aviso queda
    // aunque un vecino falle después y el evento vuelva a la cola.
    neighbourFailures = 1;
    await drainOutbox({ expectFailures: [callEntryChanged] });
    expect(await openTasks()).toHaveLength(1);

    // El reintento avisa otra vez: la tarea es una por persona y convocatoria (ADR-116 regla 7).
    await drainOutbox({ now: new Date(Date.now() + 60 * 60_000) });

    expect(await openTasks()).toHaveLength(1);
    expect(await statusesOf(callId)).toEqual(["ACCEPTED"]);
    expect(await listGroupIdsOf(personId)).not.toContain(cml);
  });

  it("una inscripción aceptada que el grupo admite entra al grupo y no abre ninguna tarea", async () => {
    const { termId, cap, cml, personId } = await setup();
    await addMembersAs(admin, cap, [personId]);
    const callId = await seedCall(termId, cml, { selection: "MANUAL" });
    const entryId = await seedCallEntry(callId, personId, "APPLIED");

    await decideEntryAs(admin, callId, entryId, "ACCEPTED", undefined, admission);
    await drainOutbox();

    expect(await listGroupIdsOf(personId)).toContain(cml);
    expect(await openTasks()).toEqual([]);
  });

  it("sin la comprobación del grupo no se acepta a nadie", async () => {
    const { termId, cgh, cml, personId } = await setup();
    const callId = await seedCall(termId, cml, { selection: "MANUAL" });
    const entryId = await seedCallEntry(callId, personId, "APPLIED");
    // Otra convocatoria, con cupo y sin inscripción suya: lo único que la frena es que falta la
    // comprobación, no que ya esté inscrita.
    const openCallId = await seedCall(termId, cgh, { selection: "FIRST_COME", capacity: 5 });
    const missing = {} as unknown as typeof admission;

    await expect(
      decideEntryAs(admin, callId, entryId, "ACCEPTED", undefined, missing),
    ).rejects.toThrow(MISSING_CHECK);
    await expect(
      applyToCallAs({ personId, ip: null }, openCallId, {}, { inGroup: false, ...missing }),
    ).rejects.toThrow(MISSING_CHECK);

    expect(await statusesOf(callId)).toEqual(["APPLIED"]);
    expect(await statusesOf(openCallId)).toEqual([]);
  });

  it("una respuesta del grupo que no es un motivo ni «la admite» tampoco deja pasar", async () => {
    const { termId, cgh, cml, personId } = await setup();
    const callId = await seedCall(termId, cml, { selection: "MANUAL" });
    const entryId = await seedCallEntry(callId, personId, "APPLIED");
    const openCallId = await seedCall(termId, cgh, { selection: "FIRST_COME", capacity: 5 });

    for (const answer of [undefined, "", "   ", true, false, 0, {}]) {
      const broken = { joinBlocker: async () => answer } as unknown as typeof admission;

      await expect(
        decideEntryAs(admin, callId, entryId, "ACCEPTED", undefined, broken),
      ).rejects.toThrow(NOT_A_REASON);
      await expect(
        applyToCallAs({ personId, ip: null }, openCallId, {}, { inGroup: false, ...broken }),
      ).rejects.toThrow(NOT_A_REASON);
    }

    expect(await statusesOf(callId)).toEqual(["APPLIED"]);
    expect(await statusesOf(openCallId)).toEqual([]);
    await drainOutbox();
    expect(await listGroupIdsOf(personId)).toEqual([]);
  });
});
