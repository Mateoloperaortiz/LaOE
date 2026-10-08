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
  getSnapshot,
  groupJoinBlocker,
  listEvaluationTray,
  listGroupIdsOf,
  listGroups,
  previewMemberImport,
  recomputeSnapshots,
  removeMemberAs,
  seedWorkCommitteesAs,
} from "@/modules/permanence";
import { addMembers, removeMember } from "@/modules/permanence/domain/groups";
import { auditLog } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { holdCommand, waitingOn } from "../helpers/locks";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import {
  seedCall,
  seedCallEntry,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedRule,
  seedTerm,
} from "./factories";

// Volver a un grupo de trabajo (ADR-116 regla 5): quien fue retirado vuelve a su misma pertenencia por
// los tres caminos (a mano, por archivo y por una convocatoria aceptada), queda pendiente de una
// evaluación nueva, y mientras está afuera no se le puede evaluar.

const admin = { personId: null, ip: null };
const asAdmin = { isAdmin: true };
/** Cuántas veces se repite una carrera: una sola ronda puede caer en el orden que no la muestra. */
const RACE_ROUNDS = 5;

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

  // Decisión abierta 32: quien vuelve queda pendiente (ADR-116 regla 5), y el cómputo le sigue contando
  // la evaluación a quien salió ya evaluada. Así que retirar y volver a agregar a alguien con «Bien» le
  // quita esos puntos hasta que la evalúen otra vez. Si al volver debe conservar su evaluación no está
  // decidido: esta prueba fija la conducta de hoy con el criterio calculado.
  it("quien vuelve ya evaluada deja de sumar en su criterio hasta que la evalúan otra vez (decisión abierta 32)", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("criterio@eafit.edu.co");
    // La tabla de permanencia se arma sobre el roster del término: un comité y el criterio GAP OE.
    await seedCommitteeMembership(persona, await seedCommittee("a3"), termId);
    await seedRule(termId, "gap-oe", {
      label: "GAP OE",
      weight: 5,
      computation: "GROUP_EVALUATED",
      params: { groupKind: "GAP_OE", mode: "FIXED" },
    });
    const criterion = async () => {
      await recomputeSnapshots(termId);
      return (await getSnapshot(persona, termId))?.general.find((item) => item.key === "gap-oe");
    };
    const { id } = await createGroupAs(admin, { termId, kind: "GAP_OE", name: "GAP OE VTG" });
    const good = { groupId: id, personId: persona, evaluation: "GOOD" as const, note: "" };
    const counted = {
      achieved: 5,
      detail: { type: "GROUP_EVALUATED", goodCount: 1, pendingCount: 0 },
    };
    await addMembersAs(admin, id, [persona]);
    await evaluateAs(admin, good, asAdmin);
    expect(await criterion()).toMatchObject(counted);
    // A quien salió ya evaluada el cómputo le sigue contando su evaluación.
    await removeMemberAs(admin, id, persona);
    expect(await criterion()).toMatchObject(counted);

    await addMembersAs(admin, id, [persona]);

    // Volvió pendiente: la evaluación de antes ya no suma.
    expect(await criterion()).toMatchObject({
      achieved: 0,
      detail: { goodCount: 0, pendingCount: 1, groups: [{ groupId: id, evaluation: "PENDING" }] },
    });
    // Y la nueva sí cuenta.
    await evaluateAs(admin, good, asAdmin);
    expect(await criterion()).toMatchObject({
      ...counted,
      remaining: 0,
      detail: { ...counted.detail, groups: [{ groupId: id, evaluation: "GOOD" }] },
    });
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

  it("por archivo: quien entra por otro lado entre la vista previa y el clic sale como que ya estaba", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("cruce@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "GAP", name: "GAP Días EAFIT" });
    await addMembersAs(admin, id, [persona]);
    await removeMemberAs(admin, id, persona);
    const csv = "CORREO\ncruce@eafit.edu.co\n";
    // El alta a mano queda escrita y sin confirmar: la vista previa del archivo todavía la ofrece.
    const statuses = new Map([[persona, { name: "", status: "ACTIVE" }]]);
    const held = await holdCommand(admin, (ctx) => addMembers(ctx, id, [persona], { statuses }));
    const applying = applyMemberImportAs(admin, id, csv);
    void applying.catch(() => undefined);
    try {
      // El archivo hace cola por la fila de la pertenencia y la encuentra viva.
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      const result = await applying;
      // Lo que la pantalla dice: nadie entró por el archivo y la fila pasó de «agregar» a «ya estaba».
      expect(result).toMatchObject({ added: 0, add: 0, already: 1 });
      expect(result.rows.map((row) => row.outcome)).toEqual(["ALREADY"]);
    } finally {
      held.release();
      await Promise.allSettled([held.done, applying]);
    }
    expect(await returnAudits()).toHaveLength(1);
    expect(await memberOf(id, persona)).toMatchObject({ leftAt: null });
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
    // Las dos altas arrancan con su conexión ya abierta: si no, la primera confirma antes de que la
    // otra lea y la prueba pasa aunque nadie espere la fila.
    await warmPool();

    for (let round = 1; round <= RACE_ROUNDS; round += 1) {
      await removeMemberAs(admin, id, persona);

      const results = await Promise.all([
        addMembersAs(admin, id, [persona]),
        addMembersAs(admin, id, [persona]),
      ]);

      // Una la devuelve y la otra espera la fila y la encuentra viva: no vuelve dos veces.
      expect(results.map((result) => result.added).sort()).toEqual([0, 1]);
      expect(results.flatMap((result) => result.returned)).toEqual([persona]);
      expect(results.flatMap((result) => result.already)).toEqual([persona]);
      expect(await returnAudits()).toHaveLength(round);
      expect(await memberOf(id, persona)).toMatchObject({ leftAt: null });
    }
  });

  it("dos altas simultáneas a dos comités de trabajo no pasan el tope", async () => {
    const termId = await seedTerm();
    const [cap, cgh, cml] = await workCommittees(termId);
    if (!cap || !cgh || !cml) throw new Error("faltan comités de trabajo");
    // A solas o después de otra prueba, las dos altas arrancan con su conexión ya abierta.
    await warmPool();

    for (let round = 1; round <= RACE_ROUNDS; round += 1) {
      const persona = await seedMember(`carrera-${round}@eafit.edu.co`, {
        firstName: "Caro",
        lastName: "Carrera",
      });
      await addMembersAs(admin, cap, [persona]);

      const settled = await Promise.allSettled([
        addMembersAs(admin, cgh, [persona]),
        addMembersAs(admin, cml, [persona]),
      ]);

      // Cuentan y escriben bajo el mismo candado: la segunda ya ve dos comités y recibe el motivo.
      expect(await listGroupIdsOf(persona)).toHaveLength(2);
      const rejected = settled.filter((item) => item.status === "rejected");
      expect(rejected).toHaveLength(1);
      expect(String((rejected[0] as PromiseRejectedResult).reason)).toContain(
        t("T-2284", { nombre: "Caro Carrera" }),
      );
    }
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

  it("evaluar a quien otro está retirando espera el retiro y recibe que ya salió", async () => {
    const termId = await seedTerm();
    const persona = await seedMember("saliendo@eafit.edu.co");
    const { id } = await createGroupAs(admin, { termId, kind: "GAP_OE", name: "GAP OE" });
    await addMembersAs(admin, id, [persona]);
    // El retiro queda escrito y sin confirmar: quien evalúa todavía lee a la persona en el grupo.
    const held = await holdCommand(admin, (ctx) => removeMember(ctx, id, persona));
    const evaluating = evaluateAs(
      admin,
      { groupId: id, personId: persona, evaluation: "GOOD", note: "" },
      asAdmin,
    );
    void evaluating.catch(() => undefined);
    try {
      await expect.poll(() => waitingOn(held.pid)).toBe(1);
      held.release();
      await held.done;
      await expect(evaluating).rejects.toThrow(t("T-3213"));
    } finally {
      held.release();
      await Promise.allSettled([held.done, evaluating]);
    }
    const member = await memberOf(id, persona);
    expect(member).toMatchObject({ evaluation: "PENDING" });
    expect(member?.leftAt).toBeInstanceOf(Date);
  });
});
