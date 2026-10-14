import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  ForbiddenError,
  getOrCreateCalendarToken,
  resolveCalendarToken,
  rotateCalendarTokenAs,
} from "@/modules/identity";
import { pruneIdentity } from "@/modules/identity/domain/maintenance";
import { calendarToken } from "@/modules/identity/schema";
import {
  anonymizePersonAs,
  changeMembershipStatusAs,
  endMembershipAs,
  reactivateMembershipAs,
  requestDeletionAs,
} from "@/modules/people";
import { membership } from "@/modules/people/schema";
import { leaveUntilSoon, seedMember } from "../factories";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";

// El token del calendario se retira con la persona (DT-130, ADR-116 regla 15): la baja y la
// anonimización lo borran junto al carnet, la contraseña, los enlaces, las sesiones y los permisos.
// Antes quedaba dormido, porque la ruta exige una membresía activa, y revivía si la persona volvía.

const db = () => getDb();
/** Un token que quedó en la base de quien salió antes de ADR-116 regla 15. */
const LEFTOVER = "anterior-a-la-regla-salida-0001";
const SALIDA = { endReason: "RESIGNATION" as const, memorialConsent: false, contactConsent: false };

function tokensOf(personId: string) {
  return db()
    .select({ token: calendarToken.token })
    .from(calendarToken)
    .where(eq(calendarToken.personId, personId));
}

function barrier() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * Espera a que `count` conexiones hagan cola por un candado; `false` si `settled` termina antes.
 * Cuenta toda sesión de la base que esté esperando, no solo las de esta prueba: vale porque la
 * integración corre en serie, nunca dos corridas a la vez sobre la misma base.
 */
async function queuedForLock(count: number, settled: Promise<unknown>): Promise<boolean> {
  let over = false;
  const finish = () => {
    over = true;
  };
  void settled.then(finish, finish);
  for (let attempt = 0; attempt < 1000 && !over; attempt += 1) {
    const result = await db().execute<{ waiting: number }>(
      sql`select count(*)::int as waiting from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`,
    );
    if ((result.rows[0]?.waiting ?? 0) >= count) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  if (!over) {
    throw new Error(`Ninguna espera llegó a ${count} sesiones en cola por un candado`);
  }
  return false;
}

/**
 * Retiene la fila de la membresía sin cambiarla hasta `release`: quien la quiera escribir espera, y
 * quien lee sin candado sigue viendo el estado de antes.
 */
async function holdMembership(personId: string): Promise<{ release: () => Promise<void> }> {
  const held = barrier();
  const done = barrier();
  const holding = db().transaction(async (tx) => {
    await tx
      .select({ personId: membership.personId })
      .from(membership)
      .where(eq(membership.personId, personId))
      .for("update");
    held.release();
    await done.promise;
  });
  await Promise.race([held.promise, holding]);
  return {
    release: async () => {
      done.release();
      await holding;
    },
  };
}

/** Con lo que la prueba deshace la transacción que retiene el índice. */
class Release extends Error {}

describe("el token del calendario se retira con la persona", () => {
  beforeEach(truncateAll);
  afterAll(closeDb);

  it("la baja borra el token y quien vuelve recibe un enlace nuevo", async () => {
    const board = await seedMember("junta-calendario@eafit.edu.co");
    const personId = await seedMember("se-va-con-calendario@eafit.edu.co");
    const old = await getOrCreateCalendarToken(personId);
    const untouched = await getOrCreateCalendarToken(board);

    await endMembershipAs({ personId: board, ip: null }, personId, SALIDA);
    await drainOutbox();

    expect(await tokensOf(personId)).toEqual([]);
    expect(await resolveCalendarToken(old)).toBeNull();
    // El enlace de quien sigue adentro no se toca.
    expect(await resolveCalendarToken(untouched)).toBe(board);

    await reactivateMembershipAs({ personId: board, ip: null }, personId, {
      reason: "Pidió volver",
    });
    await drainOutbox();

    // Volver no revive el enlace viejo: Ajustes crea otro al abrirse.
    expect(await tokensOf(personId)).toEqual([]);
    const fresh = await getOrCreateCalendarToken(personId);
    expect(fresh).not.toBe(old);
    expect(await resolveCalendarToken(fresh)).toBe(personId);
    expect(await resolveCalendarToken(old)).toBeNull();
  });

  it("la anonimización borra el token y no deja crear otro", async () => {
    const board = await seedMember("junta-calendario@eafit.edu.co");
    const personId = await seedMember("se-borra-con-calendario@eafit.edu.co");
    const old = await getOrCreateCalendarToken(personId);

    await requestDeletionAs({ personId, ip: null });
    await anonymizePersonAs({ personId: board, ip: null }, personId);
    await drainOutbox();

    expect(await tokensOf(personId)).toEqual([]);
    expect(await resolveCalendarToken(old)).toBeNull();
    await expect(getOrCreateCalendarToken(personId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rotateCalendarTokenAs({ personId, ip: null })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await tokensOf(personId)).toEqual([]);
  });

  it("la licencia conserva el token: la persona vuelve con el mismo enlace", async () => {
    const board = await seedMember("junta-calendario@eafit.edu.co");
    const personId = await seedMember("en-licencia-con-calendario@eafit.edu.co");
    const old = await getOrCreateCalendarToken(personId);

    await changeMembershipStatusAs({ personId: board, ip: null }, personId, {
      to: "ON_LEAVE",
      reason: "Intercambio",
      leaveUntil: leaveUntilSoon(),
    });
    await drainOutbox();
    expect(await tokensOf(personId)).toEqual([{ token: old }]);

    await changeMembershipStatusAs({ personId: board, ip: null }, personId, {
      to: "ACTIVE",
      reason: "Regresó",
    });
    await drainOutbox();
    expect(await getOrCreateCalendarToken(personId)).toBe(old);
  });

  it.each([
    ["crear", (personId: string) => getOrCreateCalendarToken(personId)],
    ["regenerar", (personId: string) => rotateCalendarTokenAs({ personId, ip: null })],
  ] as const)("%s el enlace mientras la persona sale no deja un token después de la baja", async (_case, write) => {
    const board = await seedMember("junta-calendario@eafit.edu.co");
    const personId = await seedMember("sale-a-la-vez@eafit.edu.co");
    await warmPool();

    // Otra transacción ocupa el lugar de la persona en el índice único y no confirma: la escritura
    // del enlace ya leyó la membresía activa y queda esperando justo antes de escribir.
    const held = barrier();
    const release = barrier();
    const holding = db()
      .transaction(async (tx) => {
        await tx
          .insert(calendarToken)
          .values({ personId, token: "retenido-por-la-prueba-00000000" });
        held.release();
        await release.promise;
        throw new Release();
      })
      .catch((error: unknown) => {
        if (!(error instanceof Release)) {
          throw error;
        }
      });
    await Promise.race([held.promise, holding]);

    let writing: Promise<unknown> = Promise.resolve();
    let leaving: Promise<unknown> = Promise.resolve();
    try {
      writing = write(personId);
      void writing.catch(() => {});
      expect(await queuedForLock(1, writing)).toBe(true);
      // La baja y su handler. Sin el candado terminan de una y no encuentran nada que borrar; con
      // él, la baja hace cola detrás de la escritura y su handler borra lo que esta dejó.
      leaving = endMembershipAs({ personId: board, ip: null }, personId, SALIDA).then(() =>
        drainOutbox(),
      );
      void leaving.catch(() => {});
      await queuedForLock(2, leaving);
    } finally {
      release.release();
    }
    await holding;
    await writing;
    await leaving;

    expect(await tokensOf(personId)).toEqual([]);
  });

  // El orden contrario, la escritura detrás de la baja: el candado solo no alcanza, hay que volver a
  // mirar la membresía con él tomado. Sin esa segunda mirada la escritura ya pasó la comprobación
  // previa, entra cuando la baja confirma y deja un token que ningún handler va a borrar.
  it.each([
    ["crear", (personId: string) => getOrCreateCalendarToken(personId)],
    ["regenerar", (personId: string) => rotateCalendarTokenAs({ personId, ip: null })],
  ] as const)("%s el enlace detrás de una baja que ya tomó el candado se rechaza y no escribe nada", async (_case, write) => {
    const board = await seedMember("junta-calendario@eafit.edu.co");
    const personId = await seedMember("sale-primero@eafit.edu.co");
    await warmPool();

    // Otra transacción retiene la fila de la membresía sin cambiarla: la baja toma el candado del
    // ciclo y queda esperando esa fila, y quien lee sin candado sigue viendo una membresía activa.
    const row = await holdMembership(personId);

    let leaving: Promise<unknown> = Promise.resolve();
    let writing: Promise<unknown> = Promise.resolve();
    try {
      leaving = endMembershipAs({ personId: board, ip: null }, personId, SALIDA);
      void leaving.catch(() => {});
      expect(await queuedForLock(1, leaving)).toBe(true);
      writing = write(personId);
      void writing.catch(() => {});
      // La escritura hace cola por el candado, detrás de la baja: si no la hiciera, la prueba no
      // estaría armando el orden que dice.
      expect(await queuedForLock(2, writing)).toBe(true);
    } finally {
      await row.release();
    }
    await leaving;

    await expect(writing).rejects.toBeInstanceOf(ForbiddenError);
    // Antes de que corra el handler de la baja: no hay nada que él tenga que limpiar.
    expect(await tokensOf(personId)).toEqual([]);
    await drainOutbox();
    expect(await tokensOf(personId)).toEqual([]);
  });

  // DT-180: el token de quien salió antes de la regla nunca pasó por el handler de la baja. Lo retira
  // la depuración diaria, que decide cada borrado con el candado del ciclo de membresía tomado.
  it("la depuración diaria retira el token de quien había salido o sido anonimizado antes de la regla", async () => {
    const board = await seedMember("junta-calendario@eafit.edu.co");
    const gone = await seedMember("salio-antes-de-la-regla@eafit.edu.co");
    const erased = await seedMember("anonimizada-antes-de-la-regla@eafit.edu.co");
    const away = await seedMember("en-licencia-con-calendario@eafit.edu.co");
    const kept = await getOrCreateCalendarToken(board);
    const onLeave = await getOrCreateCalendarToken(away);
    await endMembershipAs({ personId: board, ip: null }, gone, SALIDA);
    await requestDeletionAs({ personId: erased, ip: null });
    await anonymizePersonAs({ personId: board, ip: null }, erased);
    await changeMembershipStatusAs({ personId: board, ip: null }, away, {
      to: "ON_LEAVE",
      reason: "Intercambio",
      leaveUntil: leaveUntilSoon(),
    });
    await drainOutbox();
    // Como quedaron quienes salieron antes de la regla: afuera y con su token en la base.
    await db()
      .insert(calendarToken)
      .values([
        { personId: gone, token: LEFTOVER },
        { personId: erased, token: "anterior-a-la-regla-borrado-0001" },
      ]);

    const result = await pruneIdentity();

    expect(await tokensOf(gone)).toEqual([]);
    expect(await tokensOf(erased)).toEqual([]);
    expect(result.calendarTokens).toBe(2);
    expect(await resolveCalendarToken(LEFTOVER)).toBeNull();
    // Quien sigue adentro y quien está en licencia conservan el suyo.
    expect(await resolveCalendarToken(kept)).toBe(board);
    expect(await tokensOf(away)).toEqual([{ token: onLeave }]);

    // Quien vuelve después ya no encuentra el enlace viejo: Ajustes le crea otro.
    await reactivateMembershipAs({ personId: board, ip: null }, gone, { reason: "Pidió volver" });
    await drainOutbox();
    const fresh = await getOrCreateCalendarToken(gone);
    expect(fresh).not.toBe(LEFTOVER);
    expect(await resolveCalendarToken(LEFTOVER)).toBeNull();
    // Otra pasada no encuentra nada que retirar.
    expect((await pruneIdentity()).calendarTokens).toBe(0);
    expect(await resolveCalendarToken(fresh)).toBe(gone);
  });

  // El token no lleva época: la depuración no distingue un enlace viejo de uno recién creado, así que
  // a quien ya volvió no le borra nada. Lo decide con el candado tomado, no con lo que leyó antes.
  it("la depuración no se lleva el enlace de quien vuelve mientras ella corre", async () => {
    const board = await seedMember("junta-calendario@eafit.edu.co");
    const personId = await seedMember("vuelve-durante-la-depuracion@eafit.edu.co");
    await endMembershipAs({ personId: board, ip: null }, personId, SALIDA);
    await drainOutbox();
    await db().insert(calendarToken).values({ personId, token: LEFTOVER });
    await warmPool();

    // La reactivación toma el candado del ciclo y queda esperando la fila de la membresía: la
    // depuración todavía lee a la persona como inactiva y hace cola por el candado para borrar.
    const row = await holdMembership(personId);
    let returning: Promise<unknown> = Promise.resolve();
    let pruning: Promise<{ calendarTokens: number }> = Promise.resolve({ calendarTokens: -1 });
    try {
      returning = reactivateMembershipAs({ personId: board, ip: null }, personId, {
        reason: "Pidió volver",
      });
      void returning.catch(() => {});
      expect(await queuedForLock(1, returning)).toBe(true);
      pruning = pruneIdentity();
      void pruning.catch(() => {});
      expect(await queuedForLock(2, pruning)).toBe(true);
    } finally {
      await row.release();
    }
    await returning;

    expect((await pruning).calendarTokens).toBe(0);
    expect(await tokensOf(personId)).toEqual([{ token: LEFTOVER }]);
  });
});
