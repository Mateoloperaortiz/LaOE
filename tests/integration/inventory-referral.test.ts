import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent, runCommand, SYSTEM_ACTOR } from "@/db/tx";
import { eventOf } from "@/domain-events/define";
import { inventoryIncidentReferred } from "@/domain-events/inventory";
import { listTasks } from "@/modules/crm";
import { tasksResource } from "@/modules/crm/admin";
import { openTaskForReasonAs } from "@/modules/crm/domain/commands";
import { completeTask } from "@/modules/crm/domain/tasks";
import { task } from "@/modules/crm/schema";
import { sanction } from "@/modules/people/schema";
import { seedMember, seedTerm } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

describe("Remisión de novedades de inventario", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("abre una tarea enlazada a la incidencia y la persona, sin imponer una sanción", async () => {
    const termId = await seedTerm();
    const personId = await seedMember("inventario.responsable@eafit.edu.co");
    const actorId = await seedMember("inventario.vp@eafit.edu.co");
    const payload = {
      incidentId: "incidencia-ficticia",
      reservationId: "reserva-ficticia",
      personId,
      actorId,
      termId,
      committeeId: null,
    };
    await enqueueEvent(getDb(), eventOf(inventoryIncidentReferred, payload));
    await drainOutbox();
    const { rows } = await listTasks({ q: "", page: 1, pageSize: 20 });
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toMatchObject({
      kind: "INVENTORY_INCIDENT",
      personId,
      assigneeId: null,
      dueAt: null,
      inventoryIncidentId: payload.incidentId,
    });
    if (!row) throw new Error("Falta la tarea de la incidencia");
    expect(
      tasksResource.columns.find((column) => column.key === "kind")?.render?.(row),
    ).toMatchObject({
      href: `/admin/inventario?incidencia=incidencia-ficticia&persona=${personId}`,
    });
    expect(await getDb().select().from(sanction)).toHaveLength(0);
    await runCommand(SYSTEM_ACTOR, (ctx) => completeTask(ctx, row.id));
    await enqueueEvent(getDb(), eventOf(inventoryIncidentReferred, payload));
    await drainOutbox();
    expect(await getDb().select().from(task)).toMatchObject([{ id: row.id, status: "DONE" }]);
    expect(await getDb().select().from(sanction)).toHaveLength(0);
  });

  it("dos remisiones concurrentes conservan una tarea por incidencia incluso completada", async () => {
    await warmPool();
    const personId = await seedMember("inventario.concurrente@eafit.edu.co");
    const input = {
      reason: { type: "INVENTORY_INCIDENT" as const, personId, incidentId: "incidencia-unica" },
      title: "Revisar novedad",
      assigneeId: null,
      due: null,
      requestedById: personId,
    };
    const results = await Promise.all(
      Array.from({ length: 12 }, () => openTaskForReasonAs(SYSTEM_ACTOR, input)),
    );
    expect(new Set(results.map((row) => row.id)).size).toBe(1);
    const first = results[0];
    if (!first) throw new Error("Falta la tarea concurrente");
    await runCommand(SYSTEM_ACTOR, (ctx) => completeTask(ctx, first.id));
    expect(await openTaskForReasonAs(SYSTEM_ACTOR, input)).toEqual({
      id: first.id,
      created: false,
    });
    await openTaskForReasonAs(SYSTEM_ACTOR, {
      ...input,
      reason: { ...input.reason, incidentId: "otra-incidencia" },
    });
    expect(await getDb().select().from(task).where(eq(task.personId, personId))).toHaveLength(2);
  });
});
