import { and, asc, eq, type SQL } from "drizzle-orm";
import pino from "pino";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { enqueueEvent } from "@/db/tx";
import { getHandlers } from "@/jobs/registry";
import {
  completeTaskAs,
  createCardAs,
  createRequestAs,
  createTaskAs,
  moveCardAs,
} from "@/modules/crm";
import { tasksResource } from "@/modules/crm/admin";
import { request, task } from "@/modules/crm/schema";
import { requestCommitteeRemovalAs, requestDeletionAs } from "@/modules/people";
import { membership } from "@/modules/people/schema";
import { requireConfig } from "@/modules/system";
import { auditLog } from "@/modules/system/schema";
import { nextTermCode } from "@/modules/terms";
import { term } from "@/modules/terms/schema";
import { t, tList } from "@/shared/copy";
import { addBusinessDays, bogotaInputToUtc, todayKey } from "@/shared/lib/dates";
import { drainOutbox } from "../helpers/outbox";
import { truncateAll } from "./db";
import {
  currentTermCode,
  seedCommittee,
  seedCommitteeMembership,
  seedMember,
  seedOrganization,
  seedPipeline,
  seedTerm,
  seedVeteran,
} from "./factories";

// Las tareas de GH (DT-007, ADR-115 regla 9). Ocho sitios abren una: cuatro handlers de `crm/jobs.ts`
// (pedido de borrado, pedido de retiro de un comité, término siguiente sin crear, licencia vencida),
// la solicitud del miembro, el patrocinio ganado y las dos entradas de la creación a mano (las fichas y
// el recurso del kit). Acá queda qué tarea abre cada uno y qué quiere decir «una sola por motivo».

const db = () => getDb();
// Lo que hoy falla a propósito (`it.fails`): cada defecto de DT-007, escrito como la conducta que se
// espera. El arreglo de #148 las pasa a pruebas corrientes.
const defecto = it.fails;
const director = { isAdmin: false, allCapabilities: false };
const MINUTE = 60_000;

/** El vencimiento se calcula con el reloj del handler: se compara con un minuto de margen. */
function near(actual: Date | null | undefined, expected: Date): boolean {
  return actual != null && Math.abs(actual.getTime() - expected.getTime()) < MINUTE;
}

function tasksOf(where: SQL) {
  return db().select().from(task).where(where).orderBy(asc(task.createdAt), asc(task.id));
}

function openTasks() {
  return tasksOf(eq(task.status, "OPEN"));
}

/** La auditoría de una tarea: qué quedó escrito y a nombre de quién. */
function auditsOf(taskId: string) {
  return db()
    .select({ action: auditLog.action, actorId: auditLog.actorId })
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "task"), eq(auditLog.entityId, taskId)));
}

/** Lo que hace el poller con un evento, sin el poller: sus handlers registrados, con su contexto. */
async function handle(type: string, payload: Record<string, unknown>, id: string): Promise<void> {
  const log = pino({ level: "silent" });
  for (const handler of getHandlers(type)) {
    await handler(payload, { id, attempt: 1, log });
  }
}

async function leaveCheck(): Promise<void> {
  await enqueueEvent(db(), { type: "membership.leave-check", payload: {} });
  await drainOutbox();
}

async function termCheck(): Promise<void> {
  await enqueueEvent(db(), { type: "participation.term-check", payload: {} });
  await drainOutbox();
}

/** Un comité con su directora de GH (capacidad `ROSTER`) y una veterana que está en dos comités. */
async function committeeFixture() {
  const termId = await seedTerm();
  const a3 = await seedCommittee("a3", "A3");
  const pixel = await seedCommittee("pixel", "PIXEL");
  const gh = await seedMember("gh@eafit.edu.co", { firstName: "Gema", lastName: "Humana" });
  const member = await seedVeteran("miembro@eafit.edu.co", {
    firstName: "Mila",
    lastName: "Miembro",
  });
  await seedCommitteeMembership(gh, a3, termId, "GESTION_HUMANA");
  await seedCommitteeMembership(gh, pixel, termId, "GESTION_HUMANA");
  await seedCommitteeMembership(member, a3, termId);
  await seedCommitteeMembership(member, pixel, termId);
  const ask = (committeeId: string, reason: string) =>
    requestCommitteeRemovalAs({ personId: gh }, { committeeId, termId }, director, {
      personId: member,
      reason,
    });
  return { termId, a3, pixel, gh, member, ask };
}

/** Una persona con la licencia vencida: lo que encuentra el programado diario. */
async function expiredLeave(email = "vencida@eafit.edu.co") {
  const personId = await seedMember(email, { firstName: "Vera", lastName: "Vencida" });
  await db()
    .update(membership)
    .set({ status: "ON_LEAVE", leaveUntil: "2026-01-31" })
    .where(eq(membership.personId, personId));
  return personId;
}

/** El término actual termina en diez días y el siguiente no existe. */
async function endingTerm() {
  const code = currentTermCode();
  const termId = await seedTerm(code);
  const endsOn = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  await db().update(term).set({ endsOn }).where(eq(term.id, termId));
  return { termId, code, next: nextTermCode(code), endsOn };
}

/** Una tarjeta de patrocinio con responsable, y la etapa ganada de su pipeline. */
async function sponsorshipCard() {
  const admin = await seedMember("admin@eafit.edu.co");
  const owner = await seedMember("responsable@eafit.edu.co");
  const organizationId = await seedOrganization("Postobón");
  const pipeline = await seedPipeline("Patrocinios", "SPONSORSHIP", [
    { name: "Contacto" },
    { name: "Cerrado", isWon: true },
    { name: "Sin acuerdo", isLost: true },
  ]);
  const [first, won] = pipeline.stages;
  if (!first || !won) throw new Error("etapas");
  const actor = { personId: admin, ip: null };
  const created = await createCardAs(actor, pipeline.id, {
    organizationId,
    title: "Postobón · Días EAFIT",
    ownerId: owner,
  });
  return { actor, admin, owner, organizationId, cardId: created.id, first: first.id, won: won.id };
}

/** Un miembro activo con comité: el que puede pedir una licencia. */
async function activeMember() {
  const termId = await seedTerm();
  const personId = await seedMember("solicita@eafit.edu.co", {
    firstName: "Rita",
    lastName: "Solicita",
  });
  await seedCommitteeMembership(personId, await seedCommittee("a3", "A3"), termId);
  const until = new Date(Date.now() + 60 * 24 * 60 * MINUTE).toISOString().slice(0, 10);
  return { personId, actor: { personId, ip: null }, until };
}

beforeEach(truncateAll);
afterAll(() => closeDb());

describe("qué tarea abre cada sitio", () => {
  it("el pedido de borrado abre una tarea de eliminación sin responsable, a nombre de quien la pidió y a los días hábiles de la configuración", async () => {
    const me = await seedMember("borrar@eafit.edu.co", { firstName: "Bea", lastName: "Borrar" });
    const asked = await requestDeletionAs({ personId: me });
    await drainOutbox();

    const tasks = await tasksOf(eq(task.personId, me));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: t("T-464", { nombre: "Bea Borrar" }),
      kind: "DELETION_REQUEST",
      status: "OPEN",
      assigneeId: null,
      createdById: me,
      organizationId: null,
      cardId: null,
    });
    const days = await requireConfig("privacy.deletionDays");
    expect(near(tasks[0]?.dueAt, addBusinessDays(asked.requestedAt, days))).toBe(true);
  });

  it("el pedido de retiro de un comité abre una tarea sin responsable, a nombre de quien lo pidió y con el vencimiento de las solicitudes", async () => {
    const f = await committeeFixture();
    const before = new Date();
    await f.ask(f.a3, "No volvió a las reuniones");
    await drainOutbox();

    const tasks = await tasksOf(eq(task.personId, f.member));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: t("T-2170", {
        nombre: "Mila Miembro",
        comité: "A3",
        motivo: "No volvió a las reuniones",
      }),
      kind: "COMMITTEE_REMOVAL",
      status: "OPEN",
      assigneeId: null,
      createdById: f.gh,
      organizationId: null,
      cardId: null,
    });
    const days = await requireConfig("requests.taskDays");
    expect(near(tasks[0]?.dueAt, addBusinessDays(before, days))).toBe(true);
  });

  it("el término siguiente sin crear abre una tarea general sin responsable ni persona, que vence el día en que termina el actual", async () => {
    const { next, endsOn } = await endingTerm();
    await termCheck();

    const tasks = await openTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: t("T-666", { codigo: next, fecha: endsOn }),
      kind: "GENERAL",
      assigneeId: null,
      personId: null,
      createdById: null,
      organizationId: null,
      cardId: null,
    });
    expect(tasks[0]?.dueAt?.toISOString()).toBe(`${endsOn}T12:00:00.000Z`);
  });

  it("la licencia vencida abre una tarea sin responsable que vence hoy a las nueve de la mañana de Colombia, auditada a nombre del sistema", async () => {
    const personId = await expiredLeave();
    await leaveCheck();

    const tasks = await tasksOf(eq(task.personId, personId));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: t("T-2277", { nombre: "Vera Vencida", fecha: "31 de enero de 2026" }),
      kind: "LEAVE_EXPIRED",
      status: "OPEN",
      assigneeId: null,
      createdById: null,
      organizationId: null,
      cardId: null,
    });
    expect(tasks[0]?.dueAt).toEqual(bogotaInputToUtc(`${todayKey()}T09:00`));
    expect(await auditsOf(tasks[0]?.id ?? "")).toEqual([{ action: "task.created", actorId: null }]);
  });

  it("la solicitud de un miembro abre su tarea en la misma transacción, sin responsable, a su nombre y con el vencimiento de las solicitudes", async () => {
    const { personId, actor, until } = await activeMember();
    const before = new Date();
    const created = await createRequestAs(actor, "LEAVE", { reason: "Intercambio", until });

    const tasks = await tasksOf(eq(task.personId, personId));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: t("T-1009", { nombre: "Rita Solicita", tipo: tList("T-894")[0] }),
      kind: "REQUEST",
      status: "OPEN",
      assigneeId: null,
      createdById: personId,
      organizationId: null,
      cardId: null,
    });
    const days = await requireConfig("requests.taskDays");
    expect(near(tasks[0]?.dueAt, addBusinessDays(before, days))).toBe(true);
    const [row] = await db()
      .select({ taskId: request.taskId })
      .from(request)
      .where(eq(request.id, created.id));
    expect(row?.taskId).toBe(tasks[0]?.id);
  });

  it("el patrocinio ganado abre una tarea de seguimiento al responsable de la tarjeta, sobre la organización y la tarjeta, sin vencimiento", async () => {
    const f = await sponsorshipCard();
    await moveCardAs(f.actor, f.cardId, f.won);

    const tasks = await tasksOf(eq(task.cardId, f.cardId));
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      title: t("T-994", { organización: "Postobón" }),
      kind: "GENERAL",
      status: "OPEN",
      assigneeId: f.owner,
      organizationId: f.organizationId,
      personId: null,
      createdById: f.admin,
      dueAt: null,
    });
  });

  it("una tarea creada a mano desde una ficha queda con lo que se escribió, a nombre de quien la creó y auditada", async () => {
    const admin = await seedMember("admin@eafit.edu.co");
    const personId = await seedMember("ficha@eafit.edu.co");
    const created = await createTaskAs(
      { personId: admin, ip: null },
      {
        title: "Llamar a la mamá",
        kind: "GENERAL",
        assigneeId: admin,
        personId,
        dueAt: "2026-10-20T09:00",
      },
    );

    const [row] = await tasksOf(eq(task.id, created.id));
    expect(row).toMatchObject({
      title: "Llamar a la mamá",
      kind: "GENERAL",
      status: "OPEN",
      assigneeId: admin,
      personId,
      createdById: admin,
      dueAt: bogotaInputToUtc("2026-10-20T09:00"),
    });
    expect(await auditsOf(created.id)).toEqual([{ action: "task.created", actorId: admin }]);
  });

  it("dos tareas iguales creadas a mano son dos tareas: la creación a mano no busca una abierta", async () => {
    const admin = await seedMember("admin@eafit.edu.co");
    const personId = await seedMember("ficha@eafit.edu.co");
    const actor = { personId: admin, ip: null };
    const input = { title: "Llamar a la mamá", kind: "GENERAL" as const, personId };
    await createTaskAs(actor, input);
    await createTaskAs(actor, input);
    const fromKit = await tasksResource.create?.({ personId: admin, isAdmin: true }, input);

    const tasks = await tasksOf(eq(task.personId, personId));
    expect(tasks).toHaveLength(3);
    expect(await auditsOf(fromKit?.id ?? "")).toEqual([{ action: "task.created", actorId: admin }]);
  });
});

describe("una sola tarea abierta por motivo", () => {
  it("el mismo pedido de retiro repetido no abre otra tarea, y el de otro comité sí", async () => {
    const f = await committeeFixture();
    await f.ask(f.a3, "No volvió a las reuniones");
    await drainOutbox();
    await f.ask(f.a3, "No volvió a las reuniones");
    await drainOutbox();
    expect(await tasksOf(eq(task.personId, f.member))).toHaveLength(1);

    await f.ask(f.pixel, "No volvió a las reuniones");
    await drainOutbox();
    expect(await tasksOf(eq(task.personId, f.member))).toHaveLength(2);
  });

  it("una tarea hecha ya no cuenta: si la licencia sigue vencida, el programado abre otra", async () => {
    const personId = await expiredLeave();
    await leaveCheck();
    const [first] = await tasksOf(eq(task.personId, personId));
    await completeTaskAs({ personId: null }, first?.id ?? "");
    await leaveCheck();
    await leaveCheck();

    const tasks = await tasksOf(eq(task.personId, personId));
    expect(tasks.map((row) => row.status).sort()).toEqual(["DONE", "OPEN"]);
  });

  it("cada persona con la licencia vencida tiene su tarea", async () => {
    const one = await expiredLeave("una@eafit.edu.co");
    const other = await expiredLeave("otra@eafit.edu.co");
    await leaveCheck();
    await leaveCheck();

    const tasks = await openTasks();
    expect(tasks.map((row) => row.personId).sort()).toEqual([one, other].sort());
  });

  defecto(
    "un pedido de retiro no abre otra tarea porque el texto de su título haya cambiado",
    async () => {
      const f = await committeeFixture();
      await f.ask(f.a3, "No volvió a las reuniones");
      await drainOutbox();
      // Como si T-2170 se hubiera reescrito entre un pedido y el siguiente.
      await db()
        .update(task)
        .set({ title: "El texto de antes" })
        .where(eq(task.personId, f.member));
      await f.ask(f.a3, "No volvió a las reuniones");
      await drainOutbox();

      expect(await tasksOf(eq(task.personId, f.member))).toHaveLength(1);
    },
  );

  defecto(
    "otro pedido de retiro del mismo comité con otro motivo escrito no abre otra tarea mientras la primera siga abierta",
    async () => {
      const f = await committeeFixture();
      await f.ask(f.a3, "No volvió a las reuniones");
      await drainOutbox();
      await f.ask(f.a3, "Tampoco responde los mensajes");
      await drainOutbox();

      expect(await tasksOf(eq(task.personId, f.member))).toHaveLength(1);
    },
  );

  defecto(
    "el aviso del término siguiente no abre otra tarea porque el texto de su título haya cambiado",
    async () => {
      await endingTerm();
      await termCheck();
      await db().update(task).set({ title: "El texto de antes" });
      await termCheck();

      expect(await openTasks()).toHaveLength(1);
    },
  );

  defecto(
    "volver a ganar un patrocinio con el seguimiento todavía abierto no abre otra tarea",
    async () => {
      const f = await sponsorshipCard();
      await moveCardAs(f.actor, f.cardId, f.won);
      await moveCardAs(f.actor, f.cardId, f.first);
      await moveCardAs(f.actor, f.cardId, f.won);

      expect(await tasksOf(eq(task.cardId, f.cardId))).toHaveLength(1);
    },
  );

  defecto("cuatro revisiones de licencias a la vez abren una sola tarea por persona", async () => {
    const personId = await expiredLeave();
    await Promise.all(
      [1, 2, 3, 4].map((n) => handle("membership.leave-check", {}, `revision-${n}`)),
    );

    expect(await tasksOf(eq(task.personId, personId))).toHaveLength(1);
  });

  defecto("cuatro avisos del término siguiente a la vez abren una sola tarea", async () => {
    const { termId, code, next, endsOn } = await endingTerm();
    await Promise.all(
      [1, 2, 3, 4].map((n) =>
        handle("term.successor-missing", { termId, code, next, endsOn }, `aviso-${n}`),
      ),
    );

    expect(await openTasks()).toHaveLength(1);
  });
});

describe("toda tarea que abre el sistema queda auditada", () => {
  defecto("la del pedido de borrado, a nombre del sistema", async () => {
    const me = await seedMember("borrar@eafit.edu.co");
    await requestDeletionAs({ personId: me });
    await drainOutbox();

    const [opened] = await tasksOf(eq(task.personId, me));
    expect(await auditsOf(opened?.id ?? "")).toEqual([{ action: "task.created", actorId: null }]);
  });

  defecto("la del pedido de retiro de un comité, a nombre del sistema", async () => {
    const f = await committeeFixture();
    await f.ask(f.a3, "No volvió a las reuniones");
    await drainOutbox();

    const [opened] = await tasksOf(eq(task.personId, f.member));
    expect(await auditsOf(opened?.id ?? "")).toEqual([{ action: "task.created", actorId: null }]);
  });

  defecto("la del término siguiente sin crear, a nombre del sistema", async () => {
    await endingTerm();
    await termCheck();

    const [opened] = await openTasks();
    expect(await auditsOf(opened?.id ?? "")).toEqual([{ action: "task.created", actorId: null }]);
  });

  defecto("la de una solicitud, a nombre de quien la pidió", async () => {
    const { personId, actor, until } = await activeMember();
    await createRequestAs(actor, "LEAVE", { reason: "Intercambio", until });

    const [opened] = await tasksOf(eq(task.personId, personId));
    expect(await auditsOf(opened?.id ?? "")).toEqual([
      { action: "task.created", actorId: personId },
    ]);
  });

  defecto("la del patrocinio ganado, a nombre de quien movió la tarjeta", async () => {
    const f = await sponsorshipCard();
    await moveCardAs(f.actor, f.cardId, f.won);

    const [opened] = await tasksOf(eq(task.cardId, f.cardId));
    expect(await auditsOf(opened?.id ?? "")).toEqual([
      { action: "task.created", actorId: f.admin },
    ]);
  });
});
