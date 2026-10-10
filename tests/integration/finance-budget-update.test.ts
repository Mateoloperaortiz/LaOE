import { and, eq, isNull } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import { approveBudgetAs, closeBudgetAs, openBudgetAs, setBudgetLinesAs } from "@/modules/finance";
import { budgetsResource } from "@/modules/finance/admin";
import { auditLog, outbox } from "@/modules/system/schema";
import { t } from "@/shared/copy";
import { DomainError } from "@/shared/lib/errors";
import { truncateAll } from "./db";
import { seedCommittee, seedMember } from "./factories";

// Caracterización de `updateBudgetAs` (DT-147) por su única puerta, el recurso Presupuestos del kit
// (`budgetsResource.update`): en borrador se edita todo; abierto o cerrado, solo notas, actividad y
// «presentado el». Dos conductas quedan fijadas como están hoy porque esperan la decisión abierta 58
// (DT-149 inciso d): la auditoría no guarda el valor anterior de lo que cambia y un presupuesto cerrado
// sigue aceptando cambios.

type BudgetInput = Parameters<NonNullable<typeof budgetsResource.update>>[2];

const db = () => getDb();
const actor = (personId: string) => ({ personId, ip: null });

function create(personId: string, input: BudgetInput): Promise<{ id: string }> {
  if (!budgetsResource.create) {
    throw new Error("El recurso de presupuestos ya no crea");
  }
  return budgetsResource.create(actor(personId), input);
}

function update(personId: string, id: string, input: BudgetInput): Promise<void> {
  if (!budgetsResource.update) {
    throw new Error("El recurso de presupuestos ya no edita");
  }
  return budgetsResource.update(actor(personId), id, input);
}

async function updatesOf(id: string) {
  return db()
    .select({ actorId: auditLog.actorId, before: auditLog.before, after: auditLog.after })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.entityType, "committee_budget"),
        eq(auditLog.entityId, id),
        eq(auditLog.action, "budget.updated"),
      ),
    );
}

function pendingEvents() {
  return db()
    .select({ eventType: outbox.eventType })
    .from(outbox)
    .where(isNull(outbox.processedAt));
}

async function fixture() {
  const admin = await seedMember("admin@eafit.edu.co");
  const a3 = await seedCommittee("c9-a3", "A3");
  const pixel = await seedCommittee("c9-pixel", "Pixel");
  return { admin, a3, pixel };
}

type Fixture = Awaited<ReturnType<typeof fixture>>;

async function draft(f: Fixture, overrides: Partial<BudgetInput> = {}): Promise<string> {
  const { id } = await create(f.admin, {
    committeeId: f.a3,
    year: 2026,
    notes: "Nota inicial",
    submittedOn: "2026-01-05",
    ...overrides,
  });
  return id;
}

async function opened(f: Fixture, overrides: Partial<BudgetInput> = {}): Promise<string> {
  const id = await draft(f, overrides);
  await setBudgetLinesAs(actor(f.admin), id, {
    lines: [{ name: "Logística", assigned: 1000, sortOrder: 1 }],
  });
  await approveBudgetAs(actor(f.admin), id, { approver: "STUDENT_DEVELOPMENT", on: "2026-01-09" });
  await approveBudgetAs(actor(f.admin), id, { approver: "VP_FINANCE", on: "2026-01-10" });
  await openBudgetAs(actor(f.admin), id);
  return id;
}

async function closed(f: Fixture): Promise<string> {
  const id = await opened(f);
  await closeBudgetAs(actor(f.admin), id);
  return id;
}

describe("la edición de un presupuesto (updateBudgetAs)", () => {
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-13T12:00:00Z"));
    await truncateAll();
  });
  afterEach(() => vi.useRealTimers());
  afterAll(() => closeDb());

  it("en borrador se edita todo: comité, año, tipo, actividad, notas y «presentado el», con su auditoría y sin evento", async () => {
    const f = await fixture();
    const id = await draft(f);

    await update(f.admin, id, {
      committeeId: f.pixel,
      year: 2027,
      kind: "EXTRAORDINARY",
      title: "  Feria de proyectos  ",
      notes: "  Nota nueva  ",
      submittedOn: "2026-02-01",
    });

    expect(await budgetsResource.get(id)).toMatchObject({
      committeeId: f.pixel,
      committeeName: "Pixel",
      year: 2027,
      kind: "EXTRAORDINARY",
      title: "Feria de proyectos",
      notes: "Nota nueva",
      submittedOn: "2026-02-01",
      status: "DRAFT",
    });
    const [audit, ...more] = await updatesOf(id);
    expect(more).toEqual([]);
    expect(audit).toMatchObject({
      actorId: f.admin,
      after: {
        committeeId: f.pixel,
        year: 2027,
        kind: "EXTRAORDINARY",
        title: "Feria de proyectos",
        notes: "Nota nueva",
        submittedOn: "2026-02-01",
      },
    });
    expect(await pendingEvents()).toEqual([]);
  });

  it("en borrador un ordinario no lleva actividad aunque llegue, y un extraordinario sin actividad no pasa", async () => {
    const f = await fixture();
    const id = await draft(f);

    await update(f.admin, id, {
      committeeId: f.a3,
      year: 2026,
      kind: "ORDINARY",
      title: "Actividad que sobra",
      notes: "Nota inicial",
      submittedOn: "",
    });
    // «Presentado el» vacío lo deja sin fecha.
    expect(await budgetsResource.get(id)).toMatchObject({ title: "", submittedOn: null });

    await expect(
      update(f.admin, id, { committeeId: f.a3, year: 2026, kind: "EXTRAORDINARY", title: " " }),
    ).rejects.toThrow();
    expect(await budgetsResource.get(id)).toMatchObject({ kind: "ORDINARY", title: "" });
    expect(await updatesOf(id)).toHaveLength(1);
  });

  it("en borrador, llevar el ordinario a un comité y año que ya tienen el suyo se niega con su texto y no cambia nada", async () => {
    const f = await fixture();
    const id = await draft(f);
    await draft(f, { committeeId: f.pixel, year: 2027 });

    await expect(update(f.admin, id, { committeeId: f.pixel, year: 2027 })).rejects.toEqual(
      new DomainError(t("T-2287", { año: 2027 }), "year"),
    );

    expect(await budgetsResource.get(id)).toMatchObject({
      committeeId: f.a3,
      year: 2026,
      notes: "Nota inicial",
      submittedOn: "2026-01-05",
    });
    expect(await updatesOf(id)).toEqual([]);
  });

  it("abierto solo cambian notas, actividad y «presentado el»: el comité, el año y el tipo que lleguen se ignoran", async () => {
    const f = await fixture();
    const id = await opened(f, { kind: "EXTRAORDINARY", title: "Feria de proyectos" });

    await update(f.admin, id, {
      committeeId: f.pixel,
      year: 2027,
      kind: "EXTRAORDINARY",
      title: "Feria de emprendimiento",
      notes: "Nota con el presupuesto abierto",
      submittedOn: "2026-03-01",
    });

    expect(await budgetsResource.get(id)).toMatchObject({
      committeeId: f.a3,
      year: 2026,
      kind: "EXTRAORDINARY",
      status: "OPEN",
      title: "Feria de emprendimiento",
      notes: "Nota con el presupuesto abierto",
      submittedOn: "2026-03-01",
    });
    expect((await updatesOf(id)).map((row) => row.after)).toEqual([
      {
        title: "Feria de emprendimiento",
        notes: "Nota con el presupuesto abierto",
        submittedOn: "2026-03-01",
      },
    ]);
    expect(await pendingEvents()).toEqual([]);

    // Si la edición llega como ordinaria, sin actividad, el extraordinario conserva tipo y actividad.
    await update(f.admin, id, { committeeId: f.pixel, year: 2027, kind: "ORDINARY", notes: "" });
    expect(await budgetsResource.get(id)).toMatchObject({
      committeeId: f.a3,
      year: 2026,
      kind: "EXTRAORDINARY",
      title: "Feria de emprendimiento",
      notes: "",
      submittedOn: null,
    });
  });

  it("hoy un ordinario abierto recibe actividad si la edición llega como extraordinaria, aunque un ordinario no la lleva (DT-317)", async () => {
    const f = await fixture();
    const id = await opened(f);

    await update(f.admin, id, {
      committeeId: f.a3,
      year: 2026,
      kind: "EXTRAORDINARY",
      title: "Actividad en un ordinario",
      notes: "Nota inicial",
      submittedOn: "2026-01-05",
    });

    expect(await budgetsResource.get(id)).toMatchObject({
      kind: "ORDINARY",
      status: "OPEN",
      title: "Actividad en un ordinario",
    });
  });

  it("hoy un presupuesto cerrado sigue aceptando cambios de notas y de «presentado el» (DT-149 d, decisión abierta 58)", async () => {
    const f = await fixture();
    const id = await closed(f);

    await update(f.admin, id, {
      committeeId: f.pixel,
      year: 2027,
      notes: "Nota después del cierre",
      submittedOn: "2026-04-15",
    });

    expect(await budgetsResource.get(id)).toMatchObject({
      committeeId: f.a3,
      year: 2026,
      kind: "ORDINARY",
      status: "CLOSED",
      title: "",
      notes: "Nota después del cierre",
      submittedOn: "2026-04-15",
    });
    expect(await updatesOf(id)).toHaveLength(1);
  });

  it("hoy la auditoría de una edición no guarda el valor anterior de «presentado el», del año ni del comité (DT-149 d, decisión abierta 58)", async () => {
    const f = await fixture();
    const borrador = await draft(f);
    const cerrado = await closed({ ...f, a3: f.pixel });

    await update(f.admin, borrador, {
      committeeId: f.pixel,
      year: 2027,
      notes: "Nota nueva",
      submittedOn: "2026-02-01",
    });
    await update(f.admin, cerrado, {
      committeeId: f.pixel,
      year: 2026,
      notes: "Nota inicial",
      submittedOn: "2026-04-15",
    });

    // El antes trae estado, notas y actividad: con él no se reconstruye qué fecha, año o comité había.
    expect((await updatesOf(borrador)).map((row) => row.before)).toEqual([
      { status: "DRAFT", notes: "Nota inicial", title: "" },
    ]);
    expect((await updatesOf(cerrado)).map((row) => row.before)).toEqual([
      { status: "CLOSED", notes: "Nota inicial", title: "" },
    ]);
  });

  it("un presupuesto que no existe se niega con el texto de no encontrado y no deja auditoría", async () => {
    const f = await fixture();

    await expect(update(f.admin, "no-existe", { committeeId: f.a3, year: 2026 })).rejects.toEqual(
      new DomainError(t("T-032")),
    );

    expect(await updatesOf("no-existe")).toEqual([]);
  });

  it("el comando no comprueba quién llama: que sea ADMIN lo exige el kit de /admin (ADR-082 regla 5) y la auditoría guarda a quien llegó", async () => {
    const f = await fixture();
    const id = await draft(f);
    const cualquiera = await seedMember("cualquiera@eafit.edu.co");

    await update(cualquiera, id, { committeeId: f.a3, year: 2026, notes: "Nota de cualquiera" });

    expect(await budgetsResource.get(id)).toMatchObject({ notes: "Nota de cualquiera" });
    expect((await updatesOf(id)).map((row) => row.actorId)).toEqual([cualquiera]);
  });
});
