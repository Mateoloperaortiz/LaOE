import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getDb } from "@/db/client";
import {
  type ConfigKey,
  type ConfigValue,
  checkBackup,
  getConfig,
  setConfigAs,
  setPrivacyPolicyVersionAs,
} from "@/modules/system";
import { seedPerson } from "../factories";
import { truncateAll } from "./db";

// La caché de `getConfig` por la interfaz pública de `system`: un comando cambia una clave y otra lectura
// cae cuando el cambio ya está escrito y su transacción todavía no confirma (DT-076, ADR-113 regla 9).
// Esa ventana se abre deteniendo el commit: un trigger diferido de la prueba, que corre al confirmar,
// pide un candado consultivo que la prueba tiene tomado en otra sesión.

const HOUR = 60 * 60_000;
const NOW = new Date("2026-10-07T15:00:00.000Z");

function barrier() {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function dropCommitHold(): Promise<void> {
  await getDb().execute(sql`
    drop trigger if exists hold_config_commit on app_config;
    drop function if exists hold_config_commit();
  `);
}

/** Desde acá, toda transacción que escriba `app_config` se queda en su commit hasta que se suelte. */
async function holdConfigCommits(): Promise<() => Promise<void>> {
  await dropCommitHold();
  await getDb().execute(sql`
    create function hold_config_commit() returns trigger language plpgsql as $$
    begin
      perform pg_advisory_xact_lock(7130, 76);
      return null;
    end $$;
    create constraint trigger hold_config_commit after insert or update on app_config
    deferrable initially deferred for each row execute function hold_config_commit();
  `);
  const taken = barrier();
  const freed = barrier();
  const holding = getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(7130, 76)`);
    taken.release();
    await freed.promise;
  });
  await Promise.race([taken.promise, holding]);
  return async () => {
    freed.release();
    await holding;
  };
}

/** Evidencia de PostgreSQL de que un commit espera el candado: se espera un hecho, no un tiempo. */
async function commitWaiting(): Promise<void> {
  await vi.waitFor(
    async () => {
      const result = await getDb().execute<{ waiting: boolean }>(sql`
        select exists (
          select 1 from pg_locks
          where locktype = 'advisory' and not granted and classid = 7130 and objid = 76
            and database = (select oid from pg_database where datname = current_database())
        ) as waiting
      `);
      expect(result.rows[0]?.waiting).toBe(true);
    },
    { timeout: 5000, interval: 10 },
  );
}

/** Corre el cambio y devuelve lo que lee `getConfig` cuando ya está escrito y todavía no confirma. */
async function readBeforeCommit<K extends ConfigKey>(
  key: K,
  change: () => Promise<unknown>,
): Promise<ConfigValue<K> | null> {
  const release = await holdConfigCommits();
  const changing = change();
  let seen: ConfigValue<K> | null;
  try {
    await commitWaiting();
    seen = await getConfig(key);
  } finally {
    await release();
    await Promise.allSettled([changing]);
    await dropCommitHold();
  }
  await changing;
  return seen;
}

describe("caché de configuración ante un cambio", () => {
  beforeEach(truncateAll);
  afterAll(async () => {
    await dropCommitHold();
    await closeDb();
  });

  it("un ajuste cambiado se lee apenas confirma, aunque otra lectura haya caído antes del commit", async () => {
    const admin = await seedPerson("config.admin@eafit.edu.co");
    expect(await getConfig("gamification.enabled")).toBe(false);

    const seen = await readBeforeCommit("gamification.enabled", () =>
      setConfigAs({ personId: admin, ip: null }, "gamification.enabled", true),
    );

    // Sin confirmar, el cambio todavía no existe para nadie más.
    expect(seen).toBe(false);
    expect(await getConfig("gamification.enabled")).toBe(true);
  });

  it("la versión de la política de datos se lee apenas confirma, con una lectura antes del commit", async () => {
    const admin = await seedPerson("config.admin@eafit.edu.co");
    await setPrivacyPolicyVersionAs({ personId: admin, ip: null }, "prueba-v2");
    expect(await getConfig("privacy.policyVersion")).toBe("prueba-v2");

    const seen = await readBeforeCommit("privacy.policyVersion", () =>
      setPrivacyPolicyVersionAs({ personId: admin, ip: null }, "prueba-v3"),
    );

    expect(seen).toBe("prueba-v2");
    expect(await getConfig("privacy.policyVersion")).toBe("prueba-v3");
  });

  it("el control diario de la copia externa se lee apenas confirma, con una lectura antes del commit", async () => {
    const earlier = new Date(NOW.getTime() - HOUR);
    await checkBackup(earlier);
    expect(await getConfig("backup.status")).toMatchObject({ checkedAt: earlier.toISOString() });

    const seen = await readBeforeCommit("backup.status", () => checkBackup(NOW));

    expect(seen).toMatchObject({ checkedAt: earlier.toISOString() });
    expect(await getConfig("backup.status")).toMatchObject({ checkedAt: NOW.toISOString() });
  });
});
