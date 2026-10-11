import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import type { Tx } from "@/db/tx";
import { clearConfigCache } from "@/modules/system/domain/config";
import { TEST_POLICY_VERSION } from "../factories/policy-version";

// Deja la base de pruebas como recién migrada entre una prueba y la siguiente: las tablas de `public`
// sin filas y los catálogos de migración como en la foto que tomó la preparación de la suite (ADR-124).

// Los catálogos que llenan las migraciones y que las pruebas necesitan. Son los únicos nombres de tabla
// escritos en este archivo, y `tests/unit/test-emptying-table-names.test.ts` no admite otros. No se
// pueden deducir: las migraciones también llenan `page` y `event` con filas literales, y esas quedan
// vacías. Un catálogo nuevo que una migración llene se suma acá; si no, queda vacío y su prueba falla
// a la vista.
const CATALOGS = ["app_config", "badge_definition", "committee_role", "macroevent_role"];

// Dónde queda la foto de los catálogos: un esquema de la base de pruebas que no es `public`, así el
// vaciado no la alcanza, ni es de los que crea `e2e-baseline.test.ts`.
const BASELINE_SCHEMA = "catalog_baseline";

/**
 * Guarda la foto de los catálogos como los dejan las migraciones (ADR-124 regla 2). La toma
 * `global-setup.ts` después de migrar, una vez por corrida. Vive en la base y no en memoria porque
 * ese es otro proceso que el de las pruebas. Cubre solo los catálogos: con todo `public` volverían
 * las filas de `page` y `event`. La versión de la política queda en su valor de prueba.
 */
export async function saveCatalogBaseline(): Promise<void> {
  const baseline = sql.identifier(BASELINE_SCHEMA);
  await getDb().transaction(async (tx) => {
    await tx.execute(sql`drop schema if exists ${baseline} cascade`);
    await tx.execute(sql`create schema ${baseline}`);
    for (const table of CATALOGS) {
      const name = sql.identifier(table);
      await tx.execute(sql`create table ${baseline}.${name} as table public.${name}`);
    }
    const versioned = await tx.execute(sql`
      update ${baseline}.app_config set value = to_jsonb(${TEST_POLICY_VERSION}::text)
      where key = 'privacy.policyVersion'
    `);
    if (versioned.rowCount !== 1) {
      throw new Error(
        "La foto de los catálogos no encontró privacy.policyVersion: ¿una migración le cambió el nombre?",
      );
    }
  });
}

const CATALOG_TABLES = CATALOGS.map((table) => `public.${table}`);

// Lo que haya en los catálogos sale antes de llenarlos. Tras el vaciado no queda nada; solo trae filas
// si algo escribió entre el borrado y el llenado, o si otro vaciado ya los llenó.
const EMPTY_CATALOGS_SQL = `with ${CATALOG_TABLES.map(
  (table, index) => `d${index} as (delete from ${table})`,
).join(", ")} select 1`;

// Una sola sentencia vuelve a llenar los cuatro catálogos con las filas de la foto, en el orden en que
// la foto las guarda. Las claves foráneas se revisan al terminar la sentencia, así que el cargo que
// nombra a otro como su reemplazo no depende del orden.
const REFILL_SQL = `with ${CATALOGS.map(
  (table, index) =>
    `c${index} as (insert into public.${table} select * from ${BASELINE_SCHEMA}.${table})`,
).join(", ")} select 1`;

/**
 * Corre `work` en una transacción que tiene `tables` bajo `ACCESS EXCLUSIVE`, el candado que tomaba
 * `TRUNCATE`, y sin los disparadores de las claves foráneas (el PostgreSQL de pruebas usa un
 * superusuario, como la E2E). El candado espera a quien todavía escribe en ellas.
 */
function underLock<T>(tables: string[], work: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('session_replication_role', 'replica', true)`);
    await tx.execute(sql.raw(`lock table ${tables.join(", ")} in access exclusive mode`));
    return work(tx);
  });
}

/**
 * Las tablas que se vacían: todas las de `public` (ADR-124 reglas 1 y 3). La lista sale de PostgreSQL
 * en cada vaciado, así que una tabla nueva entra sola, referencie o no a otra. El filtro por esquema
 * importa: en la misma base viven `drizzle`, con el registro de migraciones, la foto de los catálogos
 * y los esquemas que crea `e2e-baseline.test.ts`. Los nombres salen con su esquema, para que las
 * sentencias alcancen lo mismo que el filtro.
 */
async function tablesToEmpty(): Promise<string[]> {
  const { rows } = await getDb().execute<{ name: string }>(sql`
    select format('%I.%I', schemaname, tablename) as name
    from pg_tables
    where schemaname = 'public'
    order by 1
  `);
  return rows.map((row) => row.name);
}

export async function truncateAll(): Promise<void> {
  const tables = await tablesToEmpty();
  // Borrar y no truncar: `TRUNCATE` le crea a PostgreSQL un archivo nuevo por tabla, por TOAST y por
  // índice en cada prueba, y la suite le dejaba al checkpoint siguiente cerca de un millón (DT-188).
  // Todo en una transacción y bajo candado: sin los disparadores de las claves foráneas el orden entre
  // tablas no importa. Una sola sentencia borra todas y devuelve cuáles tenían filas.
  const used = await underLock(tables, async (tx) => {
    const { rows } = await tx.execute<{ name: string }>(
      sql.raw(`with ${tables.map((table, index) => `d${index} as (delete from ${table} returning 1)`).join(", ")}
        ${tables.map((table, index) => `select '${table}' as name where exists (select 1 from d${index})`).join(" union all ")}`),
    );
    return rows.map((row) => row.name);
  });
  // `VACUUM` devuelve a cero páginas las tablas que tenían filas, sin darles un archivo nuevo: las
  // filas de la prueba siguiente vuelven a quedar en el orden en que se insertan, como tras un truncado.
  // Sin esto el orden físico deja de coincidir con el de inserción y una prueba que lee sin `order by`
  // se vuelve inestable.
  if (used.length > 0) {
    await getDb().execute(sql.raw(`vacuum ${used.join(", ")}`));
  }
  // Los catálogos se borraron con las demás tablas y vuelven de la foto, no de lo que dejó la prueba
  // anterior (ADR-124 regla 3). Van después del `VACUUM`, sobre páginas en blanco: así quedan en el
  // orden de la foto, tenga el tamaño que tenga cada uno. Y van bajo su candado, borrando antes lo que
  // encuentren: lo que algo haya escrito desde el borrado, u otro vaciado que ya los llenó, no choca
  // con las filas de la foto. Si un vaciado falla antes de llegar acá, el siguiente los repone igual.
  await underLock(CATALOG_TABLES, async (tx) => {
    await tx.execute(sql.raw(EMPTY_CATALOGS_SQL));
    await tx.execute(sql.raw(REFILL_SQL));
  });
  clearConfigCache();
}
