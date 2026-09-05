import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { createTaskAs, dashboardForAdmin, moveCardAs } from "@/modules/crm";
import { pipeline } from "@/modules/crm/schema";
import { countDeadLetters } from "@/modules/system";
import { outbox } from "@/modules/system/schema";
import { truncateAll } from "./db";
import {
  seedCall,
  seedCard,
  seedMember,
  seedPerson,
  seedPipeline,
  seedRequest,
  seedTerm,
  seedWorkGroup,
} from "./factories";

// Tablero del inicio del admin (ADR-037 regla 11): lo que crm reúne para ADMIN y el conteo de
// trabajos con error que compone la página.

describe("tablero del admin", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("reúne tareas propias, vencidas del equipo, solicitudes, pipelines y convocatorias abiertas", async () => {
    const termId = await seedTerm();
    const admin = await seedMember("admin@eafit.edu.co");
    const other = await seedMember("otra@eafit.edu.co");
    const actor = { personId: admin, ip: null };
    await createTaskAs(actor, {
      title: "Mía",
      kind: "GENERAL",
      assigneeId: admin,
      personId: other,
    });
    await createTaskAs(actor, {
      title: "Mía vencida",
      kind: "GENERAL",
      assigneeId: admin,
      personId: other,
      dueAt: "2020-01-01T10:00",
    });
    await createTaskAs(actor, {
      title: "De otra persona, vencida",
      kind: "GENERAL",
      assigneeId: other,
      personId: admin,
      dueAt: "2020-01-02T10:00",
    });
    await createTaskAs(actor, {
      title: "Sin asignar y sin vencer",
      kind: "GENERAL",
      personId: other,
    });
    await seedRequest(other, termId, "LEAVE");
    await seedRequest(other, termId, "TRANSFER", { status: "APPROVED" });

    const pipe = await seedPipeline("Admisión");
    const [recibida, entrevista, alta] = pipe.stages;
    if (!recibida || !entrevista || !alta) throw new Error("etapas");
    const a = await seedPerson("a@eafit.edu.co", { stage: "APPLICANT" });
    const b = await seedPerson("b@eafit.edu.co", { stage: "APPLICANT" });
    const c = await seedMember("c@eafit.edu.co");
    await seedCard(pipe.id, recibida.id, { personId: a });
    await seedCard(pipe.id, entrevista.id, { personId: b });
    const cardC = await seedCard(pipe.id, entrevista.id, { personId: c });
    // La tarjeta cerrada (ganada, con membresía) no cuenta como abierta.
    await moveCardAs(actor, cardC, alta.id);
    const archived = await seedPipeline("Archivado", "CUSTOM", [{ name: "Nueva" }]);
    await getDb().update(pipeline).set({ isArchived: true }).where(eq(pipeline.id, archived.id));

    const groupId = await seedWorkGroup(termId, "GT de prueba");
    await seedCall(termId, groupId, { title: "Abierta", capacity: 3 });
    await seedCall(termId, groupId, { title: "Cerrada", status: "CLOSED" });
    await seedCall(termId, groupId, {
      title: "Futura",
      opensAt: new Date(Date.now() + 86_400_000),
      closesAt: new Date(Date.now() + 2 * 86_400_000),
    });

    const board = await dashboardForAdmin(admin, termId);
    expect(board.myTasks.total).toBe(2);
    expect(board.myTasks.rows.map((row) => row.title)).toEqual(["Mía vencida", "Mía"]);
    expect(board.overdueTasks.total).toBe(2);
    expect(board.overdueTasks.rows.map((row) => row.title)).toEqual([
      "Mía vencida",
      "De otra persona, vencida",
    ]);
    expect(board.overdueTasks.rows[1]).toMatchObject({ assigneeName: "Persona Sintética" });
    expect(board.pendingRequests).toBe(1);
    expect(board.boards).toHaveLength(1);
    expect(board.boards[0]).toMatchObject({
      name: "Admisión",
      stages: [
        { name: "Recibida", open: 1 },
        { name: "Entrevista", open: 1 },
      ],
    });
    expect(board.openCalls.map((call) => call.title)).toEqual(["Abierta"]);
    expect(board.openCalls[0]).toMatchObject({ capacity: 3, entries: 0, accepted: 0 });

    // Sin término vigente no hay convocatorias que mostrar.
    expect((await dashboardForAdmin(admin, null)).openCalls).toEqual([]);
  });

  it("cuenta solo los trabajos que agotaron sus intentos", async () => {
    await getDb()
      .insert(outbox)
      .values([
        { eventType: "x.pending", payload: {} },
        { eventType: "x.dead", payload: {}, deadLetterAt: new Date(), attempts: 5 },
        { eventType: "x.done", payload: {}, processedAt: new Date() },
      ]);
    expect(await countDeadLetters()).toBe(1);
  });
});
