import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  anonymizePersonAs,
  applyRosterImportAs,
  createRosterPreviewAs,
  endMembershipAs,
  lockMembershipCycle,
  requestDeletionAs,
} from "@/modules/people";
import { anonymizePerson } from "@/modules/people/domain/membership";
import { membership, person } from "@/modules/people/schema";
import { seedMember, seedTerm } from "../factories";
import { holdCommand, holdTransaction, outcome, waitingForLock, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";

// ADR-120 regla 3: el roster toma a cada persona en el orden del ciclo de membresía, primero el
// consultivo `wallet-member:<persona>` y después su fila. Antes tomaba la fila y recién después, al dar
// de baja o cambiar el estado, el consultivo: cruzado con anonimizar, que siempre fue consultivo y
// después fila, las dos se quedaban esperándose (DT-290).

const db = () => getDb();

const EMAIL = "prueba.sale@eafit.edu.co";
const OTRA = "prueba.sigue@eafit.edu.co";

async function escenario(lines: string[]) {
  const termId = await seedTerm();
  const admin = { personId: await seedMember("admin.roster@eafit.edu.co"), ip: null };
  const sale = await seedMember(EMAIL);
  const sigue = await seedMember(OTRA);
  await requestDeletionAs({ personId: sale, ip: null });
  const bytes = new TextEncoder().encode(`${["CORREO;ESTADO", ...lines].join("\r\n")}\r\n`);
  const { jobId } = await createRosterPreviewAs(admin, {
    filename: "estados.csv",
    contentType: "text/csv",
    bytes,
    termId,
  });
  return { admin, sale, sigue, jobId };
}

async function comoQuedo(personId: string) {
  const [row] = await db()
    .select({
      anonymizedAt: person.anonymizedAt,
      status: membership.status,
    })
    .from(person)
    .innerJoin(membership, eq(membership.personId, person.id))
    .where(eq(person.id, personId));
  return { anonimizada: row?.anonymizedAt != null, estado: row?.status };
}

const conEseCorreo = () =>
  db().select({ id: person.id }).from(person).where(eq(person.email, EMAIL));

const hacenCola = (pid: number, cuantas: number) =>
  vi.waitFor(async () => expect(await waitingOn(pid)).toBe(cuantas), { timeout: 5_000 });

describe("importar el roster y anonimizar a la misma persona", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  it("cruzadas, la anonimización primera en la cola del candado del ciclo y el roster ya en esa persona, terminan las dos", async () => {
    const { admin, sale, jobId } = await escenario([`${EMAIL};Retirado`]);
    // Alguien retiene el candado del ciclo de membresía de la persona: detrás hace cola primero la
    // anonimización y después el roster, que con el orden viejo ya traía tomada la fila de `person`.
    const held = await holdTransaction((tx) => lockMembershipCycle(tx, sale));
    let results: PromiseSettledResult<unknown>[];
    try {
      const anonymizing = anonymizePersonAs(admin, sale);
      await hacenCola(held.pid, 1);
      const importing = applyRosterImportAs(admin, jobId);
      await hacenCola(held.pid, 2);
      held.release();
      results = await Promise.allSettled([anonymizing, importing]);
    } finally {
      held.release();
      await held.done;
    }

    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    // Entró primero la anonimización: el roster ya no encuentra a nadie con ese correo y no la recrea.
    expect(await comoQuedo(sale)).toEqual({ anonimizada: true, estado: "INACTIVE" });
    expect(await conEseCorreo()).toEqual([]);
  });

  it("si el roster ya pasó por la persona, la anonimización espera a que la importación confirme y la anonimiza", async () => {
    const { admin, sale, sigue, jobId } = await escenario([`${EMAIL};Retirado`, `${OTRA};Activo`]);
    // El roster da de baja a la primera persona y se queda esperando la fila de la segunda, que
    // alguien retiene: la importación es una sola transacción y conserva lo que ya tomó.
    const held = await holdTransaction((tx) =>
      tx.select({ id: person.id }).from(person).where(eq(person.id, sigue)).for("update"),
    );
    let results: PromiseSettledResult<unknown>[];
    try {
      const importing = applyRosterImportAs(admin, jobId);
      await hacenCola(held.pid, 1);
      const anonymizing = anonymizePersonAs(admin, sale);
      await vi.waitFor(async () => expect(await waitingForLock()).toBe(2), { timeout: 5_000 });
      held.release();
      results = await Promise.allSettled([importing, anonymizing]);
    } finally {
      held.release();
      await held.done;
    }

    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    // A quien sigue activa el roster le escribe por primera vez la fila del término: esa fila también
    // se cuenta por lo que escribió (ADR-120 regla 2).
    expect(results[0]).toMatchObject({ value: { updated: 2, unchanged: 0 } });
    expect(await comoQuedo(sale)).toEqual({ anonimizada: true, estado: "INACTIVE" });
    expect(await comoQuedo(sigue)).toEqual({ anonimizada: false, estado: "ACTIVE" });
  });

  it("si la anonimización ya está escrita, el roster espera a que confirme, no encuentra a nadie con ese correo y no la recrea", async () => {
    const { admin, sale, jobId } = await escenario([`${EMAIL};Retirado`]);
    const held = await holdCommand(admin, (ctx) => anonymizePerson(ctx, sale));
    let result: PromiseSettledResult<unknown>;
    try {
      const importing = applyRosterImportAs(admin, jobId);
      await hacenCola(held.pid, 1);
      held.release();
      [result] = await Promise.allSettled([importing]);
    } finally {
      held.release();
      await held.done;
    }

    expect(outcome(result)).toBe("ok");
    expect(result).toMatchObject({ value: { created: 0, updated: 0, unchanged: 1 } });
    expect(await comoQuedo(sale)).toEqual({ anonimizada: true, estado: "INACTIVE" });
    expect(await conEseCorreo()).toEqual([]);
  });
});

// ADR-120 regla 3, la fila de quien actúa: GH figura en el roster. Quien da de baja o anonimiza a
// alguien deja su `id` como actor en lo que escribe (`membership_event`, `audit_log`), y esa clave
// foránea pide la fila de quien actúa. Si esa persona figura antes en el archivo, el roster ya la
// tiene tomada y espera el consultivo de la siguiente: con la fila en `for update` los dos se
// quedaban esperándose, bastaba con que la persona figurara en el archivo.
describe("importar el roster mientras actúa alguien que figura antes en el archivo", () => {
  beforeEach(truncateAll);
  afterAll(() => closeDb());

  const IMPORTA = "prueba.importa@eafit.edu.co";
  const ACTUA = "prueba.actua@eafit.edu.co";

  /** Quien importa, quien actúa y la persona sobre la que actúa, en ese orden en el archivo. */
  async function conQuienActuaAdentro(header: string, cell: (email: string) => string) {
    const termId = await seedTerm();
    const importa = { personId: await seedMember(IMPORTA), ip: null };
    const actua = { personId: await seedMember(ACTUA), ip: null };
    const sale = await seedMember(EMAIL);
    await requestDeletionAs({ personId: sale, ip: null });
    const lines = [IMPORTA, ACTUA, EMAIL].map((email) => `${email};${cell(email)}`);
    const bytes = new TextEncoder().encode(`${[header, ...lines].join("\r\n")}\r\n`);
    const { jobId } = await createRosterPreviewAs(importa, {
      filename: "todos.csv",
      contentType: "text/csv",
      bytes,
      termId,
    });
    return { importa, actua, sale, jobId };
  }

  /**
   * Alguien retiene el consultivo de la persona: detrás hace cola primero el comando de quien actúa
   * y después el roster, que ya pasó por la fila de quien actúa. Al soltarlo entra el comando.
   */
  async function cruzadas(
    sale: string,
    command: () => Promise<unknown>,
    jobId: string,
    importa: { personId: string; ip: null },
  ) {
    const held = await holdTransaction((tx) => lockMembershipCycle(tx, sale));
    try {
      const acting = command();
      await hacenCola(held.pid, 1);
      const importing = applyRosterImportAs(importa, jobId);
      await hacenCola(held.pid, 2);
      held.release();
      return await Promise.allSettled([acting, importing]);
    } finally {
      held.release();
      await held.done;
    }
  }

  it("dar de baja a la persona siguiente no se cruza con la importación: terminan las dos", async () => {
    // Sin ESTADO el roster no le toca el estado a nadie: la baja queda como la dejó el comando.
    const { importa, actua, sale, jobId } = await conQuienActuaAdentro("CORREO;PREGRADO", () => "");

    const results = await cruzadas(
      sale,
      () =>
        endMembershipAs(actua, sale, {
          endReason: "RESIGNATION",
          memorialConsent: false,
          contactConsent: false,
        }),
      jobId,
      importa,
    );

    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    expect(results[1]).toMatchObject({ value: { created: 0, updated: 0, unchanged: 3 } });
    expect(await comoQuedo(sale)).toEqual({ anonimizada: false, estado: "INACTIVE" });
  });

  it("anonimizar a la persona siguiente no se cruza con la importación: terminan las dos", async () => {
    const { importa, actua, sale, jobId } = await conQuienActuaAdentro("CORREO;ESTADO", (email) =>
      email === EMAIL ? "Retirado" : "Activo",
    );

    const results = await cruzadas(sale, () => anonymizePersonAs(actua, sale), jobId, importa);

    expect(results.map(outcome)).toEqual(["ok", "ok"]);
    // Entró primero la anonimización: el roster ya no encuentra a nadie con ese correo. A las otras
    // dos, que figuran activas, les escribe por primera vez la fila del término (ADR-120 regla 2).
    expect(results[1]).toMatchObject({ value: { created: 0, updated: 2, unchanged: 1 } });
    expect(await comoQuedo(sale)).toEqual({ anonimizada: true, estado: "INACTIVE" });
    expect(await conEseCorreo()).toEqual([]);
  });
});
