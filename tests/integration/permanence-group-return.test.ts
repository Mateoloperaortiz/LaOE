import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { decideEntryAs } from "@/modules/crm";
import {
  addMembersAs,
  applyMemberImportAs,
  createGroupAs,
  evaluateAs,
  getGroupDetail,
  groupJoinBlocker,
  listEvaluationTray,
  listGroupIdsOf,
  listGroups,
  previewMemberImport,
  removeMemberAs,
  seedWorkCommitteesAs,
} from "@/modules/permanence";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import { seedCall, seedCallEntry, seedMember, seedTerm } from "./factories";

// Volver a un grupo de trabajo (ADR-116 regla 5): quien fue retirado vuelve a su misma pertenencia por
// los tres caminos (a mano, por archivo y por una convocatoria aceptada), queda pendiente de una
// evaluación nueva, y mientras está afuera no se le puede evaluar.

const admin = { personId: null, ip: null };
const asAdmin = { isAdmin: true };

async function memberOf(groupId: string, personId: string) {
  return (await getGroupDetail(groupId))?.members.find((member) => member.personId === personId);
}

/** Las personas que el evaluador ve en su bandeja para ese grupo. */
async function trayOf(termId: string, groupId: string): Promise<string[]> {
  const [group] = await listEvaluationTray(termId, [groupId]);
  return group?.members.map((member) => member.personId) ?? [];
}

async function returnAudits() {
  return getDb().select().from(auditLog).where(eq(auditLog.action, "work-group.member-returned"));
}

async function workCommittees(termId: string): Promise<string[]> {
  await seedWorkCommitteesAs(admin, termId);
  const { rows } = await listGroups({
    q: "",
    termId,
    kind: "WORK_COMMITTEE",
    page: 1,
    pageSize: 20,
  });
  return rows.map((row) => row.id);
}

describe("volver a un grupo de trabajo", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("a mano: quien fue retirado vuelve a su misma pertenencia y aparece en la bandeja del evaluador", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("vuelve@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "GAP_OE", name: "GAP OE VTG" });
    await addMembersAs(admin, id, [persona]);
    const first = await memberOf(id, persona);
    await removeMemberAs(admin, id, persona);
    expect(await trayOf(termId, id)).toEqual([]);

    const result = await addMembersAs(admin, id, [persona]);

    const back = await memberOf(id, persona);
    expect(back).toMatchObject({ leftAt: null, evaluation: "PENDING" });
    // La misma fila, con su fecha de ingreso: no nace una pertenencia nueva.
    expect((await getGroupDetail(id))?.members).toHaveLength(1);
    expect(back?.joinedAt).toEqual(first?.joinedAt);
    expect(result).toEqual({ added: 1, returned: [persona], already: [] });
    expect(await trayOf(termId, id)).toEqual([persona]);
    expect(await listGroupIdsOf(persona)).toEqual([id]);
    const { rows } = await listGroups({ q: "", termId, kind: undefined, page: 1, pageSize: 20 });
    expect(rows[0]).toMatchObject({ members: 1, pending: 1 });
    // Y su evaluación vuelve a contar: el evaluador la puede calificar.
    await evaluateAs(
      admin,
      { groupId: id, personId: persona, evaluation: "GOOD", note: "" },
      asAdmin,
    );
    expect(await memberOf(id, persona)).toMatchObject({ evaluation: "GOOD", leftAt: null });
    expect(await returnAudits()).toHaveLength(1);
  });

  it("quien vuelve queda pendiente de una evaluación nueva y la anterior queda en la auditoría", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("evaluada@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "BARRA_BRAVA", name: "Barra brava" });
    await addMembersAs(admin, id, [persona]);
    await evaluateAs(
      admin,
      { groupId: id, personId: persona, evaluation: "GOOD", note: "" },
      asAdmin,
    );
    await removeMemberAs(admin, id, persona);

    await addMembersAs(admin, id, [persona]);

    expect(await memberOf(id, persona)).toMatchObject({
      leftAt: null,
      evaluation: "PENDING",
      evaluatedAt: null,
      evaluatedById: null,
      note: null,
    });
    const [audit] = await returnAudits();
    expect(audit?.before).toMatchObject({ evaluation: "GOOD" });
  });

  it("por archivo: la vista previa la ofrece para agregar y al aplicar entra", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("archivo@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "GAP", name: "GAP Días EAFIT" });
    await addMembersAs(admin, id, [persona]);
    await removeMemberAs(admin, id, persona);
    const csv = "CORREO\narchivo@eafit.edu.co\n";
    expect(await previewMemberImport(id, csv)).toMatchObject({ add: 1, already: 0 });

    const result = await applyMemberImportAs(admin, id, csv);

    expect(await memberOf(id, persona)).toMatchObject({ leftAt: null });
    expect(result).toMatchObject({ added: 1, add: 1, already: 0 });
  });

  it("por convocatoria aceptada: el trabajo que agrega la devuelve al grupo", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("convocada@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "GAP", name: "GAP Inventiva" });
    await addMembersAs(admin, id, [persona]);
    await removeMemberAs(admin, id, persona);
    const callId = await seedCall(termId, id, { selection: "MANUAL" });
    const entryId = await seedCallEntry(callId, persona, "APPLIED");

    await decideEntryAs(admin, callId, entryId, "ACCEPTED", undefined, {
      joinBlocker: groupJoinBlocker,
    });
    await drainOutbox();

    expect(await memberOf(id, persona)).toMatchObject({ leftAt: null });
    expect(await listGroupIdsOf(persona)).toEqual([id]);
  });

  it("volver respeta el tope de dos comités de trabajo", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("tope@eafit.edu.co", { firstName: "Tere", lastName: "Tope" });
    const [cap, cgh, cml] = await workCommittees(termId);
    if (!cap || !cgh || !cml) throw new Error("faltan comités de trabajo");
    await addMembersAs(admin, cap, [persona]);
    await removeMemberAs(admin, cap, persona);
    await addMembersAs(admin, cgh, [persona]);
    await addMembersAs(admin, cml, [persona]);

    await expect(addMembersAs(admin, cap, [persona])).rejects.toThrow(
      t("T-2284", { nombre: "Tere Tope" }),
    );

    expect((await memberOf(cap, persona))?.leftAt).toBeInstanceOf(Date);
  });

  it("dos altas simultáneas de quien vuelve dejan una sola entrada", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("doble@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "GAP_OE", name: "GAP OE" });
    await addMembersAs(admin, id, [persona]);
    await removeMemberAs(admin, id, persona);

    const results = await Promise.all([
      addMembersAs(admin, id, [persona]),
      addMembersAs(admin, id, [persona]),
    ]);

    expect(results.map((result) => result.added).sort()).toEqual([0, 1]);
    expect(await returnAudits()).toHaveLength(1);
    expect(await memberOf(id, persona)).toMatchObject({ leftAt: null });
  });

  it("dos altas simultáneas a dos comités de trabajo no pasan el tope", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("carrera@eafit.edu.co", {
      firstName: "Caro",
      lastName: "Carrera",
    });
    const [cap, cgh, cml] = await workCommittees(termId);
    if (!cap || !cgh || !cml) throw new Error("faltan comités de trabajo");
    await addMembersAs(admin, cap, [persona]);

    const settled = await Promise.allSettled([
      addMembersAs(admin, cgh, [persona]),
      addMembersAs(admin, cml, [persona]),
    ]);

    expect(await listGroupIdsOf(persona)).toHaveLength(2);
    const rejected = settled.filter((item) => item.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toContain(
      t("T-2284", { nombre: "Caro Carrera" }),
    );
  });

  it("no se puede evaluar a quien ya salió del grupo", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("salio@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "GAP_OE", name: "GAP OE" });
    await addMembersAs(admin, id, [persona]);
    await removeMemberAs(admin, id, persona);

    await expect(
      evaluateAs(admin, { groupId: id, personId: persona, evaluation: "GOOD", note: "" }, asAdmin),
    ).rejects.toThrow(t("T-3213"));

    expect(await memberOf(id, persona)).toMatchObject({ evaluation: "PENDING" });
  });
});
