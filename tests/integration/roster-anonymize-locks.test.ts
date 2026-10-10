import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  anonymizePersonAs,
  applyRosterImportAs,
  createRosterPreviewAs,
  lockWalletMember,
  requestDeletionAs,
} from "@/modules/people";
import { anonymizePerson } from "@/modules/people/domain/membership";
import { membership, person } from "@/modules/people/schema";
import { holdCommand, holdTransaction, outcome, waitingForLock, waitingOn } from "../helpers/locks";
import { truncateAll } from "./db";
import { seedMember, seedTerm } from "./factories";

// ADR-120 regla 3: el roster toma a cada persona en el orden del ciclo de membresía, primero el
// consultivo `wallet-member:<persona>` y después su fila. Antes tomaba la fila y recién después, al dar
// de baja o cambiar el estado, el consultivo: cruzado con anonimizar, que siempre fue consultivo y
// después fila, las dos se quedaban esperándose (DT-290).

const db = () => getDb();

const EMAIL = "prueba.sale@eafit.edu.co";
const OTRA = "prueba.sigue@eafit.edu.co";

async function escenario(lines: string[]) {
  const termId = await seedTerm();
  const admin = { personId: await seedMember("admin.roster@eafit.edu.co") };
  const sale = await seedMember(EMAIL);
  const sigue = await seedMember(OTRA);
  await requestDeletionAs({ personId: sale });
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
    const held = await holdTransaction((tx) => lockWalletMember(tx, sale));
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
    expect(results[0]).toMatchObject({ value: { updated: 1, unchanged: 1 } });
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
