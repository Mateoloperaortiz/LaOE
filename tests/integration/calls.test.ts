import { and, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import "@/jobs/handlers";
import { drain } from "@/jobs/poller";
import {
  applyToCallAs,
  decideEntryAs,
  getCall,
  listCallEntries,
  listMyEntries,
  listOpenCalls,
} from "@/modules/crm";
import { interaction } from "@/modules/crm/schema";
import { formSubmission } from "@/modules/forms/schema";
import { listGroupIdsOf } from "@/modules/permanence";
import { workGroupMembership } from "@/modules/permanence/schema";
import { t } from "@/shared/copy";
import { truncateAll } from "./db";
import {
  seedCall,
  seedCallEntry,
  seedForm,
  seedMember,
  seedPerson,
  seedTerm,
  seedWorkGroup,
} from "./factories";

// Convocatorias internas (ADR-031, ADR-037 regla 10): abierta por estado y ventana, solo activos que
// no estén en el grupo, orden de llegada con cupo bajo concurrencia y lista de espera, selección
// manual, respuesta con formulario y la pertenencia al grupo al drenar.

const admin = { personId: null, ip: null };
const notInGroup = { inGroup: false };

async function member(email: string) {
  const personId = await seedMember(email);
  return { personId, actor: { personId, ip: null } };
}

describe("convocatorias internas", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("solo abiertas, para activos que no estén en el grupo, y una inscripción por persona", async () => {
    const termId = await seedTerm();
    const groupId = await seedWorkGroup(termId, "GT Días EAFIT", { kind: "GT_MACROEVENT" });
    const closed = await seedCall(termId, groupId, { status: "CLOSED" });
    const future = await seedCall(termId, groupId, {
      opensAt: new Date(Date.now() + 86_400_000),
      closesAt: new Date(Date.now() + 2 * 86_400_000),
    });
    const open = await seedCall(termId, groupId, { title: "GT abierta", capacity: 2 });
    expect((await listOpenCalls(termId)).map((call) => call.id)).toEqual([open]);
    const { personId, actor } = await member("gt@eafit.edu.co");
    await expect(applyToCallAs(actor, closed, {}, notInGroup)).rejects.toThrow(t("T-904"));
    await expect(applyToCallAs(actor, future, {}, notInGroup)).rejects.toThrow(t("T-904"));
    const prospect = await seedPerson("prospecto@eafit.edu.co");
    await expect(
      applyToCallAs({ personId: prospect, ip: null }, open, {}, notInGroup),
    ).rejects.toThrow(t("T-907"));
    await expect(applyToCallAs(actor, open, {}, { inGroup: true })).rejects.toThrow("Ya estás en");
    const first = await applyToCallAs(actor, open, {}, notInGroup);
    expect(first.status).toBe("ACCEPTED");
    await expect(applyToCallAs(actor, open, {}, notInGroup)).rejects.toThrow(t("T-903"));
    expect((await listMyEntries(personId)).map((entry) => [entry.callTitle, entry.status])).toEqual(
      [["GT abierta", "ACCEPTED"]],
    );
  });

  it("por orden de llegada acepta hasta el cupo bajo concurrencia y deja el resto en lista de espera", async () => {
    const termId = await seedTerm();
    const groupId = await seedWorkGroup(termId, "GAP OE");
    const callId = await seedCall(termId, groupId, { capacity: 3 });
    const people = await Promise.all(
      Array.from({ length: 8 }, (_, index) => member(`gap${index}@eafit.edu.co`)),
    );
    const results = await Promise.all(
      people.map((p) => applyToCallAs(p.actor, callId, {}, notInGroup)),
    );
    expect(results.filter((row) => row.status === "ACCEPTED")).toHaveLength(3);
    expect(results.filter((row) => row.status === "WAITLISTED")).toHaveLength(5);
    const call = await getCall(callId);
    expect(call).toMatchObject({ entries: 8, accepted: 3 });
    // Promover desde la lista de espera sin cupo se rechaza; rechazar a un aceptado libera el cupo.
    const entries = await listCallEntries(callId);
    const waiting = entries.find((entry) => entry.status === "WAITLISTED");
    const accepted = entries.find((entry) => entry.status === "ACCEPTED");
    if (!waiting || !accepted) throw new Error("entries");
    await expect(decideEntryAs(admin, callId, waiting.id, "ACCEPTED")).rejects.toThrow(t("T-1024"));
    await decideEntryAs(admin, callId, accepted.id, "REJECTED", "No cumple el horario");
    await decideEntryAs(admin, callId, waiting.id, "ACCEPTED");
    expect((await getCall(callId))?.accepted).toBe(3);
    expect((await listCallEntries(callId)).find((entry) => entry.id === accepted.id)?.note).toBe(
      "No cumple el horario",
    );
  });

  it("manual queda pendiente hasta que el líder decide; con formulario guarda la respuesta; al drenar entra al grupo", async () => {
    const termId = await seedTerm();
    const groupId = await seedWorkGroup(termId, "Barra brava", { kind: "BARRA_BRAVA" });
    const formId = await seedForm("barra", {
      audience: "MEMBERS",
      fields: [{ key: "motivo", label: "¿Por qué?", type: "TEXTAREA", required: true }],
      actions: {},
    });
    const callId = await seedCall(termId, groupId, { selection: "MANUAL", formId });
    const { personId, actor } = await member("barra@eafit.edu.co");
    await expect(applyToCallAs(actor, callId, { motivo: "" }, notInGroup)).rejects.toThrow(
      t("T-853"),
    );
    const applied = await applyToCallAs(actor, callId, { motivo: "Aliento puro" }, notInGroup);
    expect(applied.status).toBe("APPLIED");
    const [entry] = await listCallEntries(callId);
    expect(entry?.answers).toEqual({ motivo: "Aliento puro" });
    expect(
      await getDb().select().from(formSubmission).where(eq(formSubmission.personId, personId)),
    ).toHaveLength(1);
    await drain(20);
    expect(await listGroupIdsOf(personId)).toEqual([]);
    await decideEntryAs(admin, callId, entry?.id ?? "", "ACCEPTED");
    await drain(20);
    expect(await listGroupIdsOf(personId)).toEqual([groupId]);
    const [membershipRow] = await getDb()
      .select()
      .from(workGroupMembership)
      .where(and(eq(workGroupMembership.groupId, groupId), isNull(workGroupMembership.leftAt)));
    expect(membershipRow?.personId).toBe(personId);
    // La línea de tiempo anota la inscripción pendiente y la aceptación.
    const timeline = await getDb()
      .select()
      .from(interaction)
      .where(eq(interaction.personId, personId));
    const summaries = timeline.map((item) => item.summary);
    expect(
      summaries.some((text) => text.startsWith("Convocatoria Convocatoria de prueba: pendiente")),
    ).toBe(true);
    expect(
      summaries.some((text) => text.startsWith("Convocatoria Convocatoria de prueba: aceptada")),
    ).toBe(true);
  });

  it("decidir exige que la inscripción sea de la convocatoria operada", async () => {
    const termId = await seedTerm();
    const groupA = await seedWorkGroup(termId, "GAP A");
    const groupB = await seedWorkGroup(termId, "GAP B");
    const callA = await seedCall(termId, groupA, { selection: "MANUAL" });
    const callB = await seedCall(termId, groupB, { selection: "MANUAL" });
    const { personId } = await member("ajena@eafit.edu.co");
    const entryB = await seedCallEntry(callB, personId, "APPLIED");
    // Operar la convocatoria A no alcanza para decidir una inscripción de B (ADR-072).
    await expect(decideEntryAs(admin, callA, entryB, "ACCEPTED")).rejects.toThrow(t("T-032"));
    await drain(20);
    expect((await listCallEntries(callB)).map((entry) => entry.status)).toEqual(["APPLIED"]);
    expect(await listGroupIdsOf(personId)).toEqual([]);
    await decideEntryAs(admin, callB, entryB, "ACCEPTED");
    await drain(20);
    expect(await listGroupIdsOf(personId)).toEqual([groupB]);
  });
});
