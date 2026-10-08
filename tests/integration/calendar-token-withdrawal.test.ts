import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  ForbiddenError,
  getOrCreateCalendarToken,
  resolveCalendarToken,
  rotateCalendarTokenAs,
} from "@/modules/identity";
import { calendarToken } from "@/modules/identity/schema";
import {
  anonymizePersonAs,
  changeMembershipStatusAs,
  endMembershipAs,
  reactivateMembershipAs,
  requestDeletionAs,
} from "@/modules/people";
import { drainOutbox } from "../helpers/outbox";
import { warmPool } from "../helpers/pool";
import { truncateAll } from "./db";
import { leaveUntilSoon, seedMember } from "./factories";

// El token del calendario se retira con la persona (DT-130, ADR-116 regla 15): la baja y la
// anonimización lo borran junto al carnet, la contraseña, los enlaces, las sesiones y los permisos.
// Antes quedaba dormido, porque la ruta exige una membresía activa, y revivía si la persona volvía.

const db = () => getDb();
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

/** Espera a que `count` conexiones hagan cola por un candado; `false` si `settled` termina antes. */
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

    await endMembershipAs({ personId: board }, personId, SALIDA);
    await drainOutbox();

    expect(await tokensOf(personId)).toEqual([]);
    expect(await resolveCalendarToken(old)).toBeNull();
    // El enlace de quien sigue adentro no se toca.
    expect(await resolveCalendarToken(untouched)).toBe(board);

    await reactivateMembershipAs({ personId: board }, personId, { reason: "Pidió volver" });
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

    await requestDeletionAs({ personId });
    await anonymizePersonAs({ personId: board }, personId);
    await drainOutbox();

    expect(await tokensOf(personId)).toEqual([]);
    expect(await resolveCalendarToken(old)).toBeNull();
    await expect(getOrCreateCalendarToken(personId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rotateCalendarTokenAs({ personId })).rejects.toBeInstanceOf(ForbiddenError);
    expect(await tokensOf(personId)).toEqual([]);
  });

  it("la licencia conserva el token: la persona vuelve con el mismo enlace", async () => {
    const board = await seedMember("junta-calendario@eafit.edu.co");
    const personId = await seedMember("en-licencia-con-calendario@eafit.edu.co");
    const old = await getOrCreateCalendarToken(personId);

    await changeMembershipStatusAs({ personId: board }, personId, {
      to: "ON_LEAVE",
      reason: "Intercambio",
      leaveUntil: leaveUntilSoon(),
    });
    await drainOutbox();
    expect(await tokensOf(personId)).toEqual([{ token: old }]);

    await changeMembershipStatusAs({ personId: board }, personId, {
      to: "ACTIVE",
      reason: "Regresó",
    });
    await drainOutbox();
    expect(await getOrCreateCalendarToken(personId)).toBe(old);
  });

  it.each([
    ["crear", (personId: string) => getOrCreateCalendarToken(personId)],
    ["regenerar", (personId: string) => rotateCalendarTokenAs({ personId })],
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
      leaving = endMembershipAs({ personId: board }, personId, SALIDA).then(() => drainOutbox());
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
});
